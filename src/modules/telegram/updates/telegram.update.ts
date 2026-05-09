import {
  Start,
  Update,
  Action,
  Ctx,
  Command,
  Context,
  On,
} from 'nestjs-telegraf';
import { Logger, UseGuards } from '@nestjs/common';
import type { BotContext } from '../interfaces';
import { SCENES } from '../config';
import { Public } from '../decorators';
import { UserService } from '../../user';
import { BalanceService } from '../../balance';
import { AdminGuard } from '../decorators/admin.decorator';
import { JobService } from '../../job';
import { Markup } from 'telegraf';
import { BalanceGuard } from '../guards';
import { TranslateService } from '../../translate';

@Public()
@Update()
export class TelegramUpdate {
  private readonly logger = new Logger(TelegramUpdate.name);

  constructor(
    private readonly userService: UserService,
    private readonly balanceService: BalanceService,
    private readonly jobService: JobService,
    private readonly t: TranslateService,
  ) {}

  private lang(ctx: BotContext) {
    return ctx.session.locale ?? ctx.from?.language_code ?? 'en';
  }

  private restoreSession(
    ctx: BotContext,
    account: Awaited<ReturnType<UserService['findAccountByTelegram']>>,
  ) {
    if (!account) return;
    ctx.session.userId = account.user.id;
    ctx.session.name = account.user.name ?? undefined;
    ctx.session.phone = account.user.phone;
    ctx.session.locale =
      (account.user.locale as 'en' | 'ru' | 'uz') ?? this.lang(ctx);
  }

  @Start()
  async start(ctx: BotContext) {
    this.logger.log(`START - ${ctx.from?.id}`);

    if (!ctx.session.userId) {
      const account = await this.userService.findAccountByTelegram(
        String(ctx.from?.id ?? ''),
      );

      if (account) {
        this.restoreSession(ctx, account);
        const l = this.lang(ctx);
        await ctx.reply(
          this.t.t('common.welcome_back', l, { name: ctx.session.name ?? '' }),
        );
        await ctx.scene.enter(SCENES.DASHBOARD);
        return;
      }
    } else {
      const l = this.lang(ctx);
      await ctx.reply(
        this.t.t('common.welcome_back', l, { name: ctx.session.name ?? '' }),
      );
      await ctx.scene.enter(SCENES.DASHBOARD);
      return;
    }

    await ctx.scene.enter(SCENES.AUTH);
  }

  @On('message')
  @Public()
  async onMessage(@Ctx() ctx: BotContext) {
    if (!ctx.session.userId) {
      const account = await this.userService.findAccountByTelegram(
        String(ctx.from?.id ?? ''),
      );

      if (account) {
        this.restoreSession(ctx, account);
        await ctx.scene.enter(SCENES.DASHBOARD);
        return;
      }

      await ctx.scene.enter(SCENES.AUTH);
    }
  }

  @Command('admin')
  @UseGuards(AdminGuard)
  async switchToAdmin(@Context() ctx: BotContext) {
    await ctx.reply("You're now in admin mode.");
  }

  @Action(/topup_approve:(\d+)/)
  async onApprove(@Ctx() ctx: BotContext) {
    const dataExists = 'data' in ctx.callbackQuery!;
    if (!dataExists) return;

    const data = ctx.callbackQuery.data;
    const transactionId = data.split(':')[1];

    const transaction = await this.balanceService.approveTopUp(
      Number(transactionId),
    );

    if (!transaction) {
      await ctx.answerCbQuery('⚠️ Request not found');
      return;
    }

    const account = await this.userService.findAccountByUserId(
      transaction.balance.userId,
    );

    if (account) {
      const locale = (account.user.locale ?? 'en') as 'en' | 'ru' | 'uz';
      const amount = Number(transaction.amount).toLocaleString();

      await ctx.telegram.sendMessage(
        account.providerId,
        this.t.t('top_up.approved', locale, { amount }),
        { parse_mode: 'Markdown' },
      );
    }

    await ctx.telegram.callApi('setMessageReaction', {
      chat_id: ctx.chat!.id,
      message_id: ctx.callbackQuery?.message!.message_id,
      reaction: [{ type: 'emoji', emoji: '👍' }],
    });

    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    await ctx.answerCbQuery('✅ Approved');
  }

  @Action(/topup_reject:(\d+)/)
  async onReject(@Ctx() ctx: BotContext) {
    const dataExists = 'data' in ctx.callbackQuery!;
    if (!dataExists) return;

    const data = ctx.callbackQuery.data;
    const transactionId = data.split(':')[1];

    const transaction = await this.balanceService.rejectTopUp(
      Number(transactionId),
    );

    if (!transaction) {
      await ctx.answerCbQuery('⚠️ Request not found');
      return;
    }

    const account = await this.userService.findAccountByUserId(
      transaction.balance.userId,
    );

    if (account) {
      const locale = (account.user.locale ?? 'en') as 'en' | 'ru' | 'uz';
      const amount = Number(transaction.amount).toLocaleString();

      await ctx.telegram.sendMessage(
        account.providerId,
        this.t.t('top_up.rejected', locale, { amount }),
        { parse_mode: 'Markdown' },
      );
    }

    await ctx.telegram.callApi('setMessageReaction', {
      chat_id: ctx.chat!.id,
      message_id: ctx.callbackQuery?.message!.message_id,
      reaction: [{ type: 'emoji', emoji: '👎' }],
    });

    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    await ctx.answerCbQuery('❌ Rejected');
  }

  @UseGuards(BalanceGuard)
  @Action(/job_run:(\d+)/)
  async onRun(@Ctx() ctx: BotContext & { match: RegExpExecArray }) {
    const jobId = parseInt(ctx.match[1]);

    await this.jobService.runJob(jobId);

    await ctx.answerCbQuery('▶️ Job queued!');
    await ctx.editMessageReplyMarkup(Markup.inlineKeyboard([]).reply_markup);
  }

  @Action('balance_topup')
  async onTopUp(@Ctx() ctx: BotContext) {
    await ctx.answerCbQuery();
    await ctx.scene.enter(SCENES.TOP_UP);
  }
}
