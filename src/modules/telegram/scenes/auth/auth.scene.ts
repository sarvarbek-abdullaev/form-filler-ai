import { Logger } from '@nestjs/common';

import { Wizard, WizardStep } from 'nestjs-telegraf';
import { Markup } from 'telegraf';

import type { BotContext } from '../../interfaces';
import { UserService } from '../../../user';

import { SCENES } from '../../config';
import { Public } from '../../decorators';

@Public()
@Wizard(SCENES.AUTH)
export class AuthScene {
  private readonly logger = new Logger(AuthScene.name);

  constructor(private readonly userService: UserService) {}

  @WizardStep(1)
  async askPhone(ctx: BotContext) {
    await ctx.reply(
      `🤖 *Welcome to Form Filler AI!*\n\n` +
        `I automatically fill and submit forms for you — fast, accurate, and hassle-free.\n\n` +
        `To get started, please share your phone number:`,
      {
        parse_mode: 'Markdown',
        ...Markup.keyboard([
          [Markup.button.contactRequest('📲 Share my phone number')],
        ])
          .oneTime()
          .resize(),
      },
    );

    ctx.wizard.next();
  }

  @WizardStep(2)
  async handlePhone(ctx: BotContext) {
    if (!ctx.message || !('contact' in ctx.message)) {
      await ctx.reply(
        '👇 Please use the button below to share your phone number.',
        Markup.keyboard([
          [Markup.button.contactRequest('📲 Share my phone number')],
        ])
          .oneTime()
          .resize(),
      );
      return;
    }

    const contact = ctx.message.contact;

    if (contact.user_id !== ctx.from?.id) {
      await ctx.reply(
        "❌ Please share *your own* phone number, not someone else's.",
        {
          parse_mode: 'Markdown',
        },
      );
      return;
    }

    const phone = contact.phone_number;
    ctx.session.phone = phone;

    try {
      const existingUser = await this.userService.findByPhone(phone);

      if (existingUser) {
        ctx.session.userId = existingUser.id;
        ctx.session.name = existingUser.name ?? '';

        this.logger.log(`Existing user logged in: ${phone}`);

        await ctx.reply(`👋 Welcome back, *${existingUser.name}*!`, {
          parse_mode: 'Markdown',
          reply_markup: { remove_keyboard: true },
        });

        await ctx.scene.enter(SCENES.DASHBOARD);
        return;
      }

      await ctx.reply(
        `👋 Nice to meet you! What should I call you?\n\n_Enter your full name:_`,
        { parse_mode: 'Markdown', reply_markup: { remove_keyboard: true } },
      );

      ctx.wizard.next();
    } catch (error) {
      this.logger.error(error);
      await ctx.reply('❌ Something went wrong. Please try again with /start');
      await ctx.scene.leave();
    }
  }

  @WizardStep(3)
  async handleName(ctx: BotContext) {
    const text =
      ctx.message && 'text' in ctx.message ? ctx.message.text.trim() : '';

    if (!text || text.length < 2) {
      await ctx.reply('❌ Name must be at least 2 characters. Try again:');
      return;
    }

    ctx.session.name = text;

    try {
      const user = await this.userService.findOrCreateByTelegram(
        String(ctx.from?.id ?? ''),
        {
          name: text,
          phone: ctx.session.phone!,
        },
      );

      ctx.session.userId = user.id;

      this.logger.log(`New user registered: ${text}`);

      await ctx.reply(
        `🎉 You're all set, *${text}*!\n\n` +
          `You can now start filling forms automatically. Tap the button below to begin 👇`,
        { parse_mode: 'Markdown', reply_markup: { remove_keyboard: true } },
      );

      await ctx.scene.enter(SCENES.DASHBOARD);
    } catch (error) {
      this.logger.error(error);
      await ctx.reply('❌ Something went wrong. Please try again with /start');
      await ctx.scene.leave();
    }
  }
}
