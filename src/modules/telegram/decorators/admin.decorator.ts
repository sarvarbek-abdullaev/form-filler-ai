import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { TelegrafExecutionContext } from 'nestjs-telegraf';
import { BotContext } from '../interfaces';
import { ConfigService } from '@nestjs/config';
import { IAppConfig } from '../../../common';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly configService: ConfigService<IAppConfig>) {}

  canActivate(context: ExecutionContext): boolean {
    const ctx = TelegrafExecutionContext.create(context);
    const { from } = ctx.getContext<BotContext>();

    // Check against authorized IDs from environment variables
    const admins = this.configService.getOrThrow<string>('admins');
    const allowedIds = admins.split(',').map(Number);
    const isAdmin = allowedIds.includes(from!.id);
    console.log('isAdmin', isAdmin);

    return isAdmin;
  }
}
