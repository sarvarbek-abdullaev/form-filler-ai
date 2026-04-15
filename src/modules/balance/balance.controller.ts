import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  ParseIntPipe,
} from '@nestjs/common';
import { BalanceService } from './balance.service';
import { CreditDebitDto } from './dto/credit-debit.dto';

@Controller('balance')
export class BalanceController {
  constructor(private readonly balanceService: BalanceService) {}

  @Get(':userId')
  async getBalance(@Param('userId', ParseIntPipe) userId: number) {
    return this.balanceService.getBalance(userId);
  }

  @Get(':userId/transactions')
  async getTransactions(@Param('userId', ParseIntPipe) userId: number) {
    return this.balanceService.getTransactions(userId);
  }

  @Post(':userId/credit')
  async credit(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() { amount, note }: CreditDebitDto,
  ) {
    return this.balanceService.credit(userId, amount, note);
  }

  @Post(':userId/debit')
  async debit(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() { amount, note }: CreditDebitDto,
  ) {
    return this.balanceService.debit(userId, amount, note);
  }
}
