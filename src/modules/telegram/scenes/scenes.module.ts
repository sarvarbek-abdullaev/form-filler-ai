import { Module } from '@nestjs/common';
import { HomeScene } from './home/home.scene';
import { AuthScene } from './auth/auth.scene';
import { DashboardScene } from './dashboard/dashboard.scene';
import { UserModule } from '../../user';
import { BalanceModule } from '../../balance';
import { TopUpScene } from './top-up/top-up.scene';

@Module({
  imports: [UserModule, BalanceModule],
  providers: [HomeScene, AuthScene, DashboardScene, TopUpScene],
  exports: [HomeScene, AuthScene, DashboardScene, TopUpScene],
})
export class ScenesModule {}
