import { Logger } from '@nestjs/common';
import { Wizard, WizardStep, Ctx, Action } from 'nestjs-telegraf';
import { Markup } from 'telegraf';

import { SCENES } from '../../config';
import { JobService } from '../../../job';
import { FormAnalyzerService } from '../../../form-analyzer';
import { TranslateService } from '../../../translate';
import type { BotContext } from '../../interfaces';
import { BalanceService } from '../../../balance';

const MAX_ENTRIES = 200;
const GOOGLE_FORM_PREFIX = 'https://docs.google.com/forms';

const clearJobSession = (ctx: BotContext) => {
  ctx.session.jobName = undefined;
  ctx.session.jobFormUrl = undefined;
  ctx.session.jobIsMultiPage = undefined;
  ctx.session.jobEntries = undefined;
  ctx.session.jobAnalysis = undefined;
  ctx.session.jobTotalPrice = undefined;
  ctx.session.jobPricePerEntry = undefined;
};

const getEntriesKeyboard = (formAnalyzerService: FormAnalyzerService) => {
  const presets = [10, 25, 50, 75, 100];
  const buttons = presets.map((e) => {
    const discount = formAnalyzerService.getLoyaltyDiscountPercent(e);
    return discount > 0 ? `${e} (-${discount}%)` : `${e}`;
  });
  return Markup.keyboard([
    buttons.slice(0, 2),
    buttons.slice(2, 4),
    [buttons[4]],
    ['⬅️ Back'],
  ]).resize();
};

const parseEntryText = (text: string): number => {
  const match = text.match(/^(\d+)/);
  return match ? parseInt(match[1], 10) : NaN;
};

@Wizard(SCENES.NEW_JOB)
export class NewJobScene {
  private readonly logger = new Logger(NewJobScene.name);

  constructor(
    private readonly jobService: JobService,
    private readonly formAnalyzerService: FormAnalyzerService,
    private readonly t: TranslateService,
    private readonly balanceService: BalanceService,
  ) {}

  private lang(ctx: BotContext) {
    return ctx.session.locale ?? ctx.from?.language_code ?? 'en';
  }

  private getBackKeyboard(ctx: BotContext) {
    const l = this.lang(ctx);
    return Markup.keyboard([[this.t.t('new_job.btn_back', l)]]).resize();
  }

  @WizardStep(1)
  async askUrl(@Ctx() ctx: BotContext) {
    const l = this.lang(ctx);
    await ctx.reply(this.t.t('new_job.ask_url', l), {
      parse_mode: 'Markdown',
      ...this.getBackKeyboard(ctx),
    });
    ctx.wizard.next();
  }

