import { Wizard, WizardStep } from 'nestjs-telegraf';
import { Logger } from '@nestjs/common';
import { Markup } from 'telegraf';
import type { BotContext } from '../../interfaces';
import { SCENES } from '../../config';
import { UserService } from '../../../user';
import { Public } from '../../decorators';

@Public()
@Wizard(SCENES.AUTH)
export class AuthScene {
  private readonly logger = new Logger(AuthScene.name);

  constructor(private readonly userService: UserService) {}

  @WizardStep(1)
  async askPhone(ctx: BotContext) {
    await ctx.reply(
      '📱 Please share your phone number:',
      Markup.keyboard([[Markup.button.contactRequest('📲 Share phone number')]])
        .oneTime()
        .resize(),
    );

    ctx.wizard.next();
  }

  @WizardStep(2)
  async handlePhone(ctx: BotContext) {
    if (!ctx.message || !('contact' in ctx.message)) {
      await ctx.reply('❌ Please use the button to share your phone number.');
      return;
    }

    const contact = ctx.message.contact;

    if (contact.user_id !== ctx.from?.id) {
      await ctx.reply('❌ Please share your own phone number.');
      return;
    }

    const phone = contact.phone_number;
    ctx.session.phone = phone;

    try {
      const existingUser = await this.userService.findByPhone(phone);

      if (existingUser) {
        this.logger.log(`Existing user logged in: ${phone}`);

        await ctx.reply('✅ Welcome back!', {
          reply_markup: { remove_keyboard: true },
        });

        await ctx.scene.enter(SCENES.DASHBOARD);
        return;
      }

      await ctx.reply('👤 I don’t know you yet. What is your name?');

      ctx.wizard.next();
    } catch (error) {
      this.logger.error(error);
      await ctx.reply('❌ Something went wrong. Please try again with /start');
      await ctx.scene.leave();
    }
  }

  // STEP 3 — Save new user with name
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
      await this.userService.findOrCreateByTelegram(
        String(ctx.from?.id ?? ''),
        {
          name: ctx.session.name,
          phone: ctx.session.phone!,
        },
      );

      this.logger.log(`New user registered: ${text}`);

      await ctx.reply('✅ Registration completed', {
        reply_markup: { remove_keyboard: true },
      });

      await ctx.scene.enter(SCENES.DASHBOARD);
    } catch (error) {
      this.logger.error(error);
      await ctx.reply('❌ Something went wrong. Please try again with /start');
      await ctx.scene.leave();
    }
  }
}
