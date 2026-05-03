import { Module } from '@nestjs/common';
import { FormSubmitterService } from './form-submitter.service';
import { FormResponseGeneratorModule } from '../form-response-generator';

@Module({
  imports: [FormResponseGeneratorModule],
  providers: [FormSubmitterService],
  exports: [FormSubmitterService],
})
export class FormSubmitterModule {}
