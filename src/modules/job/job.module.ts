import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { JobService } from './job.service';
import { FormFillerProcessor } from './form-filler.processor';
import { PrismaService } from '../../common';
import { UserModule } from '../user';
import { JobController } from './job.controller';
import { FormSubmitterService } from '../form-submitter';
import { FormAnalyzerService } from '../form-analyzer';

@Module({
  imports: [BullModule.registerQueue({ name: 'form-filler' }), UserModule],
  controllers: [JobController],
  providers: [
    JobService,
    FormFillerProcessor,
    PrismaService,
    FormAnalyzerService,
    FormSubmitterService,
  ],
  exports: [JobService],
})
export class JobModule {}
