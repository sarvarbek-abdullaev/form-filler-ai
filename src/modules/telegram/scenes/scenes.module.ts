import { Module } from '@nestjs/common';
import { HomeScene } from './home/home.scene';
import { AuthScene } from './auth/auth.scene';
import { DashboardScene } from './dashboard/dashboard.scene';
import { UserModule } from '../../user';
import { BalanceModule } from '../../balance';
import { TopUpScene } from './top-up/top-up.scene';
import { NewJobScene } from './new-job/new-job.scene';
import { MyJobsScene } from './my-jobs/my-jobs.scene';
import { JobModule } from '../../job';
import { FormAnalyzerModule } from '../../form-analyzer';

@Module({
  imports: [UserModule, BalanceModule, JobModule, FormAnalyzerModule],
  providers: [
    HomeScene,
    AuthScene,
    DashboardScene,
    TopUpScene,
    NewJobScene,
    MyJobsScene,
  ],
  exports: [
    HomeScene,
    AuthScene,
    DashboardScene,
    TopUpScene,
    NewJobScene,
    MyJobsScene,
  ],
})
export class ScenesModule {}
