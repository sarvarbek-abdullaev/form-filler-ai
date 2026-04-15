import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common';
import {
  TransactionType,
  TransactionStatus,
} from '../../../generated/prisma/enums';

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

  async createPendingTopUp(userId: number, amount: number, fileId?: string) {
    return this.prisma.$transaction(async (tx) => {
      const balance = await tx.balance.upsert({
        where: { userId },
        update: {},
        create: {
          userId,
          amount: 0,
        },
      });

      return tx.transaction.create({
        data: {
          amount,
          type: TransactionType.CREDIT,
          status: TransactionStatus.PENDING,
          fileId,
          balanceId: balance.id,
        },
      });
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
    });
  }

  async approveTopUp(transactionId: number) {
    return this.prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.update({
        where: { id: transactionId },
        data: { status: TransactionStatus.APPROVED },
        include: { balance: true },
      });

      await tx.balance.update({
        where: { id: transaction.balanceId },
        data: { amount: { increment: Number(transaction.amount) } },
      });

      return transaction;
    });
  }

  async rejectTopUp(transactionId: number) {
    return this.prisma.transaction.update({
      where: { id: transactionId },
      data: { status: TransactionStatus.REJECTED },
      include: { balance: true },
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
          status: TransactionStatus.APPROVED,
          balanceId: balance.id,
        },
      });

      return updated;
    });
  }
}
