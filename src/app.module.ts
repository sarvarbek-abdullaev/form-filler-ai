import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import appConfig from './common/config/app.config';
import {
  FormAnalyzerModule,
  JobModule,
  TelegramModule,
  UserModule,
} from './modules';
import { IAppConfig, PrismaModule, validationSchema } from './common';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      load: [appConfig],
      validationSchema,
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<IAppConfig>) => ({
        connection: {
          url: config.getOrThrow('redisUrl', { infer: true }),
        },
      }),
    }),

    TelegramModule,
    PrismaModule,
    UserModule,
    JobModule,
    FormAnalyzerModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
