import { Start, Update } from 'nestjs-telegraf';
import { Logger } from '@nestjs/common';

import type { BotContext } from '../interfaces';
import { SCENES } from '../config';

@Update()
export class TelegramUpdate {
  private readonly logger = new Logger(TelegramUpdate.name);

  @Start()
  async start(ctx: BotContext) {
    this.logger.log(`START - ${ctx.updateType}`);
    await ctx.reply('Welcome to the bot!');

    await ctx.scene.enter(SCENES.AUTH);
  }
}
