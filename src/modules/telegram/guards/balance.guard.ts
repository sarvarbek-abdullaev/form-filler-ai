import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common';
import { UserService } from '../../user';
import { TelegrafExecutionContext } from 'nestjs-telegraf';
import type { BotContext } from '../interfaces';
import { Markup } from 'telegraf';
import { FormAnalyzerService } from '../../form-analyzer';

@Injectable()
export class BalanceGuard implements CanActivate {
  constructor(
    private readonly userService: UserService,
    private readonly prisma: PrismaService,
    private readonly formAnalyzerService: FormAnalyzerService,
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

    const { price } = await this.formAnalyzerService.analyze(
      job.formUrl,
      job.entries,
    );

    const required = price!.totalPrice;

    if (balance < required) {
      const short = required - balance;

      await ctx.answerCbQuery('💸 Not enough balance');

      await ctx.reply(
        `💸 *Insufficient balance*\n\n` +
          `💰 Your balance: *${balance} UZS*\n` +
          `📉 Required: *${price?.totalFormatted}*\n` +
          `❗ Missing: *${short} UZS*\n\n` +
          `Entries: × ${job.entries}\n\n` +
          `Please top up and try again`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('💳 Top Up Balance', 'balance_topup')],
          ]),
          reply_parameters: ctx.callbackQuery?.message
            ? { message_id: ctx.callbackQuery.message.message_id }
            : undefined,
        },
      );

      return false;
    }

    return true;
  }
}
