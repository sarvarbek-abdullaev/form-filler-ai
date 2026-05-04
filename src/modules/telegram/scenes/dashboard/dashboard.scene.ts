import { UseGuards } from '@nestjs/common';

import { Scene, SceneEnter, On, Ctx, Message } from 'nestjs-telegraf';
import { Markup } from 'telegraf';

import { SCENES } from '../../config';
import { TelegramAuthGuard } from '../../guards';
import { BalanceService } from '../../../balance';

import type { BotContext } from '../../interfaces';

const getKeyboard = () =>
  Markup.keyboard([
    ['⚡ Auto-Fill Form'],
    ['💳 Top Up'],
    ['📋 History', '👤 Profile'],
  ]).resize();

const getProfileKeyboard = () =>
  Markup.keyboard([['🚪 Logout'], ['⬅️ Back']]).resize();

@UseGuards(TelegramAuthGuard)
@Scene(SCENES.DASHBOARD)
export class DashboardScene {
  constructor(private readonly balanceService: BalanceService) {}

  @SceneEnter()
  async onEnter(@Ctx() ctx: BotContext) {
    await ctx.reply('🏠 Dashboard', getKeyboard());
  }

  @On('text')
  async onText(@Ctx() ctx: BotContext, @Message('text') text: string) {
    switch (text) {
      case '⚡ Auto-Fill Form':
        await ctx.scene.enter(SCENES.NEW_JOB);
        break;

      case '📋 History':
        await ctx.scene.enter(SCENES.MY_JOBS);
        break;

      case '💳 Top Up':
        await ctx.scene.enter(SCENES.TOP_UP);
        break;

      case '👤 Profile':
        await this.handleProfile(ctx);
        break;

      case '🚪 Logout':
        await this.handleLogout(ctx);
        break;

      case '⬅️ Back':
        await ctx.scene.reenter();
        break;

      default:
        await ctx.reply('Use the menu below 👇', getKeyboard());
    }
  }

  private async handleProfile(ctx: BotContext) {
    const balance = await this.balanceService.getBalance(ctx.session.userId!);
    const amount = Number(balance?.amount ?? 0).toLocaleString();

    await ctx.reply(
      `👤 *Profile*\n\n` +
        `Name: ${ctx.session.name ?? '—'}\n` +
        `Phone: ${ctx.session.phone ?? '—'}\n\n` +
        `💰 Balance: *${amount} UZS*`,
      { parse_mode: 'Markdown', ...getProfileKeyboard() },
    );
  }

  private async handleLogout(ctx: BotContext) {
    ctx.session.userId = undefined;
    ctx.session.name = undefined;
    ctx.session.phone = undefined;
    ctx.session.mode = undefined;

    await ctx.reply('👋 See you next time!');
    await ctx.scene.enter(SCENES.AUTH);
  }
}
