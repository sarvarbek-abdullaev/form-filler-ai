import { Wizard, WizardStep, Ctx, Action } from 'nestjs-telegraf';
import { Logger } from '@nestjs/common';
import { Markup } from 'telegraf';
import type { BotContext } from '../../interfaces';
import { SCENES } from '../../config';
import { JobService } from '../../../job';

@Wizard(SCENES.NEW_JOB)
export class NewJobScene {
  private readonly logger = new Logger(NewJobScene.name);

  constructor(private readonly jobService: JobService) {}

  @WizardStep(1)
  async askName(@Ctx() ctx: BotContext) {
    await ctx.reply('📝 Give this job a name:', Markup.removeKeyboard());
    ctx.wizard.next();
  }

  @WizardStep(2)
  async validateName(@Ctx() ctx: BotContext) {
    const text =
      ctx.message && 'text' in ctx.message ? ctx.message.text.trim() : '';

    if (!text || text.length < 2) {
      await ctx.reply('❌ Name must be at least 2 characters. Try again:');
      return;
    }

    ctx.session.jobName = text;
    await ctx.reply('🔗 Please send the Google Form URL:');
    ctx.wizard.next();
  }

  @WizardStep(3)
  async validateUrl(@Ctx() ctx: BotContext) {
    const text =
      ctx.message && 'text' in ctx.message ? ctx.message.text.trim() : '';

    if (!text.startsWith('https://docs.google.com/forms')) {
      await ctx.reply('❌ Invalid URL. Please send a valid Google Form URL:');
      return;
    }

    ctx.session.jobFormUrl = text;

    await ctx.reply(
      '🔢 How many entries do you want to submit?',
      Markup.removeKeyboard(),
    );
    ctx.wizard.next();
  }

  @WizardStep(4)
  async validateEntries(@Ctx() ctx: BotContext) {
    const text =
      ctx.message && 'text' in ctx.message ? ctx.message.text.trim() : '';

    const entries = parseInt(text);

    if (isNaN(entries) || entries <= 0 || entries > 10000) {
      await ctx.reply('❌ Please enter a valid number between 1 and 10000:');
      return;
    }

    ctx.session.jobEntries = entries;

    await ctx.reply(
      `📋 *Confirm your job:*\n\n` +
        `📝 Name: *${ctx.session.jobName}*\n` +
        `🔗 URL: ${ctx.session.jobFormUrl}\n` +
        `🔢 Entries: *${entries}*`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          Markup.button.callback('✅ Confirm & Save', 'job_confirm'),
          Markup.button.callback('❌ Cancel', 'job_cancel_create'),
        ]),
      },
    );
  }

  @Action('job_confirm')
  async onConfirm(@Ctx() ctx: BotContext) {
    const job = await this.jobService.createJob({
      userId: ctx.session.userId!,
      name: ctx.session.jobName!,
      formUrl: ctx.session.jobFormUrl!,
      isMultiPage: ctx.session.jobIsMultiPage ?? false,
      entries: ctx.session.jobEntries!,
    });

    this.logger.log(
      `Job #${job.id} "${job.name}" created for user ${ctx.session.userId}`,
    );

    ctx.session.jobName = undefined;
    ctx.session.jobFormUrl = undefined;
    ctx.session.jobIsMultiPage = undefined;
    ctx.session.jobEntries = undefined;

    await ctx.editMessageText(
      `✅ *Job Created!*\n\n` +
        `📝 Name: *${job.name}*\n` +
        `🔗 URL: ${job.formUrl}\n` +
        `🔢 Entries: *${job.entries}*`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          Markup.button.callback('▶️ Run Now', `job_run:${job.id}`),
        ]),
      },
    );

    await ctx.answerCbQuery(
      '⏳ Your job is created. Please run it whenever you want.',
    );
  }

  @Action('job_cancel_create')
  async onCancelCreate(@Ctx() ctx: BotContext) {
    ctx.session.jobName = undefined;
    ctx.session.jobFormUrl = undefined;
    ctx.session.jobIsMultiPage = undefined;
    ctx.session.jobEntries = undefined;

    await ctx.editMessageText('🚫 Job creation cancelled.');
    await ctx.scene.enter(SCENES.DASHBOARD);
  }

  @Action(/job_run:(\d+)/)
  async onRun(@Ctx() ctx: BotContext & { match: RegExpExecArray }) {
    const jobId = parseInt(ctx.match[1]);

    await this.jobService.runJob(jobId);

    await ctx.answerCbQuery('▶️ Job queued!');
    await ctx.editMessageReplyMarkup(Markup.inlineKeyboard([]).reply_markup);
  }
}
