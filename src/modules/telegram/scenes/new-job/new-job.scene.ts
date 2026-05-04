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

    const analyzing = await ctx.reply('🔍 Analyzing form, please wait...');

    try {
      const analysis = await this.formAnalyzerService.analyze(text, 1);

      ctx.session.jobFormUrl = text;
      ctx.session.jobName = analysis.title;
      ctx.session.jobIsMultiPage = analysis.isMultiPage;
      ctx.session.jobAnalysis = {
        title: analysis.title,
        pageCount: analysis.pageCount,
        fieldCount: analysis.fieldCount,
      };

      const price = analysis.price!;
      const discountLine =
        analysis.price!.discountPercent > 0
          ? `\n   └ Loyalty discount: -${price.discountPercent}% (-${price.discountAmount} UZS)`
          : '';
      const complexityConnector = price.discountPercent > 0 ? '├' : '└';

      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        analyzing.message_id,
        undefined,
        `✅ *Form analyzed!*\n\n` +
          `📋 Title: *${analysis.title}*\n` +
          `━━━━━━━━━━━━━━━━━━\n` +
          `📄 Pages: ${analysis.pageCount}\n` +
          `❓ Fields: ${analysis.fieldCount}\n` +
          `🔀 Multi-page: ${analysis.isMultiPage ? 'Yes' : 'No'}\n\n` +
          `💰 Price per submission: *${price.formatted}*\n` +
          `   ├ Base: ${price.basePrice} UZS\n` +
          `   ${complexityConnector} Complexity fee: +${price.fieldSurcharge} UZS (${analysis.fieldCount} fields)` +
          discountLine,
        { parse_mode: 'Markdown' },
      );
    } catch (e) {
      this.logger.error(e);
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        analyzing.message_id,
        undefined,
        '❌ Could not analyze the form. Please check the URL and try again:',
      );
      return;
    }

    await ctx.reply(
      '🔢 How many entries do you want to submit?\n\n_Enter a number between 1 and 200:_',
      { parse_mode: 'Markdown' },
    );
    ctx.wizard.next();
  }

  @WizardStep(3)
  async validateEntries(@Ctx() ctx: BotContext) {
    const text =
      ctx.message && 'text' in ctx.message ? ctx.message.text.trim() : '';

    const entries = parseInt(text);

    if (isNaN(entries) || entries <= 0 || entries > 200) {
      await ctx.reply('❌ Please enter a valid number between 1 and 200:');
      return;
    }

    const calculating = await ctx.reply('🔍 Calculating, please wait...');

    try {
      ctx.session.jobEntries = entries;

      const analysis = await this.formAnalyzerService.analyze(
        ctx.session.jobFormUrl!,
        entries,
      );

      const price = analysis.price!;
      const discountLine =
        price.discountPercent > 0
          ? `\n   └ Loyalty discount: -${price.discountPercent}% (-${price.discountAmount} UZS)`
          : '';

      const complexityConnector = price.discountPercent > 0 ? '├' : '└';

      ctx.session.jobTotalPrice = price.totalFormatted;

      await ctx.reply(
        `📋 *Job Summary*\n` +
          `━━━━━━━━━━━━━━━━━━\n` +
          `📝 *${ctx.session.jobName}*\n` +
          `📄 Pages: ${analysis?.pageCount ?? 1}\n` +
          `❓ Fields: ${analysis?.fieldCount ?? '?'}\n` +
          `🔢 Entries: *${entries}*\n\n` +
          `💳 *Payment Breakdown*\n` +
          `━━━━━━━━━━━━━━━━━━\n` +
          `Per submission: *${price.formatted}*\n` +
          `   ├ Base: ${price.basePrice} UZS\n` +
          `   ${complexityConnector} Complexity fee: +${price.fieldSurcharge} UZS (${analysis.fieldCount} fields)` +
          discountLine +
          '\n\n' +
          `× ${entries} entries\n` +
          `*Total: ${price.totalFormatted}*`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('✅ Confirm & Pay', 'job_confirm')],
            [Markup.button.callback('✏️ Change entries', 'job_change_entries')],
            [Markup.button.callback('❌ Cancel', 'job_cancel_create')],
          ]),
        },
      );
    } catch (e) {
      this.logger.error(e);
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        calculating.message_id,
        undefined,
        '❌ Something went wrong',
      );
      return;
    }
  }

  @Action('job_change_entries')
  async onChangeEntries(@Ctx() ctx: BotContext) {
    await ctx.answerCbQuery();
    await ctx.editMessageText(
      '🔢 How many entries do you want to submit?\n\n_Enter a number between 1 and 200:_',
      { parse_mode: 'Markdown' },
    );
    // stay on step 3 so next message re-validates
  }

  @Action('job_confirm')
  async onConfirm(@Ctx() ctx: BotContext) {
    await ctx.answerCbQuery('⏳ Creating job...');

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

    const totalPrice = ctx.session.jobTotalPrice;

    ctx.session.jobName = undefined;
    ctx.session.jobFormUrl = undefined;
    ctx.session.jobIsMultiPage = undefined;
    ctx.session.jobEntries = undefined;
    ctx.session.jobAnalysis = undefined;
    ctx.session.jobTotalPrice = undefined;

    await ctx.editMessageText(
      `🎉 *Job Created!*\n\n` +
        `📝 *${job.name}*\n` +
        `🔢 Entries: ${job.entries}\n` +
        `💰 Charged: *${totalPrice}*`,
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
    await ctx.answerCbQuery();

    ctx.session.jobName = undefined;
    ctx.session.jobFormUrl = undefined;
    ctx.session.jobIsMultiPage = undefined;
    ctx.session.jobEntries = undefined;
    ctx.session.jobAnalysis = undefined;

    await ctx.editMessageText('🚫 Job creation cancelled.');
    await ctx.scene.enter(SCENES.DASHBOARD);
  }
}
