import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common';
import { UserService } from '../../user';
import { TelegrafExecutionContext } from 'nestjs-telegraf';
import type { BotContext } from '../interfaces';
import { Markup } from 'telegraf';

@Injectable()
export class BalanceGuard implements CanActivate {
  constructor(
    private readonly userService: UserService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const ctx =
      TelegrafExecutionContext.create(context).getContext<BotContext>();

    const telegramId = ctx.from?.id ? String(ctx.from.id) : null;
    if (!telegramId) return false;

    const account = await this.userService.findAccountByTelegram(telegramId);
    if (!account) return false;

    const balance = Number(account.user.balance?.amount ?? 0);
    if (!balance) return false;

    // @ts-ignore
    const jobId = ctx.match ? parseInt(ctx.match[1]) : null;
    if (!jobId) return false;

    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
    });
    if (!job) return false;

    // TODO: write an util that calculate the price based on some other logic which supports discounts
    const rate = 1000;
    const required = job.entries * rate;

    if (balance < required) {
      const short = required - balance;

      await ctx.answerCbQuery('💸 Not enough balance');

      const message =
        `💸 *Insufficient balance*\n\n` +
        `💰 Your balance: *${balance}*\n` +
        `📉 Required: *${required}*\n` +
        `❗ Missing: *${short}*\n\n` +
        `Please top up and click to rerun`;

      await ctx.reply(message, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('💳 Top Up Balance', 'balance_topup')],
        ]),
        reply_parameters: ctx.callbackQuery?.message
          ? { message_id: ctx.callbackQuery.message.message_id }
          : undefined,
      });

      return false;
    }

    if (balance < required) {
      const message = '💸 Not enough balance';
      await ctx.answerCbQuery(message);
      await ctx.reply(message, {
        reply_parameters: {
          // @ts-ignore
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access
          message_id: ctx.update?.callback_query.message.message_id,
        },
      });
      return false;
    }

    return true;
  }
}
