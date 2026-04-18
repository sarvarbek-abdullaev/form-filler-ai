import { Scene, SceneEnter, On, Ctx } from 'nestjs-telegraf';
import { Logger } from '@nestjs/common';
import { Markup } from 'telegraf';
import type { BotContext } from '../../interfaces';
import { SCENES } from '../../config';
import { JobService } from '../../../job';
import { JobStatus } from '../../../../../generated/prisma/enums';

@Scene(SCENES.MY_JOBS)
export class MyJobsScene {
  private readonly logger = new Logger(MyJobsScene.name);

  constructor(private readonly jobService: JobService) {}

  @SceneEnter()
  async onEnter(@Ctx() ctx: BotContext) {
    await this.showJobs(ctx);
  }

  private async showJobs(ctx: BotContext) {
    const jobs = await this.jobService.getJobs(ctx.session.userId!);

    if (jobs.length === 0) {
      await ctx.reply(
        '📭 You have no jobs yet.',
        Markup.keyboard([['🔙 Back']]).resize(),
      );
      return;
    }

    await ctx.reply('📋 *Your Jobs:*', {
      parse_mode: 'Markdown',
      ...Markup.keyboard([['🔙 Back']]).resize(),
    });

    for (const job of jobs) {
      const statusEmoji = {
        [JobStatus.PENDING]: '⏳',
        [JobStatus.RUNNING]: '⚙️',
        [JobStatus.PAUSED]: '⏸',
        [JobStatus.DONE]: '✅',
        [JobStatus.FAILED]: '❌',
        [JobStatus.CANCELLED]: '🚫',
      }[job.status];

      const percent =
        job.entries > 0 ? Math.round((job.progress / job.entries) * 100) : 0;

      await ctx.reply(
        `${statusEmoji} *${job.name}* — #${job.id}\n` +
          `📄 Multi-page: ${job.isMultiPage ? 'Yes' : 'No'}\n` +
          `🔢 Progress: ${job.progress}/${job.entries} (${percent}%)\n` +
          `📅 ${job.createdAt.toLocaleDateString()}`,
        { parse_mode: 'Markdown' },
      );
    }
  }

  @On('text')
  async onText(@Ctx() ctx: BotContext) {
    const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
    if (text === '🔙 Back') {
      await ctx.scene.enter(SCENES.DASHBOARD);
    }
  }
}