  @WizardStep(2)
  async validateUrl(@Ctx() ctx: BotContext) {
    const l = this.lang(ctx);
    const text =
      ctx.message && 'text' in ctx.message ? ctx.message.text.trim() : '';

    if (text === this.t.t('new_job.btn_back', l)) {
      clearJobSession(ctx);
      await ctx.scene.enter(SCENES.DASHBOARD);
      return;
    }

    if (!text.startsWith(GOOGLE_FORM_PREFIX)) {
      await ctx.reply(
        this.t.t('new_job.invalid_url', l, { prefix: GOOGLE_FORM_PREFIX }),
        { parse_mode: 'Markdown', ...this.getBackKeyboard(ctx) },
      );
      return;
    }

    const analyzing = await ctx.reply(this.t.t('new_job.analyzing', l));

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
      ctx.session.jobPricePerEntry = price.formatted;

      const discountLine =
        price.discountPercent > 0
          ? this.t.t('new_job.analyzed_discount', l, {
              percent: String(price.discountPercent),
              amount: String(price.discountAmount),
            })
          : '';
      const connector = price.discountPercent > 0 ? '├' : '└';

      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        analyzing.message_id,
        undefined,
        this.t.t('new_job.analyzed', l, {
          title: analysis.title,
          pages: String(analysis.pageCount),
          fields: String(analysis.fieldCount),
          multipage: analysis.isMultiPage
            ? this.t.t('new_job.multipage_yes', l)
            : this.t.t('new_job.multipage_no', l),
          price: price.formatted,
          base: String(price.basePrice),
          connector,
          surcharge: String(price.fieldSurcharge),
          discount: discountLine,
        }),
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback(
                this.t.t('new_job.btn_confirm_form', l),
                'job_confirm_form',
              ),
            ],
            [
              Markup.button.callback(
                this.t.t('new_job.btn_wrong_url', l),
                'job_wrong_url',
              ),
            ],
          ]),
        },
      );

      ctx.wizard.next();
    } catch (e) {
      this.logger.error(e);
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        analyzing.message_id,
        undefined,
        this.t.t('new_job.analyze_error', l),
        { parse_mode: 'Markdown' },
      );
    }
  }

  @WizardStep(3)
  async awaitFormConfirmation(@Ctx() ctx: BotContext) {
    await ctx.reply(this.t.t('new_job.await_confirmation', this.lang(ctx)));
  }

  @Action('job_confirm_form')
  async onConfirmForm(@Ctx() ctx: BotContext) {
    const l = this.lang(ctx);
    await ctx.answerCbQuery();
    await ctx.editMessageReplyMarkup(undefined);

    await ctx.reply(
      this.t.t('new_job.ask_entries', l, { max: String(MAX_ENTRIES) }),
      {
        parse_mode: 'Markdown',
        ...getEntriesKeyboard(this.formAnalyzerService),
      },
    );

    ctx.wizard.next();
  }

  @Action('job_wrong_url')
  async onWrongUrl(@Ctx() ctx: BotContext) {
    const l = this.lang(ctx);
    await ctx.answerCbQuery();
    clearJobSession(ctx);
    await ctx.editMessageReplyMarkup(undefined);

    await ctx.reply(this.t.t('new_job.wrong_url_prompt', l), {
      parse_mode: 'Markdown',
      ...this.getBackKeyboard(ctx),
    });

    ctx.wizard.selectStep(2);
  }

  @WizardStep(4)
  async validateEntries(@Ctx() ctx: BotContext) {
    const l = this.lang(ctx);
    const text =
      ctx.message && 'text' in ctx.message ? ctx.message.text.trim() : '';

    if (text === this.t.t('new_job.btn_back', l)) {
      const a = ctx.session.jobAnalysis!;
      const pricePerEntry = ctx.session.jobPricePerEntry ?? '—';

      await ctx.reply(
        this.t.t('new_job.analyzed', l, {
          title: a.title,
          pages: String(a.pageCount),
          fields: String(a.fieldCount),
          multipage: '',
          price: pricePerEntry,
          base: '',
          connector: '└',
          surcharge: '',
          discount: '',
        }),
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback(
                this.t.t('new_job.btn_confirm_form', l),
                'job_confirm_form',
              ),
            ],
            [
              Markup.button.callback(
                this.t.t('new_job.btn_wrong_url', l),
                'job_wrong_url',
              ),
            ],
          ]),
        },
      );

      ctx.wizard.selectStep(3);
      return;
    }

    const entries = parseEntryText(text);

    if (isNaN(entries) || entries <= 0 || entries > MAX_ENTRIES) {
      await ctx.reply(
        this.t.t('new_job.invalid_entries', l, { max: String(MAX_ENTRIES) }),
        { parse_mode: 'Markdown' },
      );
      return;
    }

    const calculating = await ctx.reply(this.t.t('new_job.calculating', l));

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
          ? this.t.t('new_job.analyzed_discount', l, {
              percent: String(price.discountPercent),
              amount: String(price.discountAmount),
            })
          : '';
      const connector = price.discountPercent > 0 ? '├' : '└';

      await ctx.telegram.deleteMessage(ctx.chat!.id, calculating.message_id);

      await ctx.reply(
        this.t.t('new_job.order_summary', l, {
          name: ctx.session.jobName!,
          pages: String(analysis.pageCount),
          fields: String(analysis.fieldCount),
          entries: String(entries),
          price: price.formatted,
          base: String(price.basePrice),
          connector,
          surcharge: String(price.fieldSurcharge),
          discount: discountLine,
          total: price.totalFormatted,
        }),
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback(
                this.t.t('new_job.btn_confirm', l),
                'job_confirm',
              ),
            ],
            [
              Markup.button.callback(
                this.t.t('new_job.btn_change_entries', l),
                'job_change_entries',
              ),
            ],
            [
              Markup.button.callback(
                this.t.t('new_job.btn_cancel', l),
                'job_cancel_create',
              ),
            ],
          ]),
        },
      );
    } catch (e) {
      this.logger.error(e);
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        calculating.message_id,
        undefined,
        this.t.t('new_job.price_error', l),
        { parse_mode: 'Markdown' },
      );
    }
  }

  @Action('job_change_entries')
  async onChangeEntries(@Ctx() ctx: BotContext) {
    const l = this.lang(ctx);
    await ctx.answerCbQuery();
    await ctx.editMessageText(
      this.t.t('new_job.change_entries_prompt', l, {
        max: String(MAX_ENTRIES),
      }),
      { parse_mode: 'Markdown' },
    );
    ctx.wizard.selectStep(4);
  }

  @Action('job_confirm')
  async onConfirm(@Ctx() ctx: BotContext) {
    const l = this.lang(ctx);
    await ctx.answerCbQuery('⏳');

    try {
      const balance = await this.balanceService.getBalance(ctx.session.userId!);
      const { price } = await this.formAnalyzerService.analyze(
        ctx.session.jobFormUrl!,
        ctx.session.jobEntries!,
      );
      const required = price!.totalPrice;

      if (balance!.amount.lessThan(required)) {
        const short = required - +balance!.amount;

        await ctx.answerCbQuery(this.t.t('new_job.insufficient_cb', l));

        await ctx.reply(
          this.t.t('new_job.insufficient', l, {
            balance: balance!.amount.toString(),
            required: price?.totalFormatted ?? '—',
            missing: short,
          }),
          {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
              [
                Markup.button.callback(
                  this.t.t('new_job.btn_top_up', l),
                  'balance_topup',
                ),
              ],
            ]),
            reply_parameters: ctx.callbackQuery?.message
              ? { message_id: ctx.callbackQuery.message.message_id }
              : undefined,
          },
        );
        return;
      }

      await this.balanceService.debit(ctx.session.userId!, required, '');

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
        this.t.t('new_job.job_created', l, {
          name: job.name,
          entries: String(job.entries),
          total: totalPrice ?? '—',
        }),
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback(
                this.t.t('new_job.btn_run_now', l),
                `job_run:${job.id}`,
              ),
            ],
          ]),
        },
      );
      await ctx.scene.enter(SCENES.DASHBOARD);
    } catch (e) {
      this.logger.error(e);
      await ctx.answerCbQuery('❌');
      await ctx.reply(this.t.t('new_job.job_failed', l), {
        parse_mode: 'Markdown',
      });
    }

    await ctx.scene.leave();
  }

  @Action('job_cancel_create')
  async onCancelCreate(@Ctx() ctx: BotContext) {
    const l = this.lang(ctx);
    await ctx.answerCbQuery();
    clearJobSession(ctx);
    await ctx.editMessageText(this.t.t('new_job.cancelled', l));
    await ctx.scene.enter(SCENES.DASHBOARD);
  }

  @Action('balance_topup')
  async onTopUp(@Ctx() ctx: BotContext) {
    await ctx.answerCbQuery();
    await ctx.scene.enter(SCENES.TOP_UP);
  }
}
