import { Wizard, WizardStep } from 'nestjs-telegraf';
import { Logger } from '@nestjs/common';
import type { BotContext } from '../../interfaces';
import { SCENES } from '../../config';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Wizard(SCENES.AUTH)
export class AuthScene {
  private readonly logger = new Logger(AuthScene.name);

  @WizardStep(1)
  async askUsername(ctx: BotContext) {
    await ctx.reply('Enter your username:');
    ctx.wizard.next();
  }

  @WizardStep(2)
  async validateUsername(ctx: BotContext) {
    const text =
      ctx.message && 'text' in ctx.message ? ctx.message.text.trim() : '';

    if (!text || text.length < 3) {
      await ctx.reply('❌ Username must be at least 3 characters. Try again:');
      return;
    }

    ctx.session.userName = text;
    await ctx.reply('Enter your email:');
    ctx.wizard.next();
  }

  @WizardStep(3)
  async validateEmail(ctx: BotContext) {
    const text =
      ctx.message && 'text' in ctx.message ? ctx.message.text.trim() : '';

    if (!text || !emailRegex.test(text)) {
      await ctx.reply('❌ Invalid email. Please enter a valid email:');
      return;
    }

    ctx.session.userEmail = text;

    // await this.authService.register(ctx.session);

    this.logger.log(`User ${ctx.session.userName} registered`);

    await ctx.reply('✅ Registration completed');
    await ctx.scene.enter(SCENES.DASHBOARD);
  }
}
