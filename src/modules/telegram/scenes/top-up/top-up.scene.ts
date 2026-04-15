import { Wizard, WizardStep, On, Ctx } from 'nestjs-telegraf';
import { Logger } from '@nestjs/common';
import { Markup } from 'telegraf';
import { ConfigService } from '@nestjs/config';
import type { BotContext } from '../../interfaces';
import { SCENES } from '../../config';
import { BalanceService } from '../../../balance';
import { IAppConfig } from '../../../../common';
import { UserService } from '../../../user';

@Wizard(SCENES.TOP_UP)
export class TopUpScene {
  private readonly cardNumber: string;
  private readonly logger = new Logger(TopUpScene.name);

  constructor(
    private readonly balanceService: BalanceService,
    private readonly userService: UserService,
    private readonly configService: ConfigService<IAppConfig>,
  ) {
    this.cardNumber = this.configService.getOrThrow('cardNumber', {
      infer: true,
    });
  }

  @WizardStep(1)
  async askAmount(@Ctx() ctx: BotContext) {
    await ctx.reply(
      `💳 Transfer the desired amount to the following card:\n\n<code>${this.cardNumber}</code>\n\nHow much are you transferring? (in UZS)`,
      { parse_mode: 'HTML', ...Markup.removeKeyboard() },
    );
    ctx.wizard.next();
  }

  @WizardStep(2)
  async validateAmount(@Ctx() ctx: BotContext) {
    const text =
      ctx.message && 'text' in ctx.message ? ctx.message.text.trim() : '';

    const amount = Number(text.replace(/\s/g, ''));

    if (!amount || isNaN(amount) || amount <= 0) {
      await ctx.reply('❌ Invalid amount. Please enter a valid number:');
      return;
    }

    ctx.session.topUpAmount = amount;
    await ctx.reply(
      `📸 Please send a screenshot of your transfer for <b>${amount.toLocaleString()} UZS</b>`,
      { parse_mode: 'HTML' },
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

    const transaction = await this.balanceService.createPendingTopUp(
      userId,
      amount,
      fileId,
    );

    this.logger.log(
      `User ${ctx.session.userName} submitted top-up #${transaction.id} for ${amount} UZS`,
    );

    await ctx.telegram.sendPhoto(
      this.configService.getOrThrow('adminGroupId', { infer: true }),
      fileId,
      {
        caption:
          `🔔 *New Top Up Request #${transaction.id}*\n\n` +
          `👤 User: ${ctx.session.userName} (ID: ${userId})\n` +
          `🆔 Telegram: ${ctx.from?.id}}\n` +
          `💰 Amount: *${amount.toLocaleString()} UZS*`,
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          Markup.button.callback(
            '✅ Approve',
            `topup_approve:${transaction.id}`,
          ),
          Markup.button.callback('❌ Reject', `topup_reject:${transaction.id}`),
        ]),
      },
    );

    ctx.session.topUpAmount = undefined;

    await ctx.reply(
      '✅ Your request is under review. You will be notified once confirmed.',
    );
    await ctx.scene.enter(SCENES.DASHBOARD);
  }

  @WizardStep(3)
  async handleNonPhoto(@Ctx() ctx: BotContext) {
    await ctx.reply('❌ Please send a screenshot (photo) of your transfer:');
  }
}
