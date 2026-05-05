import { Wizard, WizardStep, On, Ctx } from 'nestjs-telegraf';
import { Logger } from '@nestjs/common';
import { Markup } from 'telegraf';
import { ConfigService } from '@nestjs/config';
import type { BotContext } from '../../interfaces';
import { SCENES } from '../../config';
import { BalanceService } from '../../../balance';
import { IAppConfig } from '../../../../common';
import { UserService } from '../../../user';

const MIN_AMOUNT = 5_000;

const getBackKeyboard = () => Markup.keyboard([['⬅️ Back']]).resize();

@Wizard(SCENES.TOP_UP)
export class TopUpScene {
  private readonly cardNumber: string;
  private readonly adminGroupId: string;
  private readonly logger = new Logger(TopUpScene.name);

  constructor(
    private readonly balanceService: BalanceService,
    private readonly userService: UserService,
    private readonly configService: ConfigService<IAppConfig>,
  ) {
    this.cardNumber = this.configService.getOrThrow('cardNumber', {
      infer: true,
    });
    this.adminGroupId = this.configService.getOrThrow('adminGroupId', {
      infer: true,
    });
  }

  @WizardStep(1)
  async askAmount(@Ctx() ctx: BotContext) {
    await ctx.reply(
      `💳 *Top Up Balance*\n\n` +
        `Transfer any amount to this card:\n\n` +
        `\`${this.cardNumber}\`\n\n` +
        `Then enter the amount you transferred below _(min. ${MIN_AMOUNT.toLocaleString()} UZS)_:`,

      { parse_mode: 'Markdown', ...getBackKeyboard() },
    );

    ctx.wizard.next();
  }

  @WizardStep(2)
  async validateAmount(@Ctx() ctx: BotContext) {
    const text =
      ctx.message && 'text' in ctx.message ? ctx.message.text.trim() : '';

    if (text === '⬅️ Back') {
      await ctx.scene.enter(SCENES.DASHBOARD);
      return;
    }

    const amount = Number(text.replace(/[\s,]/g, ''));

    if (!amount || isNaN(amount) || amount <= 0) {
      await ctx.reply('❌ Please enter a valid number.\n\nExample: `50000`', {
        parse_mode: 'Markdown',
      });
      return;
    }

    if (amount < MIN_AMOUNT) {
      await ctx.reply(
        `❌ Minimum top-up is *${MIN_AMOUNT.toLocaleString()} UZS*. Please enter a larger amount:`,
        { parse_mode: 'Markdown' },
      );
      return;
    }

    ctx.session.topUpAmount = amount;

    await ctx.reply(
      `📸 *Almost done!*\n\n` +
        `Send a screenshot confirming your transfer of *${amount.toLocaleString()} UZS*.\n\n` +
        `_Make sure the amount and card number are visible._`,
      { parse_mode: 'Markdown', ...getBackKeyboard() },
    );
    ctx.wizard.next();
  }

  @WizardStep(3)
  @On('photo')
  async handleScreenshot(@Ctx() ctx: BotContext) {
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
        `⏳ *Request received!*\n\n` +
          `Your top-up of *${amount.toLocaleString()} UZS* is under review.\n` +
          `We'll notify you once it's confirmed — usually within a few minutes.`,
        { parse_mode: 'Markdown' },
      );
    } catch (error) {
      this.logger.error(error);
      await ctx.reply('❌ Something went wrong. Please try again with /start');
    }

    await ctx.scene.enter(SCENES.DASHBOARD);
  }

  @WizardStep(3)
  async handleNonPhoto(@Ctx() ctx: BotContext) {
    const text =
      ctx.message && 'text' in ctx.message ? ctx.message.text.trim() : '';

    if (text === '⬅️ Back') {
      ctx.session.topUpAmount = undefined;
      await ctx.scene.enter(SCENES.DASHBOARD);
      return;
    }

    await ctx.reply(
      `📸 Please send a *screenshot* of your transfer.\n\n_Text messages won't work here — attach a photo._`,
      { parse_mode: 'Markdown' },
    );
  }
}
