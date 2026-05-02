import { Injectable } from '@nestjs/common';
import { GenerativeModel, GoogleGenerativeAI } from '@google/generative-ai';
import { ConfigService } from '@nestjs/config';
import { IAppConfig } from '../../common';
import { InsertMessageDto } from './dto';

@Injectable()
export class GeminiService {
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;
  constructor(private readonly configService: ConfigService<IAppConfig>) {
    this.genAI = new GoogleGenerativeAI(
      configService.getOrThrow('geminiApiKey'),
    );
    this.model = this.genAI.getGenerativeModel({
      model: 'gemini-2.5-flash-lite',
    });
  }

  async generateResponse(body: InsertMessageDto) {
    try {
      const result = await this.model.generateContent(body.message);
      const response = result.response;
      const text = response.text();

      return {
        message: text,
      };
    } catch (e) {
      console.log(e);
      throw e;
    }
  }

  async generateResponseTest(body: InsertMessageDto) {
    try {
      const prompt = `Generate 10 different responses to this question: "${body.message}". 
  Return as JSON array with this format: [{ "id": 1, "response": "..." }, ...]
  Return only JSON, no markdown.`;

      const result = await this.model.generateContent(prompt);
      const response = result.response;
      const text = response.text();
      const json = JSON.parse(text) as string[];
      return {
        message: json,
      };
    } catch (e) {
      console.log(e);
      throw e;
    }
  }
}
