import { Scene, SceneEnter, On, Ctx } from 'nestjs-telegraf';
import { Markup } from 'telegraf';

import { SCENES } from '../../config';
import { JobService } from '../../../job';
import { TranslateService } from '../../../translate';
import type { BotContext } from '../../interfaces';

const PAGE_SIZE = 5;

const STATUS_EMOJI: Record<string, string> = {
  PENDING: '⏳',
  RUNNING: '⚙️',
  PAUSED: '⏸',
  DONE: '✅',
  FAILED: '❌',
  CANCELLED: '🚫',
};

const ACTIVE_STATUSES = new Set(['PENDING', 'RUNNING', 'PAUSED']);
const DONE_STATUSES = new Set(['DONE', 'FAILED', 'CANCELLED']);

function buildProgressBar(percent: number): string {
  const filled = Math.round(percent / 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

@Scene(SCENES.MY_JOBS)
export class MyJobsScene {
  constructor(
    private readonly jobService: JobService,
    private readonly t: TranslateService,
  ) {}

  private lang(ctx: BotContext) {
    return ctx.session.locale ?? ctx.from?.language_code ?? 'en';
  }

  private getNavKeyboard(ctx: BotContext, page: number, totalPages: number) {
    const l = this.lang(ctx);
    const row: string[] = [];
    if (page > 0) row.push(this.t.t('my_jobs.btn_prev', l));
    if (page < totalPages - 1) row.push(this.t.t('my_jobs.btn_next', l));
    return Markup.keyboard([row, [this.t.t('my_jobs.btn_back', l)]]).resize();
  }

  @SceneEnter()
  async onEnter(@Ctx() ctx: BotContext) {
    ctx.session.jobsPage = 0;
    await this.showJobs(ctx);
  }

  private async showJobs(ctx: BotContext) {
    const l = this.lang(ctx);
    const allJobs = await this.jobService.getJobs(ctx.session.userId!);

    if (allJobs.length === 0) {
      await ctx.reply(this.t.t('my_jobs.empty', l), {
        parse_mode: 'Markdown',
        ...Markup.keyboard([[this.t.t('my_jobs.btn_back', l)]]).resize(),
      });
      return;
    }

    const page = ctx.session.jobsPage ?? 0;
    const totalPages = Math.ceil(allJobs.length / PAGE_SIZE);
    const paginated = allJobs.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

    const active = paginated.filter((j) => ACTIVE_STATUSES.has(j.status));
    const done = paginated.filter((j) => DONE_STATUSES.has(j.status));

    const formatJob = (job: (typeof allJobs)[0]) => {
      const percent =
        job.entries > 0 ? Math.round((job.progress / job.entries) * 100) : 0;
      const date = job.createdAt.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
      const statusLabel = this.t.t(
        `my_jobs.status_${job.status.toLowerCase()}`,
        l,
      );

      return (
        `${STATUS_EMOJI[job.status]} *${job.name}*\n` +
        `${statusLabel}  •  ${date}\n` +
        `${buildProgressBar(percent)} ${job.progress}/${job.entries} (${percent}%)`
      );
    };

    let message =
      this.t.t('my_jobs.title', l, {
        total: String(allJobs.length),
        page: String(page + 1),
        totalPages: String(totalPages),
      }) + '\n\n';

    if (active.length > 0) {
      message += this.t.t('my_jobs.section_active', l) + '\n';
      message += active.map(formatJob).join('\n\n');
    }

    if (done.length > 0) {
      if (active.length > 0) message += '\n\n';
      message += this.t.t('my_jobs.section_done', l) + '\n';
      message += done.map(formatJob).join('\n\n');
    }

    await ctx.reply(message, {
      parse_mode: 'Markdown',
      ...this.getNavKeyboard(ctx, page, totalPages),
    });
  }

  @On('text')
  async onText(@Ctx() ctx: BotContext) {
    const l = this.lang(ctx);
    const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';

    if (text === this.t.t('my_jobs.btn_next', l)) {
      ctx.session.jobsPage = (ctx.session.jobsPage ?? 0) + 1;
      await this.showJobs(ctx);
    } else if (text === this.t.t('my_jobs.btn_prev', l)) {
      ctx.session.jobsPage = Math.max(0, (ctx.session.jobsPage ?? 0) - 1);
      await this.showJobs(ctx);
    } else if (text === this.t.t('my_jobs.btn_back', l)) {
      ctx.session.jobsPage = undefined;
      await ctx.scene.enter(SCENES.DASHBOARD);
    }
  }
}
