import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';
import { JobService } from './job.service';
import { PrismaService } from '../../common';
import { UserService } from '../user';
import { botConfig } from '../telegram/config';
import type { BotContext } from '../telegram/interfaces';
import { JobStatus } from '../../../generated/prisma/enums';

const PROGRESS_UPDATE_EVERY = 10; // update every 10 submissions

@Processor('form-filler', { concurrency: 2 })
export class FormFillerProcessor extends WorkerHost {
  private readonly logger = new Logger(FormFillerProcessor.name);

  constructor(
    private readonly jobService: JobService,
    private readonly prisma: PrismaService,
    private readonly userService: UserService,
    @InjectBot(botConfig.NAME) private readonly bot: Telegraf<BotContext>,
  ) {
    super();
  }

  @OnWorkerEvent('active')
  onActive(job: Job) {
    this.logger.log(`Job #${job.data.jobId} started`);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`Job #${job.data.jobId} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Job #${job.data.jobId} failed: ${error.message}`);
  }

  @OnWorkerEvent('error')
  onError(error: Error) {
    this.logger.error(`Worker error: ${error.message}`);
  }

  async process(job: Job<{ jobId: number; startFrom?: number }>) {
    this.logger.log(`Processing job ${job.id}`);

    const { jobId, startFrom = 0 } = job.data;

    const dbJob = await this.prisma.job.findUnique({
      where: { id: +jobId },
      include: { user: { include: { accounts: true } } },
    });

    if (!dbJob) throw new Error(`Job ${jobId} not found`);

    const account = dbJob.user.accounts.find((a) => a.provider === 'telegram');
    if (!account)
      throw new Error(`No telegram account for user ${dbJob.userId}`);

    const telegramId = account.providerId;

    await this.jobService.updateStatus(+jobId, JobStatus.RUNNING);

    // send initial progress message and keep its id to edit later
    const progressMsg = await this.bot.telegram.sendMessage(
      telegramId,
      this.formatProgress(+jobId, startFrom, dbJob.entries),
      { parse_mode: 'Markdown' },
    );

    let completed = startFrom;

    try {
      for (let i = startFrom; i < dbJob.entries; i++) {
        // check if job was cancelled or paused mid-run
        const current = await this.jobService.getJob(+jobId);
        if (
          current?.status === JobStatus.CANCELLED ||
          current?.status === JobStatus.PAUSED
        ) {
          this.logger.log(`Job #${jobId} was ${current.status}, stopping`);
          return;
        }

        // your form submission logic here:
        // await submitSingleForm(dbJob.formUrl, dbJob.isMultiPage);
        await new Promise((resolve) => setTimeout(resolve, 1000));

        completed++;

        // update progress every N submissions
        if (
          completed % PROGRESS_UPDATE_EVERY === 0 ||
          completed === dbJob.entries
        ) {
          await this.jobService.updateProgress(+jobId, completed);

          await this.bot.telegram.editMessageText(
            telegramId,
            progressMsg.message_id,
            undefined,
            this.formatProgress(jobId, completed, dbJob.entries),
            { parse_mode: 'Markdown' },
          );
        }
      }

      await this.jobService.updateStatus(+jobId, JobStatus.DONE);

      await this.bot.telegram.editMessageText(
        telegramId,
        progressMsg.message_id,
        undefined,
        `✅ *Job #${jobId} completed!*\n\n🔢 ${dbJob.entries}/${dbJob.entries} entries submitted.`,
        { parse_mode: 'Markdown' },
      );
    } catch (error) {
      this.logger.error(`Job #${jobId} failed: ${error}`);
      await this.jobService.updateStatus(+jobId, JobStatus.FAILED);

      await this.bot.telegram.editMessageText(
        telegramId,
        progressMsg.message_id,
        undefined,
        `❌ *Job #${jobId} failed!*\n\n✅ ${completed}/${dbJob.entries} submitted before failure.`,
        { parse_mode: 'Markdown' },
      );

      throw error;
    } finally {
      console.log('completed');
    }
  }

  private formatProgress(jobId: number, done: number, total: number): string {
    const percent = Math.round((done / total) * 100);
    const filled = Math.round(percent / 10);
    const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);

    return (
      `⚙️ *Job #${jobId} running...*\n\n` +
      `${bar} ${percent}%\n` +
      `🔢 ${done}/${total} entries submitted`
    );
  }
}
