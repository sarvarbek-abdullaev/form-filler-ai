import { Start, Update } from 'nestjs-telegraf';
import { Logger } from '@nestjs/common';

import type { BotContext } from '../interfaces';
import { SCENES } from '../config';
import { Public } from '../decorators';
import { UserService } from '../../user';

@Public()
@Update()
export class TelegramUpdate {
  private readonly logger = new Logger(TelegramUpdate.name);

  constructor(private readonly userService: UserService) {}

  @Start()
  async start(ctx: BotContext) {
    this.logger.log(`START - ${ctx.updateType}`);

    if (!ctx.session.userEmail) {
      const account = await this.userService.findAccountByTelegram(
        String(ctx.from?.id ?? ''),
      );

      if (account) {
        ctx.session.userId = account.user.id;
        ctx.session.userName = account.user.name ?? undefined;
        ctx.session.userEmail = account.user.email;

        await ctx.reply('👋 Welcome back!');
        await ctx.scene.enter(SCENES.DASHBOARD);
        return;
      }
    }
    await ctx.reply('Welcome to the bot!');
    await ctx.scene.enter(SCENES.AUTH);
  }
}
