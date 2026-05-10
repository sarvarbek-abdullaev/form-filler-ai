import { UseGuards } from '@nestjs/common';
import { Scene, SceneEnter, On, Ctx, Message, Start } from 'nestjs-telegraf';
import { Markup } from 'telegraf';

import { SCENES } from '../../config';
import { TelegramAuthGuard } from '../../guards';
import { BalanceService } from '../../../balance';
import { TranslateService } from '../../../translate';
import type { BotContext } from '../../interfaces';
import { BaseScene } from '../base/base.scene';

@UseGuards(TelegramAuthGuard)
@Scene(SCENES.DASHBOARD)
export class DashboardScene extends BaseScene {
  constructor(
    private readonly balanceService: BalanceService,
    private readonly t: TranslateService,
  ) {
    super();
  }

  private lang(ctx: BotContext) {
    return ctx.session.locale ?? ctx.from?.language_code ?? 'en';
  }

  private getKeyboard(ctx: BotContext) {
    const l = this.lang(ctx);
    const btn = (key: string) => this.t.t(`dashboard.${key}`, l);

    return Markup.keyboard([
      [btn('btn_auto_fill')],
      [btn('btn_top_up')],
      [btn('btn_history'), btn('btn_profile')],
      [btn('btn_settings'), btn('btn_support')],
    ]).resize();
  }

  private getProfileKeyboard(ctx: BotContext) {
    const l = this.lang(ctx);
    return Markup.keyboard([
      [this.t.t('dashboard.btn_logout', l)],
      [this.t.t('dashboard.btn_back', l)],
    ]).resize();
  }

  @SceneEnter()
  async onEnter(@Ctx() ctx: BotContext) {
    await ctx.reply(
      this.t.t('dashboard.enter', this.lang(ctx)),
      this.getKeyboard(ctx),
    );
  }

  @Start()
  async start(ctx: BotContext) {
    await super.start(ctx);
  }

  @On('text')
  async onText(@Ctx() ctx: BotContext, @Message('text') text: string) {
    const l = this.lang(ctx);

    switch (text) {
      case this.t.t('dashboard.btn_auto_fill', l):
        await ctx.scene.enter(SCENES.NEW_JOB);
        break;

      case this.t.t('dashboard.btn_top_up', l):
        await ctx.scene.enter(SCENES.TOP_UP);
        break;

      case this.t.t('dashboard.btn_history', l):
        await ctx.scene.enter(SCENES.MY_JOBS);
        break;

      case this.t.t('dashboard.btn_profile', l):
        await this.handleProfile(ctx);
        break;

      case this.t.t('dashboard.btn_logout', l):
        await this.handleLogout(ctx);
        break;

      case this.t.t('dashboard.btn_back', l):
        await ctx.scene.reenter();
        break;

      case this.t.t('dashboard.btn_settings', l):
        await ctx.scene.enter(SCENES.SETTINGS);
        break;

      case this.t.t('dashboard.btn_support', l):
        await ctx.scene.enter(SCENES.SUPPORT);
        break;

      default:
        await ctx.reply(
          this.t.t('dashboard.use_menu', l),
          this.getKeyboard(ctx),
        );
    }
  }

  private async handleProfile(ctx: BotContext) {
    const l = this.lang(ctx);
    const balance = await this.balanceService.getBalance(ctx.session.userId!);
    const amount = Number(balance?.amount ?? 0).toLocaleString();

    await ctx.reply(
      `${this.t.t('dashboard.profile_title', l)}\n\n` +
        `${this.t.t('dashboard.profile_name', l)}: ${ctx.session.name ?? '—'}\n` +
        `${this.t.t('dashboard.profile_phone', l)}: ${ctx.session.phone ?? '—'}\n\n` +
        `${this.t.t('dashboard.profile_balance', l)}: *${amount} UZS*`,
      { parse_mode: 'Markdown', ...this.getProfileKeyboard(ctx) },
    );
  }

  private async handleLogout(ctx: BotContext) {
    const l = this.lang(ctx);

    ctx.session.userId = undefined;
    ctx.session.name = undefined;
    ctx.session.phone = undefined;
    ctx.session.mode = undefined;
    ctx.session.locale = undefined;

    await ctx.reply(this.t.t('dashboard.farewell', l), {
      reply_markup: { remove_keyboard: true },
    });
    await ctx.scene.enter(SCENES.AUTH);
  }
}
