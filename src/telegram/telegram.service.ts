import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Telegraf } from 'telegraf';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/app.config.interface';

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private bot: Telegraf;

  constructor(private readonly config: ConfigService<AppConfig>) {}

  async onModuleInit() {
    const token = this.config.getOrThrow('telegramBotToken', { infer: true });

    if (!token)
      throw new Error(
        'TELEGRAM_BOT_TOKEN is not defined in the environment variables',
      );

    this.bot = new Telegraf(token);

    this.bot.start((ctx) => ctx.reply('Welcome 🚀'));

    this.bot.command('search', async (ctx) => {
      await ctx.reply('Search command triggered');
    });

    this.bot.on('text', async (ctx) => {
      await ctx.reply(`Echo: ${ctx.message.text}`);
    });

    await this.bot.launch();

    console.log('🤖 Telegraf bot started');
  }

  onModuleDestroy() {
    this.bot.stop();
  }
}
