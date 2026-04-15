import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common';
import { TransactionType } from '../../../generated/prisma/enums';

@Injectable()
export class BalanceService {
  constructor(private readonly prisma: PrismaService) {}

  async getBalance(userId: number) {
    return this.prisma.balance.findUnique({
      where: { userId },
    });
  }

  async getTransactions(userId: number) {
    return this.prisma.transaction.findMany({
      where: { balance: { userId } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async credit(userId: number, amount: number, note?: string) {
    return this.prisma.$transaction(async (tx) => {
      const balance = await tx.balance.update({
        where: { userId },
        data: { amount: { increment: amount } },
      });

      await tx.transaction.create({
        data: {
          amount,
          type: TransactionType.CREDIT,
          note,
          balanceId: balance.id,
        },
      });

      return balance;
    });
  }

  async debit(userId: number, amount: number, note?: string) {
    return this.prisma.$transaction(async (tx) => {
      const balance = await tx.balance.findUnique({ where: { userId } });

      if (!balance || balance.amount.lessThan(amount)) {
        throw new Error('Insufficient balance');
      }

      const updated = await tx.balance.update({
        where: { userId },
        data: { amount: { decrement: amount } },
      });

      await tx.transaction.create({
        data: {
          amount,
          type: TransactionType.DEBIT,
          note,
          balanceId: balance.id,
        },
      });

      return updated;
    });
  }
}
