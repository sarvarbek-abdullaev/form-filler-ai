import { Module } from '@nestjs/common';
import { FormSubmitterService } from './form-submitter.service';

@Module({
  providers: [FormSubmitterService],
  exports: [FormSubmitterService],
})
export class FormSubmitterModule {}
