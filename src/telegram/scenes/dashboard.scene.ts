import { Scenes, Markup } from 'telegraf';
import { AppContext } from '../telegram.context';

export const dashboardScene = new Scenes.BaseScene<AppContext>(
  'DASHBOARD_SCENE',
);

// Helper: main keyboard
const getKeyboard = () =>
  Markup.keyboard([
    ['👤 Profile', '✏️ Edit Name'],
    ['📧 Edit Email', '🚪 Logout'],
  ]).resize();

// Enter handler
dashboardScene.enter(async (ctx) => {
  await ctx.reply(
    `👋 Welcome to your dashboard${
      ctx.scene.session.userName ? `, ${ctx.scene.session.userName}` : ''
    }`,
    getKeyboard(),
  );
});

// Main handler (acts like controller)
dashboardScene.on('text', async (ctx) => {
  const text = ctx.message.text;

  switch (text) {
    case '👤 Profile':
      await ctx.reply(
        `👤 Username: ${ctx.scene.session.userName || 'Not set'}\n📧 Email: ${
          ctx.scene.session.userEmail || 'Not set'
        }`,
      );
      break;

    case '✏️ Edit Name':
      await ctx.reply('Enter new username:');
      ctx.scene.session.mode = 'edit_name'; // temp mode
      break;

    case '📧 Edit Email':
      await ctx.reply('Enter new email:');
      ctx.scene.session.mode = 'edit_email';
      break;

    case '🚪 Logout':
      ctx.scene.session.userName = undefined;
      ctx.scene.session.userEmail = undefined;

      await ctx.reply('🚪 Logged out');
      return ctx.scene.enter('AUTH_SCENE');

    default:
      // Handle "modes"
      if (ctx.scene.session.mode === 'edit_name') {
        const name = text.trim();

        if (name.length < 3) {
          await ctx.reply('❌ Name must be at least 3 characters. Try again:');
          return;
        }

        ctx.scene.session.userName = name;
        ctx.scene.session.mode = undefined;

        await ctx.reply('✅ Username updated', getKeyboard());
        return;
      }

      if (ctx.scene.session.mode === 'edit_email') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailRegex.test(text)) {
          await ctx.reply('❌ Invalid email. Try again:');
          return;
        }

        ctx.scene.session.userEmail = text;
        ctx.scene.session.mode = undefined;

        await ctx.reply('✅ Email updated', getKeyboard());
        return;
      }

      await ctx.reply(
        '❓ Unknown command. Use the menu below 👇',
        getKeyboard(),
      );
  }
});
