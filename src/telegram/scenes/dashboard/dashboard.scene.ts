import { Scene, SceneEnter, On, Ctx, Message } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { Logger } from '@nestjs/common';
import type { BotContext } from '../../interfaces';
import { SCENES } from '../../config';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const getKeyboard = () =>
  Markup.keyboard([
    ['👤 Profile', '✏️ Edit Name'],
    ['📧 Edit Email', '🚪 Logout'],
  ]).resize();

@Scene(SCENES.DASHBOARD)
export class DashboardScene {
  private readonly logger = new Logger(DashboardScene.name);

  @SceneEnter()
  async onEnter(@Ctx() ctx: BotContext) {
    this.logger.log(`User ${ctx.session.userName} entered dashboard`);
    await ctx.reply(
      `👋 Welcome to your dashboard${
        ctx.session.userName ? `, ${ctx.session.userName}` : '' // ✅ fixed: was ctx.session.mode
      }`,
      getKeyboard(),
    );
  }

  @On('text')
  async onText(@Ctx() ctx: BotContext, @Message('text') text: string) {
    switch (text) {
      case '👤 Profile':
        await this.handleProfile(ctx);
        break;

      case '✏️ Edit Name':
        await ctx.reply('Enter new username:');
        ctx.session.mode = 'edit_name';
        break;

      case '📧 Edit Email':
        await ctx.reply('Enter new email:');
        ctx.session.mode = 'edit_email';
        break;

      case '🚪 Logout':
        await this.handleLogout(ctx);
        break;

      default:
        await this.handleMode(ctx, text);
    }
  }

  private async handleProfile(ctx: BotContext) {
    await ctx.reply(
      `👤 Username: ${ctx.session.userName || 'Not set'}\n📧 Email: ${ctx.session.userEmail || 'Not set'}`,
    );
  }

  private async handleLogout(ctx: BotContext) {
    ctx.session.userName = undefined;
    ctx.session.userEmail = undefined;
    ctx.session.mode = undefined;

    await ctx.reply('🚪 Logged out');
    await ctx.scene.enter(SCENES.AUTH);
  }

  private async handleMode(ctx: BotContext, text: string) {
    if (ctx.session.mode === 'edit_name') {
      const name = text.trim();

      if (name.length < 3) {
        await ctx.reply('❌ Name must be at least 3 characters. Try again:');
        return;
      }

      ctx.session.userName = name;
      ctx.session.mode = undefined;
      await ctx.reply('✅ Username updated', getKeyboard());
      return;
    }

    if (ctx.session.mode === 'edit_email') {
      if (!emailRegex.test(text)) {
        await ctx.reply('❌ Invalid email. Try again:');
        return;
      }

      ctx.session.userEmail = text;
      ctx.session.mode = undefined;
      await ctx.reply('✅ Email updated', getKeyboard());
      return;
    }

    await ctx.reply('❓ Unknown command. Use the menu below 👇', getKeyboard());
  }
}
