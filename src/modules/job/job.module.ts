import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { JobService } from './job.service';
import { FormFillerProcessor } from './form-filler.processor';
import { PrismaService } from '../../common';
import { UserModule } from '../user';
import { JobController } from './job.controller';

@Module({
  imports: [BullModule.registerQueue({ name: 'form-filler' }), UserModule],
  controllers: [JobController],
  providers: [JobService, FormFillerProcessor, PrismaService],
  exports: [JobService],
})
export class JobModule {}
