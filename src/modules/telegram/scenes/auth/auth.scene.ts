import { Logger } from '@nestjs/common';
import { Wizard, WizardStep } from 'nestjs-telegraf';
import { Markup } from 'telegraf';

import type { BotContext } from '../../interfaces';
import { UserService } from '../../../user';
import { TranslateService } from '../../../translate';
import { SCENES } from '../../config';
import { Public } from '../../decorators';

@Public()
@Wizard(SCENES.AUTH)
export class AuthScene {
  private readonly logger = new Logger(AuthScene.name);

  constructor(
    private readonly userService: UserService,
    private readonly t: TranslateService,
  ) {}

  private lang(ctx: BotContext) {
    return ctx.session.locale ?? ctx.from?.language_code ?? 'en';
  }

  @WizardStep(1)
  async askLanguage(ctx: BotContext) {
    const detectedLang = ctx.from?.language_code ?? 'en';
    const normalized = ['en', 'ru', 'uz'].includes(detectedLang.split('-')[0])
      ? (detectedLang.split('-')[0] as 'en' | 'ru' | 'uz')
      : 'en';

    ctx.session.locale = normalized;

    await ctx.reply(
      this.t.t('auth.choose_language', normalized),
      Markup.inlineKeyboard([
        [
          Markup.button.callback('🇬🇧 English', 'auth_lang_en'),
          Markup.button.callback('🇷🇺 Русский', 'auth_lang_ru'),
          Markup.button.callback("🇺🇿 O'zbek", 'auth_lang_uz'),
        ],
      ]),
    );

    ctx.wizard.next();
  }

  @WizardStep(2)
  async handleLanguageAndAskPhone(ctx: BotContext) {
    // handle inline button press
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      const data = ctx.callbackQuery.data;

      ctx.session.locale = data.replace('auth_lang_', '') as 'en' | 'ru' | 'uz';
      await ctx.answerCbQuery();
    }

    const l = this.lang(ctx);

    await ctx.reply(this.t.t('auth.welcome', l), {
      parse_mode: 'Markdown',
      ...Markup.keyboard([
        [Markup.button.contactRequest(this.t.t('auth.btn_share_phone', l))],
      ])
        .oneTime()
        .resize(),
    });

    ctx.wizard.next();
  }

  @WizardStep(3)
  async handlePhone(ctx: BotContext) {
    const l = this.lang(ctx);

    if (!ctx.message || !('contact' in ctx.message)) {
      await ctx.reply(
        this.t.t('auth.phone_prompt', l),
        Markup.keyboard([
          [Markup.button.contactRequest(this.t.t('auth.btn_share_phone', l))],
        ])
          .oneTime()
          .resize(),
      );
      return;
    }

    const contact = ctx.message.contact;

    if (contact.user_id !== ctx.from?.id) {
      await ctx.reply(this.t.t('auth.phone_own_only', l), {
        parse_mode: 'Markdown',
      });
      return;
    }

    const phone = contact.phone_number;
    ctx.session.phone = phone;

    try {
      const existingUser = await this.userService.findByPhone(phone);

      if (existingUser) {
        ctx.session.userId = existingUser.id;
        ctx.session.name = existingUser.name ?? '';
        ctx.session.locale = (existingUser.locale as 'en' | 'ru' | 'uz') ?? l;

        this.logger.log(`Existing user logged in: ${phone}`);

        await ctx.reply(
          this.t.t('auth.welcome_back', ctx.session.locale, {
            name: existingUser.name ?? '',
          }),
          { parse_mode: 'Markdown', reply_markup: { remove_keyboard: true } },
        );

        await ctx.scene.enter(SCENES.DASHBOARD);
        return;
      }

      await ctx.reply(this.t.t('auth.ask_name', l), {
        parse_mode: 'Markdown',
        reply_markup: { remove_keyboard: true },
      });

      ctx.wizard.next();
    } catch (error) {
      this.logger.error(error);
      await ctx.reply(this.t.t('auth.error', l));
      await ctx.scene.leave();
    }
  }

  @WizardStep(4)
  async handleName(ctx: BotContext) {
    const l = this.lang(ctx);
    const text =
      ctx.message && 'text' in ctx.message ? ctx.message.text.trim() : '';

    if (!text || text.length < 2) {
      await ctx.reply(this.t.t('auth.name_too_short', l));
      return;
    }

    ctx.session.name = text;

    try {
      const user = await this.userService.findOrCreateByTelegram(
        String(ctx.from?.id ?? ''),
        {
          name: text,
          phone: ctx.session.phone!,
          locale: l,
        },
      );

      ctx.session.userId = user.id;

      this.logger.log(`New user registered: ${text}`);

      await ctx.reply(this.t.t('auth.registered', l, { name: text }), {
        parse_mode: 'Markdown',
        reply_markup: { remove_keyboard: true },
      });

      await ctx.scene.enter(SCENES.DASHBOARD);
    } catch (error) {
      this.logger.error(error);
      await ctx.reply(this.t.t('auth.error', l));
      await ctx.scene.leave();
    }
  }
}
