import { Module } from '@nestjs/common';
import { AuthScene } from './auth/auth.scene';
import { DashboardScene } from './dashboard/dashboard.scene';
import { UserModule } from '../../user';
import { BalanceModule } from '../../balance';
import { TopUpScene } from './top-up/top-up.scene';
import { NewJobScene } from './new-job/new-job.scene';
import { MyJobsScene } from './my-jobs/my-jobs.scene';
import { JobModule } from '../../job';
import { FormAnalyzerModule } from '../../form-analyzer';
import { TranslateModule } from '../../translate';
import { SettingsScene } from './settings/settings.scene';
import { SupportScene } from './scenes/support.scene';

@Module({
  imports: [
    UserModule,
    BalanceModule,
    JobModule,
    FormAnalyzerModule,
    TranslateModule,
  ],
  providers: [
    AuthScene,
    DashboardScene,
    TopUpScene,
    NewJobScene,
    MyJobsScene,
    SettingsScene,
    SupportScene,
  ],
  exports: [
    AuthScene,
    DashboardScene,
    TopUpScene,
    NewJobScene,
    MyJobsScene,
    SettingsScene,
    SupportScene,
  ],
})
export class ScenesModule {}
