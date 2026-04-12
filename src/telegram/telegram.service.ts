import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { Telegraf } from 'telegraf';
import { ConfigService } from '@nestjs/config';
import { IAppConfig } from '../interfaces';
import { InjectBot } from 'nestjs-telegraf';
import { botConfig } from './config';
import { InlineKeyboardMarkup, ReplyKeyboardMarkup } from 'telegraf/types';
import { BotContext } from './interfaces';

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);

  constructor(
    private readonly config: ConfigService<IAppConfig>,
    @InjectBot(botConfig.NAME) private readonly bot: Telegraf<BotContext>,
  ) {}

  async sendMessage(
    ctx: BotContext,
    text: string,
    keyboard: { reply_markup: InlineKeyboardMarkup | ReplyKeyboardMarkup },
  ) {
    const chatId = ctx.chat?.id ?? '';

    await this.bot.telegram.sendMessage(chatId, text, {
      parse_mode: 'HTML',
      ...keyboard,
    });
  }

  async onModuleInit() {
    const botInfo = await this.bot.telegram.getMe();
    this.logger.log(`Bot @${botInfo.username} is up and listening ✅`);
  }

  onModuleDestroy() {
    this.bot.stop('Server is shutting down...');
  }
}
