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

@Public()
@Update()
export class TelegramUpdate {
  private readonly logger = new Logger(TelegramUpdate.name);

  constructor(
    private readonly userService: UserService,
    private readonly balanceService: BalanceService,
    private readonly jobService: JobService,
  ) {}

  @Start()
  async start(ctx: BotContext) {
    this.logger.log(`START - ${ctx.from?.id}`);

    if (!ctx.session.userId) {
      const account = await this.userService.findAccountByTelegram(
        String(ctx.from?.id ?? ''),
      );

      if (account) {
        ctx.session.userId = account.user.id;
        ctx.session.name = account.user.name ?? undefined;
        ctx.session.phone = account.user.phone;

        await ctx.reply('👋 Welcome back!');
        await ctx.scene.enter(SCENES.DASHBOARD);
        return;
      }
    } else {
      await ctx.reply('👋 Welcome back!');
      await ctx.scene.enter(SCENES.DASHBOARD);
      return;
    }

    await ctx.reply('👋 Welcome! Please register to continue.');
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
        ctx.session.userId = account.user.id;
        ctx.session.name = account.user.name ?? undefined;
        ctx.session.phone = account.user.phone ?? undefined;

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
      await ctx.telegram.sendMessage(
        account.providerId,
        `✅ Your top up of *${Number(transaction.amount).toLocaleString()} UZS* has been approved!`,
        { parse_mode: 'Markdown' },
      );
    }

    await ctx.telegram.callApi('setMessageReaction', {
      chat_id: ctx.chat!.id,
      message_id: ctx.callbackQuery?.message!.message_id,
      reaction: [
        {
          type: 'emoji',
          emoji: '👍',
        },
      ],
    });

    await ctx.editMessageReplyMarkup({
      inline_keyboard: [],
    });

    await ctx.answerCbQuery('✅ Approved');
  }

  @Action(/topup_reject:(\d+)/)
  async onReject(@Ctx() ctx: BotContext) {
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
      await ctx.telegram.sendMessage(
        account.providerId,
        `❌ Your top up of *${Number(transaction.amount).toLocaleString()} UZS* has been rejected. Please contact support.`,
        { parse_mode: 'Markdown' },
      );
    }

    await ctx.telegram.callApi('setMessageReaction', {
      chat_id: ctx.chat!.id,
      message_id: ctx.callbackQuery?.message!.message_id,
      reaction: [
        {
          type: 'emoji',
          emoji: '👎',
        },
      ],
    });

    await ctx.editMessageReplyMarkup({
      inline_keyboard: [],
    });

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
