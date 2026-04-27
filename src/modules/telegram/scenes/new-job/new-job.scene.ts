import { Wizard, WizardStep, Ctx, Action } from 'nestjs-telegraf';
import { Logger } from '@nestjs/common';
import { Markup } from 'telegraf';
import type { BotContext } from '../../interfaces';
import { SCENES } from '../../config';
import { JobService } from '../../../job';
import { FormAnalyzerService } from '../../../form-analyzer';

@Wizard(SCENES.NEW_JOB)
export class NewJobScene {
  private readonly logger = new Logger(NewJobScene.name);

  constructor(
    private readonly jobService: JobService,
    private readonly formAnalyzerService: FormAnalyzerService,
  ) {}

  @WizardStep(1)
  async askUrl(@Ctx() ctx: BotContext) {
    await ctx.reply(
      '🔗 Please send the Google Form URL:',
      Markup.removeKeyboard(),
    );
    ctx.wizard.next();
  }

  @WizardStep(2)
  async validateUrl(@Ctx() ctx: BotContext) {
    const text =
      ctx.message && 'text' in ctx.message ? ctx.message.text.trim() : '';

    if (!text.startsWith('https://docs.google.com/forms')) {
      await ctx.reply('❌ Invalid URL. Please send a valid Google Form URL:');
      return;
    }

    const analyzing = await ctx.reply('🔍 Analyzing form...');

    try {
      const analysis = await this.formAnalyzerService.analyze(text);

      ctx.session.jobFormUrl = text;
      ctx.session.jobName = analysis.title;
      ctx.session.jobIsMultiPage = analysis.isMultiPage;
      ctx.session.jobAnalysis = {
        title: analysis.title,
        pageCount: analysis.pageCount,
        fieldCount: analysis.fieldCount,
      };

      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        analyzing.message_id,
        undefined,
        `✅ *Form analyzed!*\n\n` +
          `📋 Title: *${analysis.title}*\n` +
          `📄 Pages: ${analysis.pageCount}\n` +
          `❓ Fields: ${analysis.fieldCount}\n` +
          `🔀 Multi-page: ${analysis.isMultiPage ? 'Yes' : 'No'}`,
        { parse_mode: 'Markdown' },
      );
    } catch {
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        analyzing.message_id,
        undefined,
        '❌ Could not analyze the form. Please check the URL and try again:',
      );
      return;
    }

    await ctx.reply('🔢 How many entries do you want to submit?');
    ctx.wizard.next();
  }

  @WizardStep(3)
  async validateEntries(@Ctx() ctx: BotContext) {
    const text =
      ctx.message && 'text' in ctx.message ? ctx.message.text.trim() : '';

    const entries = parseInt(text);

    if (isNaN(entries) || entries <= 0 || entries > 10000) {
      await ctx.reply('❌ Please enter a valid number between 1 and 10000:');
      return;
    }

    ctx.session.jobEntries = entries;

    const analysis = ctx.session.jobAnalysis;

    await ctx.reply(
      `📋 *Confirm your job:*\n\n` +
        `📝 Name: *${ctx.session.jobName}*\n` +
        `🔗 URL: ${ctx.session.jobFormUrl}\n` +
        `📄 Pages: ${analysis?.pageCount ?? 1}\n` +
        `❓ Fields: ${analysis?.fieldCount ?? '?'}\n` +
        `🔀 Multi-page: ${ctx.session.jobIsMultiPage ? 'Yes' : 'No'}\n` +
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
    ctx.session.jobAnalysis = undefined;

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

    await ctx.answerCbQuery('✅ Job created!');

    await ctx.scene.leave();
  }

  @Action('job_cancel_create')
  async onCancelCreate(@Ctx() ctx: BotContext) {
    ctx.session.jobName = undefined;
    ctx.session.jobFormUrl = undefined;
    ctx.session.jobIsMultiPage = undefined;
    ctx.session.jobEntries = undefined;
    ctx.session.jobAnalysis = undefined;

    await ctx.editMessageText('🚫 Job creation cancelled.');
    await ctx.scene.enter(SCENES.DASHBOARD);
  }
}
