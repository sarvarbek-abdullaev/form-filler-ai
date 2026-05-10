import { Wizard, WizardStep, On, Ctx, Start } from 'nestjs-telegraf';
import { Logger } from '@nestjs/common';
import { Markup } from 'telegraf';
import { ConfigService } from '@nestjs/config';
import type { BotContext } from '../../interfaces';
import { SCENES } from '../../config';
import { BalanceService } from '../../../balance';
import { IAppConfig } from '../../../../common';
import { TranslateService } from '../../../translate';
import { BaseScene } from '../base/base.scene';

const MIN_AMOUNT = 5_000;

@Wizard(SCENES.TOP_UP)
export class TopUpScene extends BaseScene {
  private readonly cardNumber: string;
  private readonly adminGroupId: string;
  private readonly logger = new Logger(TopUpScene.name);

  constructor(
    private readonly balanceService: BalanceService,
    private readonly configService: ConfigService<IAppConfig>,
    private readonly t: TranslateService,
  ) {
    super();
    this.cardNumber = this.configService.getOrThrow('cardNumber', {
      infer: true,
    });
    this.adminGroupId = this.configService.getOrThrow('adminGroupId', {
      infer: true,
    });
  }

  private lang(ctx: BotContext) {
    return ctx.session.locale ?? ctx.from?.language_code ?? 'en';
  }

  private getBackKeyboard(ctx: BotContext) {
    const l = this.lang(ctx);
    return Markup.keyboard([[this.t.t('top_up.btn_back', l)]]).resize();
  }

  @Start()
  async start(ctx: BotContext) {
    await super.start(ctx);
  }

  @WizardStep(1)
  async askAmount(@Ctx() ctx: BotContext) {
    const l = this.lang(ctx);

    await ctx.reply(
      this.t.t('top_up.ask_amount', l, {
        card: this.cardNumber,
        min: MIN_AMOUNT.toLocaleString(),
      }),
      { parse_mode: 'Markdown', ...this.getBackKeyboard(ctx) },
    );

    ctx.wizard.next();
  }

  @WizardStep(2)
  async validateAmount(@Ctx() ctx: BotContext) {
    const l = this.lang(ctx);
    const text =
      ctx.message && 'text' in ctx.message ? ctx.message.text.trim() : '';

    if (text === this.t.t('top_up.btn_back', l)) {
      await ctx.scene.enter(SCENES.DASHBOARD);
      return;
    }

    const amount = Number(text.replace(/[\s,]/g, ''));

    if (!amount || isNaN(amount) || amount <= 0) {
      await ctx.reply(this.t.t('top_up.invalid_amount', l), {
        parse_mode: 'Markdown',
      });
      return;
    }

    if (amount < MIN_AMOUNT) {
      await ctx.reply(
        this.t.t('top_up.amount_too_low', l, {
          min: MIN_AMOUNT.toLocaleString(),
        }),
        { parse_mode: 'Markdown' },
      );
      return;
    }

    ctx.session.topUpAmount = amount;

    await ctx.reply(
      this.t.t('top_up.ask_screenshot', l, { amount: amount.toLocaleString() }),
      { parse_mode: 'Markdown', ...this.getBackKeyboard(ctx) },
    );

    ctx.wizard.next();
  }

  @WizardStep(3)
  @On('photo')
  async handleScreenshot(@Ctx() ctx: BotContext) {
    const l = this.lang(ctx);
    const photos =
      ctx.message && 'photo' in ctx.message ? ctx.message.photo : [];
    const fileId = photos[photos.length - 1].file_id;
    const amount = ctx.session.topUpAmount!;
    const userId = ctx.session.userId!;

    try {
      const transaction = await this.balanceService.createPendingTopUp(
        userId,
        amount,
        fileId,
      );

      this.logger.log(
        `User ${ctx.session.name} submitted top-up #${transaction.id} for ${amount} UZS`,
      );

      // admin message stays in English
      await ctx.telegram.sendPhoto(this.adminGroupId, fileId, {
        caption:
          `🔔 <b>Top Up Request #${transaction.id}</b>\n\n` +
          `👤 ${ctx.session.name} (ID: ${userId})\n` +
          `📱 Telegram: @${ctx.from?.username ?? ctx.from?.id}\n` +
          `💰 Amount: <b>${amount.toLocaleString()} UZS</b>`,
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback(
              '✅ Approve',
              `topup_approve:${transaction.id}`,
            ),
            Markup.button.callback(
              '❌ Reject',
              `topup_reject:${transaction.id}`,
            ),
          ],
        ]),
      });

      ctx.session.topUpAmount = undefined;

      await ctx.reply(
        this.t.t('top_up.request_received', l, {
          amount: amount.toLocaleString(),
        }),
        { parse_mode: 'Markdown' },
      );
    } catch (error) {
      this.logger.error(error);
      await ctx.reply(this.t.t('top_up.error', l));
    }

    await ctx.scene.enter(SCENES.DASHBOARD);
  }

  @WizardStep(3)
  async handleNonPhoto(@Ctx() ctx: BotContext) {
    const l = this.lang(ctx);
    const text =
      ctx.message && 'text' in ctx.message ? ctx.message.text.trim() : '';

    if (text === this.t.t('top_up.btn_back', l)) {
      ctx.session.topUpAmount = undefined;
      await ctx.scene.enter(SCENES.DASHBOARD);
      return;
    }

    await ctx.reply(this.t.t('top_up.send_photo', l), {
      parse_mode: 'Markdown',
    });
  }
}
