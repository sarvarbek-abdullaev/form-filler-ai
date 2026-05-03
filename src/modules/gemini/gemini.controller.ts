import { Body, Controller, Post, Get, Query } from '@nestjs/common';
import { GeminiService } from './gemini.service';
import { InsertMessageDto } from './dto';

@Controller('gemini')
export class GeminiController {
  constructor(private readonly geminiService: GeminiService) {}

  @Get()
  async ask(@Query('q') message: string) {
    return await this.geminiService.generateResponse({
      message,
    });
  }

  @Post()
  async sendMessageToGemini(@Body() body: InsertMessageDto) {
    return this.geminiService.generateResponse(body);
  }
}
