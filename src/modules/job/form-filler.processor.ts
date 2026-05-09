import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';
import { JobService } from './job.service';
import { PrismaService } from '../../common';
import { UserService } from '../user';
import { TranslateService } from '../translate';
import { botConfig } from '../telegram/config';
import type { BotContext } from '../telegram/interfaces';
import { JobStatus } from '../../../generated/prisma/enums';
import { FormAnalyzerService } from '../form-analyzer';
import { FormSubmitterService } from '../form-submitter';

const PROGRESS_UPDATE_EVERY = 10;

@Processor('form-filler', { concurrency: 2 })
export class FormFillerProcessor extends WorkerHost {
  private readonly logger = new Logger(FormFillerProcessor.name);

  constructor(
    private readonly jobService: JobService,
    private readonly prisma: PrismaService,
    private readonly userService: UserService,
    private readonly formAnalyzerService: FormAnalyzerService,
    private readonly formSubmitterService: FormSubmitterService,
    private readonly t: TranslateService,
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
    const locale = (dbJob.user.locale ?? 'en') as 'en' | 'ru' | 'uz';

    await this.jobService.updateStatus(+jobId, JobStatus.RUNNING);

    const progressMsg = await this.bot.telegram.sendMessage(
      telegramId,
      this.formatProgress(+jobId, startFrom, dbJob.entries, locale),
      { parse_mode: 'Markdown' },
    );

    try {
      const analysis = await this.formAnalyzerService.analyze(
        dbJob.formUrl,
        dbJob.entries,
      );
      const formId = analysis.formId;

      await this.formSubmitterService.submitMany({
        formId,
        analysis,
        count: dbJob.entries - startFrom,
        delayMs: 1000,
        onProgress: async (completed) => {
          const total = completed + startFrom;

          await this.jobService.updateProgress(+jobId, total);

          if (total % PROGRESS_UPDATE_EVERY === 0 && total !== dbJob.entries) {
            await this.bot.telegram.editMessageText(
              telegramId,
              progressMsg.message_id,
              undefined,
              this.formatProgress(jobId, total, dbJob.entries, locale),
              { parse_mode: 'Markdown' },
            );
          }
        },
      });

      await this.jobService.updateStatus(+jobId, JobStatus.DONE);
      await this.jobService.updateProgress(+jobId, dbJob.entries);

      await this.bot.telegram.editMessageText(
        telegramId,
        progressMsg.message_id,
        undefined,
        this.formatProgress(jobId, dbJob.entries, dbJob.entries, locale),
        { parse_mode: 'Markdown' },
      );

      await this.bot.telegram.sendMessage(
        telegramId,
        this.t.t('new_job.completed', locale, {
          id: String(jobId),
          name: dbJob.name,
          done: String(dbJob.entries),
          total: String(dbJob.entries),
        }),
        { parse_mode: 'Markdown' },
      );
    } catch (error) {
      this.logger.error(`Job #${jobId} failed: ${error}`);
      await this.jobService.updateStatus(+jobId, JobStatus.FAILED);

      await this.bot.telegram.sendMessage(
        telegramId,
        this.t.t('new_job.failed', locale, { id: String(jobId) }),
        { parse_mode: 'Markdown' },
      );

      throw error;
    }
  }

  private formatProgress(
    jobId: number,
    done: number,
    total: number,
    locale: 'en' | 'ru' | 'uz',
  ): string {
    const percent = Math.round((done / total) * 100);
    const filled = Math.round(percent / 10);
    const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);

    return this.t.t('new_job.progress', locale, {
      id: String(jobId),
      bar,
      percent: String(percent),
      done: String(done),
      total: String(total),
    });
  }
}
