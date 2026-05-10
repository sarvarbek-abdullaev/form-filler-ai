import { UseGuards } from '@nestjs/common';
import {
  Scene,
  SceneEnter,
  On,
  Ctx,
  Message,
  Action,
  Start,
} from 'nestjs-telegraf';
import { Markup } from 'telegraf';

import { SCENES } from '../../config';
import { TelegramAuthGuard } from '../../guards';
import { TranslateService } from '../../../translate';
import type { BotContext } from '../../interfaces';
import { UserService } from '../../../user';
import { BaseScene } from '../base/base.scene';

@UseGuards(TelegramAuthGuard)
@Scene(SCENES.SETTINGS)
export class SettingsScene extends BaseScene {
  constructor(
    private readonly t: TranslateService,
    private readonly userService: UserService,
  ) {
    super();
  }

  private lang(ctx: BotContext) {
    return ctx.session.locale ?? ctx.from?.language_code ?? 'en';
  }

  private getKeyboard(ctx: BotContext) {
    const l = this.lang(ctx);
    return Markup.keyboard([
      [this.t.t('settings.btn_language', l)],
      [this.t.t('settings.btn_back', l)],
    ]).resize();
  }

  private getLangKeyboard() {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback('🇬🇧 English', 'set_lang_en'),
        Markup.button.callback('🇷🇺 Русский', 'set_lang_ru'),
        Markup.button.callback("🇺🇿 O'zbek", 'set_lang_uz'),
      ],
    ]);
  }

  @SceneEnter()
  async onEnter(@Ctx() ctx: BotContext) {
    const l = this.lang(ctx);
    await ctx.reply(this.t.t('settings.enter', l), this.getKeyboard(ctx));
  }

  @Start()
  async start(ctx: BotContext) {
    await super.start(ctx);
  }

  @On('text')
  async onText(
    @Ctx() ctx: BotContext,
    @Message('text') text: string,
    next: () => Promise<void>,
  ) {
    if (text.startsWith('/')) {
      await super.onBaseText(ctx, text, next);
      return;
    }

    const l = this.lang(ctx);

    switch (text) {
      case this.t.t('settings.btn_language', l): {
        await ctx.reply(
          this.t.t('settings.language_current', l, {
            lang: this.t.languages.languages[l.toLowerCase()],
          }),
          this.getLangKeyboard(),
        );
        break;
      }

      case this.t.t('settings.btn_back', l):
        await ctx.scene.enter(SCENES.DASHBOARD);
        break;

      default:
        await ctx.reply(this.t.t('settings.enter', l), this.getKeyboard(ctx));
    }
  }

  @Action(/^set_lang_(en|ru|uz)$/)
  async onSetLang(@Ctx() ctx: BotContext) {
    const data = (ctx.callbackQuery as { data: string }).data;
    const lang = data.replace('set_lang_', '') as 'en' | 'ru' | 'uz';

    ctx.session.locale = lang;
    await this.userService.updateUser({
      where: {
        id: ctx.session.userId,
      },
      data: {
        locale: lang,
      },
    });

    await ctx.answerCbQuery();
    await ctx.reply(
      this.t.t('settings.language_changed', lang),
      this.getKeyboard(ctx),
    );
  }
}
