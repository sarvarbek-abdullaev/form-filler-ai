import { Module } from '@nestjs/common';
import { TranslateService } from './translate.service';
import {
  AcceptLanguageResolver,
  I18nJsonLoader,
  I18nModule,
  QueryResolver,
} from 'nestjs-i18n';
import * as path from 'path';

@Module({
  exports: [TranslateService],
  imports: [
    I18nModule.forRootAsync({
      useFactory: () => ({
        fallbackLanguage: 'en',
        logging: false,
        fallbacks: {
          'en-*': 'en',
          'ru-*': 'ru',
          'uz-*': 'uz',
        },
        loaderOptions: {
          path: path.join(__dirname, '../../i18n'),
          watch: true,
        },
        throwOnMissingKey: true,
      }),
      loader: I18nJsonLoader,
      resolvers: [
        { use: QueryResolver, options: ['lang'] },
        AcceptLanguageResolver,
      ],
    }),
  ],
  providers: [TranslateService],
})
export class TranslateModule {}
