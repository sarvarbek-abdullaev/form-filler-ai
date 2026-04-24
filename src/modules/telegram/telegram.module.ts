import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { session } from 'telegraf';
import { TelegramService } from './telegram.service';
import { TelegrafModule } from 'nestjs-telegraf';
import { botConfig } from './config';
import { IAppConfig } from '../../common';
import { ScenesModule } from './scenes';
import { TelegramUpdate } from './updates';
import { APP_GUARD } from '@nestjs/core';
import { TelegramAuthGuard } from './guards';
import { UserModule } from '../user';
import { BalanceModule } from '../balance';
import { FormAnalyzerModule } from '../form-analyzer';

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
    UserModule,
    BalanceModule,
    FormAnalyzerModule,
  ],
  providers: [
    TelegramService,
    TelegramUpdate,
    {
      provide: APP_GUARD,
      useClass: TelegramAuthGuard,
    },
  ],
})
export class TelegramModule {}
