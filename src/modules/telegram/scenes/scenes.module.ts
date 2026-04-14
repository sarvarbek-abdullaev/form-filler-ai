import { Module } from '@nestjs/common';
import { HomeScene } from './home/home.scene';
import { AuthScene } from './auth/auth.scene';
import { DashboardScene } from './dashboard/dashboard.scene';

@Module({
  providers: [HomeScene, AuthScene, DashboardScene],
  exports: [HomeScene, AuthScene, DashboardScene],
})
export class ScenesModule {}
