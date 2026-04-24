import { Module } from '@nestjs/common';
import { FormAnalyzerService } from './form-analyzer.service';

@Module({
  providers: [FormAnalyzerService],
  exports: [FormAnalyzerService],
})
export class FormAnalyzerModule {}
