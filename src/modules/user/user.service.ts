import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common';
import { Prisma, User } from '../../../generated/prisma/client';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  async getUser(
    userWhereUniqueInput: Prisma.UserWhereUniqueInput,
  ): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: userWhereUniqueInput,
    });
  }

  async findAccountByTelegram(telegramId: string) {
    return this.prisma.account.findUnique({
      where: {
        provider_providerId: { provider: 'telegram', providerId: telegramId },
      },
      include: { user: true },
    });
  }

  async findOrCreateByTelegram(
    telegramId: string,
    data: { email: string; name?: string },
  ): Promise<User> {
    const existing = await this.prisma.account.findUnique({
      where: {
        provider_providerId: { provider: 'telegram', providerId: telegramId },
      },
      include: { user: true },
    });

    if (existing) return existing.user;

    return this.prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        accounts: {
          create: { provider: 'telegram', providerId: telegramId },
        },
      },
    });
  }

  async findAccountByUserId(userId: number) {
    return this.prisma.account.findFirst({
      where: { userId, provider: 'telegram' },
    });
  }

  async getUsers(params: {
    skip?: number;
    take?: number;
    cursor?: Prisma.UserWhereUniqueInput;
    where?: Prisma.UserWhereInput;
    orderBy?: Prisma.UserOrderByWithRelationInput;
  }): Promise<User[]> {
    const { skip, take, cursor, where, orderBy } = params;
    return this.prisma.user.findMany({
      skip,
      take,
      cursor,
      where,
      orderBy,
    });
  }

  async createUser(data: Prisma.UserCreateInput): Promise<User> {
    return this.prisma.user.create({
      data,
    });
  }

  async updateUser(params: {
    where: Prisma.UserWhereUniqueInput;
    data: Prisma.UserUpdateInput;
  }): Promise<User> {
    const { where, data } = params;
    return this.prisma.user.update({
      data,
      where,
    });
  }

  async deleteUser(where: Prisma.UserWhereUniqueInput): Promise<User> {
    return this.prisma.user.delete({
      where,
    });
  }
}
