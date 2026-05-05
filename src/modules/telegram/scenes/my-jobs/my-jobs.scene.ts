import { Scene, SceneEnter, On, Ctx } from 'nestjs-telegraf';
import { Markup } from 'telegraf';

import { SCENES } from '../../config';
import { JobService } from '../../../job';

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

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pending',
  RUNNING: 'Running',
  PAUSED: 'Paused',
  DONE: 'Done',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
};

const ACTIVE_STATUSES = new Set(['PENDING', 'RUNNING', 'PAUSED']);
const DONE_STATUSES = new Set(['DONE', 'FAILED', 'CANCELLED']);

const getNavKeyboard = (page: number, totalPages: number) => {
  const row: string[] = [];
  if (page > 0) row.push('◀️ Prev');
  if (page < totalPages - 1) row.push('▶️ Next');
  return Markup.keyboard([row, ['⬅️ Back']]).resize();
};

function buildProgressBar(percent: number): string {
  const filled = Math.round(percent / 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

@Scene(SCENES.MY_JOBS)
export class MyJobsScene {
  constructor(private readonly jobService: JobService) {}

  @SceneEnter()
  async onEnter(@Ctx() ctx: BotContext) {
    ctx.session.jobsPage = 0;
    await this.showJobs(ctx);
  }

  private async showJobs(ctx: BotContext) {
    const allJobs = await this.jobService.getJobs(ctx.session.userId!);

    if (allJobs.length === 0) {
      await ctx.reply(
        `📭 *No submissions yet*\n\nStart your first auto-fill and results will appear here.`,
        { parse_mode: 'Markdown', ...Markup.keyboard([['⬅️ Back']]).resize() },
      );
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

      return (
        `${STATUS_EMOJI[job.status]} *${job.name}*\n` +
        `Status: ${STATUS_LABEL[job.status]}  •  ${date}\n` +
        `${buildProgressBar(percent)} ${job.progress}/${job.entries} (${percent}%)`
      );
    };

    let message = `📋 *Your Submissions* (${allJobs.length}) — Page ${page + 1}/${totalPages}\n\n`;

    if (active.length > 0) {
      message += `*🔄 Active*\n`;
      message += active.map(formatJob).join('\n\n');
    }

    if (done.length > 0) {
      if (active.length > 0) message += '\n\n';
      message += `*✔️ Completed*\n`;
      message += done.map(formatJob).join('\n\n');
    }

    await ctx.reply(message, {
      parse_mode: 'Markdown',
      ...getNavKeyboard(page, totalPages),
    });
  }

  @On('text')
  async onText(@Ctx() ctx: BotContext) {
    const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';

    switch (text) {
      case '▶️ Next':
        ctx.session.jobsPage = (ctx.session.jobsPage ?? 0) + 1;
        await this.showJobs(ctx);
        break;

      case '◀️ Prev':
        ctx.session.jobsPage = Math.max(0, (ctx.session.jobsPage ?? 0) - 1);
        await this.showJobs(ctx);
        break;

      case '⬅️ Back':
        ctx.session.jobsPage = undefined;
        await ctx.scene.enter(SCENES.DASHBOARD);
        break;
    }
  }
}
