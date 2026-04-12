import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { session } from 'telegraf';
import { TelegramService } from './telegram.service';
import { TelegrafModule } from 'nestjs-telegraf';
import { botConfig } from './config';
import { IAppConfig } from '../interfaces';
import { ScenesModule } from './scenes';
import { TelegramUpdate } from './updates';

@Module({
  imports: [
    TelegrafModule.forRootAsync({
      botName: botConfig.NAME,
      imports: [
        ConfigModule,
        // , TranslateModule
      ],
      inject: [ConfigService],
      useFactory: (config: ConfigService<IAppConfig>) => ({
        token: config.getOrThrow('telegramBotToken', { infer: true }),
        middlewares: [session()],
      }),
    }),
    ScenesModule,
  ],
  providers: [TelegramService, TelegramUpdate],
})
export class TelegramModule {}
