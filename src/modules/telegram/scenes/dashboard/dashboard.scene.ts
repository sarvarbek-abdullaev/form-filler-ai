import { Scene, SceneEnter, On, Ctx, Message } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { Logger, UseGuards } from '@nestjs/common';
import type { BotContext } from '../../interfaces';
import { SCENES } from '../../config';
import { TelegramAuthGuard } from '../../guards';
import { BalanceService } from '../../../balance';

const getKeyboard = () =>
  Markup.keyboard([
    ['👤 Profile', '💰 Balance'],
    ['💳 Top Up', '🚪 Logout'],
  ]).resize();

@UseGuards(TelegramAuthGuard)
@Scene(SCENES.DASHBOARD)
export class DashboardScene {
  private readonly logger = new Logger(DashboardScene.name);

  constructor(private readonly balanceService: BalanceService) {}

  @SceneEnter()
  async onEnter(@Ctx() ctx: BotContext) {
    await ctx.reply('🏠 Dashboard', getKeyboard());
  }

  @On('text')
  async onText(@Ctx() ctx: BotContext, @Message('text') text: string) {
    switch (text) {
      case '👤 Profile':
        await this.handleProfile(ctx);
        break;

      case '💰 Balance':
        await this.handleBalance(ctx);
        break;

      case '💳 Top Up':
        await ctx.scene.enter(SCENES.TOP_UP);
        break;

      case '🚪 Logout':
        await this.handleLogout(ctx);
        break;

      default:
        await ctx.reply(
          '❓ Unknown command. Use the menu below 👇',
          getKeyboard(),
        );
    }
  }

  private async handleProfile(ctx: BotContext) {
    await ctx.reply(
      `👤 *Profile*\n\n` +
        `Name: ${ctx.session.name || 'Not set'}\n` +
        `Phone: ${ctx.session.phone || 'Not set'}`,
      { parse_mode: 'Markdown' },
    );
  }

  private async handleBalance(ctx: BotContext) {
    const balance = await this.balanceService.getBalance(ctx.session.userId!);
    const transactions = await this.balanceService.getTransactions(
      ctx.session.userId!,
    );

    const history =
      transactions.length === 0
        ? 'No transactions yet.'
        : transactions
            .slice(0, 5)
            .map(
              (t) =>
                `${t.type === 'CREDIT' ? '➕' : '➖'} ${Number(t.amount).toLocaleString()} UZS${t.note ? ` — ${t.note}` : ''}`,
            )
            .join('\n');

    await ctx.reply(
      `💰 *Balance*\n\n` +
        `Amount: *${Number(balance?.amount ?? 0).toLocaleString()} UZS*\n\n` +
        `📋 *Last transactions:*\n${history}`,
      { parse_mode: 'Markdown' },
    );
  }

  private async handleLogout(ctx: BotContext) {
    ctx.session.userId = undefined;
    ctx.session.name = undefined;
    ctx.session.phone = undefined;
    ctx.session.mode = undefined;

    await ctx.reply('🚪 Logged out');
    await ctx.scene.enter(SCENES.AUTH);
  }
}
