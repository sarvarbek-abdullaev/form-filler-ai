import { UseGuards } from '@nestjs/common';
import {
  Scene,
  SceneEnter,
  On,
  Ctx,
  Message,
  Start,
  Next,
} from 'nestjs-telegraf';
import { Markup } from 'telegraf';

import { SCENES } from '../../config';
import { TelegramAuthGuard } from '../../guards';
import { TranslateService } from '../../../translate';
import type { BotContext } from '../../interfaces';
import { ConfigService } from '@nestjs/config';
import { IAppConfig } from '../../../../common';
import { BaseScene } from '../base/base.scene';

@UseGuards(TelegramAuthGuard)
@Scene(SCENES.SUPPORT)
export class SupportScene extends BaseScene {
  constructor(
    private readonly t: TranslateService,
    private readonly configService: ConfigService<IAppConfig>,
  ) {
    super();
  }

  private lang(ctx: BotContext) {
    return ctx.session.locale ?? ctx.from?.language_code ?? 'en';
  }

  private getKeyboard(ctx: BotContext) {
    const l = this.lang(ctx);
    return Markup.keyboard([[this.t.t('support.btn_back', l)]]).resize();
  }

  @SceneEnter()
  async onEnter(@Ctx() ctx: BotContext) {
    const l = this.lang(ctx);

    await ctx.reply(
      `${this.t.t('support.enter', l)}\n\n` +
        `${this.t.t('support.description', l)}\n\n` +
        `${this.t.t('support.email', l, { email: this.configService.get('supportEmail') })}\n` +
        `${this.t.t('support.telegram', l, { username: '@' + this.configService.get('supportTelegram') })}`,
      this.getKeyboard(ctx),
    );
  }

  @Start()
  async start(ctx: BotContext) {
    await super.start(ctx);
  }

  @On('text')
  async onText(
    @Ctx() ctx: BotContext,
    @Message('text') text: string,
    @Next() next: () => Promise<void>,
  ) {
    if (text.startsWith('/')) {
      await super.onBaseText(ctx, text, next);
      return;
    }

    const l = this.lang(ctx);

    switch (text) {
      case this.t.t('support.btn_back', l):
        await ctx.scene.enter(SCENES.DASHBOARD);
        break;

      default:
        await ctx.reply(this.t.t('support.enter', l), this.getKeyboard(ctx));
    }
  }
}
