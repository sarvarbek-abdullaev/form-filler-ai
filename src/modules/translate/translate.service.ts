import { Injectable } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';

import * as pagination from '../../i18n/pagination.json';
import * as languages from '../../i18n/languages.json';

@Injectable()
export class TranslateService {
  constructor(private readonly i18n: I18nService) {}

  t(phrase: string, lang: string, args?: Record<string, unknown>): string {
    return this.i18n.t(phrase, { lang, args });
  }

  many(phrases: string[], lang: string): string[] {
    return phrases.map((phrase) => this.t(phrase, lang));
  }

  get pagination() {
    return pagination;
  }

  get languages() {
    return languages;
  }
}
