import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Telegraf } from 'telegraf';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/app.config.interface';
import { createBot } from './bot/bot.factory';

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private bot: Telegraf;

  constructor(private readonly config: ConfigService<AppConfig>) {}

  async onModuleInit() {
    const token = this.config.getOrThrow('telegramBotToken', { infer: true });

    this.bot = createBot(token);

    await this.bot.launch();

    console.log('🤖 Telegraf bot started');
  }

  onModuleDestroy() {
    this.bot.stop();
  }
}
