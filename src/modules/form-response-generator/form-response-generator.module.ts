import { Module } from '@nestjs/common';
import { FormResponseGeneratorService } from './form-response-generator.service';
import { GeminiModule } from '../gemini';

@Module({
  imports: [GeminiModule],
  providers: [FormResponseGeneratorService],
  exports: [FormResponseGeneratorService],
})
export class FormResponseGeneratorModule {}
