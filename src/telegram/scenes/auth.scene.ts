import { Scenes } from 'telegraf';
import { AppContext } from '../telegram.context';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const authScene = new Scenes.WizardScene<AppContext>(
  'AUTH_SCENE',

  // Step 1 — ask username
  async (ctx) => {
    await ctx.reply('Enter your username:');
    return ctx.wizard.next();
  },

  // Step 2 — validate username
  async (ctx) => {
    const text =
      ctx.message && 'text' in ctx.message ? ctx.message.text.trim() : '';

    if (!text || text.length < 3) {
      await ctx.reply('❌ Username must be at least 3 characters. Try again:');
      return; // stay on same step
    }

    ctx.scene.session.userName = text;
    await ctx.reply('Enter your email:');
    return ctx.wizard.next();
  },

  // Step 3 — validate email
  async (ctx) => {
    const text =
      ctx.message && 'text' in ctx.message ? ctx.message.text.trim() : '';

    if (!text || !emailRegex.test(text)) {
      await ctx.reply('❌ Invalid email. Please enter a valid email:');
      return;
    }

    ctx.scene.session.userEmail = text;

    // Here you can call service if needed
    // await this.authService.register(ctx.session);

    await ctx.reply('✅ Registration completed');

    return ctx.scene.enter('DASHBOARD_SCENE');
  },
);
