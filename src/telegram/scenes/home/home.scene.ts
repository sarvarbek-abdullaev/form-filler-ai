import { Wizard, WizardStep } from 'nestjs-telegraf';
import type { BotContext } from '../../interfaces';
import { SCENES } from '../../config';

@Wizard(SCENES.HOME)
export class HomeScene {
  @WizardStep(1)
  async step1(ctx: BotContext) {
    await ctx.reply('Welcome to home scene!');
  }
}
