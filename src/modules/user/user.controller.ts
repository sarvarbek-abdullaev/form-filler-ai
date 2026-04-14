import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  NotFoundException,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { UserService } from './user.service';
import { Prisma, User } from '../../../generated/prisma/client';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  async getUsers(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('orderBy') orderByField?: string,
    @Query('order') order?: 'asc' | 'desc',
  ): Promise<User[]> {
    return this.userService.getUsers({
      skip: skip ? parseInt(skip, 10) : undefined,
      take: take ? parseInt(take, 10) : undefined,
      orderBy: orderByField ? { [orderByField]: order ?? 'asc' } : undefined,
    });
  }

  @Get(':id')
  async getUserById(@Param('id', ParseIntPipe) id: number): Promise<User> {
    const user = await this.userService.getUser({ id });
    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }
    return user;
  }

  @Post()
  async createUser(@Body() data: Prisma.UserCreateInput): Promise<User> {
    return this.userService.createUser(data);
  }

  @Put(':id')
  async updateUser(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: Prisma.UserUpdateInput,
  ): Promise<User> {
    const existing = await this.userService.getUser({ id });
    if (!existing) {
      throw new NotFoundException(`User with id ${id} not found`);
    }
    return this.userService.updateUser({ where: { id }, data });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteUser(@Param('id', ParseIntPipe) id: number): Promise<void> {
    const existing = await this.userService.getUser({ id });
    if (!existing) {
      throw new NotFoundException(`User with id ${id} not found`);
    }
    await this.userService.deleteUser({ id });
  }
}
