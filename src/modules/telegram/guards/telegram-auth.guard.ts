import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TelegrafExecutionContext } from 'nestjs-telegraf';
import { IS_PUBLIC } from '../decorators';
import type { BotContext } from '../interfaces';
import { UserService } from '../../user';

@Injectable()
export class TelegramAuthGuard implements CanActivate {
  constructor(
    private readonly userService: UserService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const ctx =
      TelegrafExecutionContext.create(context).getContext<BotContext>();
    const telegramId = String(ctx.from?.id);
    if (!telegramId) return false;

    const account = await this.userService.findAccountByTelegram(telegramId);

    if (!account) {
      await ctx.reply('❌ You are not registered. Use /start to register.');
      return false;
    }

    ctx.session.userId = account.user.id;
    ctx.session.userName = account.user.name ?? undefined;
    ctx.session.userEmail = account.user.email;

    return true;
  }
}
