import { Logger } from '@nestjs/common';

import { Wizard, WizardStep, Ctx, Action } from 'nestjs-telegraf';
import { Markup } from 'telegraf';

import { SCENES } from '../../config';
import { JobService } from '../../../job';
import { FormAnalyzerService } from '../../../form-analyzer';

import type { BotContext } from '../../interfaces';

const MAX_ENTRIES = 200;
const GOOGLE_FORM_PREFIX = 'https://docs.google.com/forms';

const getBackKeyboard = () => Markup.keyboard([['⬅️ Back']]).resize();

const clearJobSession = (ctx: BotContext) => {
  ctx.session.jobName = undefined;
  ctx.session.jobFormUrl = undefined;
  ctx.session.jobIsMultiPage = undefined;
  ctx.session.jobEntries = undefined;
  ctx.session.jobAnalysis = undefined;
  ctx.session.jobTotalPrice = undefined;
};

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
      `⚡ *New Auto-Fill*\n\n` +
        `Paste your Google Form URL below and I'll analyze it instantly.\n\n` +
        `_Example: https://docs.google.com/forms/d/..._`,
      { parse_mode: 'Markdown', ...getBackKeyboard() },
    );
    ctx.wizard.next();
  }

  @WizardStep(2)
  async validateUrl(@Ctx() ctx: BotContext) {
    const text =
      ctx.message && 'text' in ctx.message ? ctx.message.text.trim() : '';

    if (text === '⬅️ Back') {
      clearJobSession(ctx);
      await ctx.scene.enter(SCENES.DASHBOARD);
      return;
    }

    if (!text.startsWith(GOOGLE_FORM_PREFIX)) {
      await ctx.reply(
        `❌ That doesn't look like a Google Form URL.\n\n` +
          `Make sure it starts with:\n\`${GOOGLE_FORM_PREFIX}\``,
        { parse_mode: 'Markdown' },
      );
      return;
    }

    const analyzing = await ctx.reply('🔍 Analyzing form, please wait...');

    try {
      const analysis = await this.formAnalyzerService.analyze(text, 1);
      const price = analysis.price!;

      ctx.session.jobFormUrl = text;
      ctx.session.jobName = analysis.title;
      ctx.session.jobIsMultiPage = analysis.isMultiPage;
      ctx.session.jobAnalysis = {
        title: analysis.title,
        pageCount: analysis.pageCount,
        fieldCount: analysis.fieldCount,
      };

      const discountLine =
        price.discountPercent > 0
          ? `\n   └ Loyalty discount: -${price.discountPercent}% (-${price.discountAmount} UZS)`
          : '';
      const complexityConnector = price.discountPercent > 0 ? '├' : '└';

      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        analyzing.message_id,
        undefined,
        `✅ *Form Analyzed!*\n\n` +
          `📋 *${analysis.title}*\n` +
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

      const getEntriesKeyboard = () => {
        const presets = [10, 25, 50, 75, 100];
        const buttons = presets.map((e) => {
          const discount =
            this.formAnalyzerService.getLoyaltyDiscountPercent(e);
          return discount > 0 ? `${e} (-${discount}%)` : `${e}`;
        });

        return Markup.keyboard([
          buttons.slice(0, 2),
          buttons.slice(2, 4),
          [buttons[4]],
          ['⬅️ Back'],
        ]).resize();
      };

      await ctx.reply(
        `🔢 *How many entries?*\n\n` +
          `Type any number from 1 to ${MAX_ENTRIES}, or pick a preset:\n\n` +
          `🎁 *Loyalty discounts:*\n` +
          `• 11–30 entries: *15% off*\n` +
          `• 31–70 entries: *25% off*\n` +
          `• 71–120 entries: *40% off*\n` +
          `• 121+ entries: *55% off*`,
        {
          parse_mode: 'Markdown',
          ...getEntriesKeyboard(),
        },
      );

      ctx.wizard.next();
    } catch (e) {
      this.logger.error(e);
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        analyzing.message_id,
        undefined,
        `❌ *Couldn't analyze this form.*\n\n` +
          `Possible reasons:\n` +
          `• The form is private or restricted\n` +
          `• The URL is incorrect\n` +
          `• The form has been deleted\n\n` +
          `Please check and try a different URL:`,
      );
    }
  }

  @WizardStep(3)
  async validateEntries(@Ctx() ctx: BotContext) {
    const text =
      ctx.message && 'text' in ctx.message ? ctx.message.text.trim() : '';

    if (text === '⬅️ Back') {
      ctx.wizard.back();
      await ctx.reply(`🔗 Send me the Google Form URL again:`, {
        parse_mode: 'Markdown',
        ...getBackKeyboard(),
      });
      return;
    }

    const entries = parseInt(text);

    if (isNaN(entries) || entries <= 0 || entries > MAX_ENTRIES) {
      await ctx.reply(
        `❌ Please enter a number between *1* and *${MAX_ENTRIES}*:`,
        { parse_mode: 'Markdown' },
      );
      return;
    }

    const calculating = await ctx.reply('⚙️ Calculating price...');

    try {
      ctx.session.jobEntries = entries;

      const analysis = await this.formAnalyzerService.analyze(
        ctx.session.jobFormUrl!,
        entries,
      );

      const price = analysis.price!;
      ctx.session.jobTotalPrice = price.totalFormatted;

      const discountLine =
        price.discountPercent > 0
          ? `\n   └ Loyalty discount: -${price.discountPercent}% (-${price.discountAmount} UZS)`
          : '';

      const complexityConnector = price.discountPercent > 0 ? '├' : '└';

      await ctx.telegram.deleteMessage(ctx.chat!.id, calculating.message_id);

      await ctx.reply(
        `📋 *Order Summary*\n` +
          `━━━━━━━━━━━━━━━━━━\n` +
          `📝 *${ctx.session.jobName}*\n` +
          `📄 Pages: ${analysis?.pageCount ?? 1}\n` +
          `❓ Fields: ${analysis?.fieldCount ?? '?'}\n` +
          `🔢 Entries: *${entries}*\n\n` +
          `💳 *Price Breakdown*\n` +
          `━━━━━━━━━━━━━━━━━━\n` +
          `Per submission: *${price.formatted}*\n` +
          `   ├ Base: ${price.basePrice} UZS\n` +
          `   ${complexityConnector} Complexity fee: +${price.fieldSurcharge} UZS` +
          discountLine +
          `\n\n× ${entries} entries\n` +
          `🏷 *Total: ${price.totalFormatted}*`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('✅ Confirm & Pay', 'job_confirm')],
            [Markup.button.callback('✏️ Change Entries', 'job_change_entries')],
            [Markup.button.callback('🚫 Cancel', 'job_cancel_create')],
          ]),
        },
      );
    } catch (e) {
      this.logger.error(e);
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        calculating.message_id,
        undefined,
        `❌ *Something went wrong while calculating the price.*\n\nPlease try again or send a different URL:`,
        { parse_mode: 'Markdown' },
      );
      return;
    }
  }

  @Action('job_change_entries')
  async onChangeEntries(@Ctx() ctx: BotContext) {
    await ctx.answerCbQuery();
    await ctx.editMessageText(
      `✏️ *Change entries*\n\nEnter a new number from 1 to ${MAX_ENTRIES}:\n\n_More entries = better loyalty discount 🎁_`,
      { parse_mode: 'Markdown' },
    );
    ctx.wizard.selectStep(3);
  }

  @Action('job_confirm')
  async onConfirm(@Ctx() ctx: BotContext) {
    await ctx.answerCbQuery('⏳ Creating job...');

    try {
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
      clearJobSession(ctx);

      await ctx.editMessageText(
        `🎉 *Submission Created!*\n\n` +
          `📝 *${job.name}*\n` +
          `🔢 Entries: ${job.entries}\n` +
          `💰 Charged: *${totalPrice}*\n\n` +
          `_Your job is queued and will start shortly._`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('▶️ Run Now', `job_run:${job.id}`)],
          ]),
        },
      );
    } catch (e) {
      this.logger.error(e);
      await ctx.answerCbQuery('❌ Failed to create job');
      await ctx.reply(
        `❌ *Failed to create the job.*\n\nYour balance has not been charged. Please try again.`,
        { parse_mode: 'Markdown' },
      );
    }

    await ctx.scene.leave();
  }

  @Action('job_cancel_create')
  async onCancelCreate(@Ctx() ctx: BotContext) {
    await ctx.answerCbQuery();
    clearJobSession(ctx);
    await ctx.editMessageText('🚫 Cancelled.');
    await ctx.scene.enter(SCENES.DASHBOARD);
  }
}
