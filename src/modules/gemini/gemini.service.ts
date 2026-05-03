import { Injectable, Logger } from '@nestjs/common';
import { GenerativeModel, GoogleGenerativeAI } from '@google/generative-ai';
import { ConfigService } from '@nestjs/config';
import { IAppConfig } from '../../common';
import { InsertMessageDto } from './dto';

export interface GeneratedResponse {
  respondent_id: number;
  answers: Record<string, string>;
}

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;

  constructor(private readonly configService: ConfigService<IAppConfig>) {
    this.genAI = new GoogleGenerativeAI(
      this.configService.getOrThrow('geminiApiKey'),
    );
    this.model = this.genAI.getGenerativeModel({
      model: 'gemini-2.5-flash-lite',
    });
  }

  async generateResponse(body: InsertMessageDto) {
    try {
      const result = await this.model.generateContent(body.message);
      return { message: result.response.text() };
    } catch (e) {
      console.log(e);
      throw e;
    }
  }

  async generateFormResponses(prompt: string): Promise<GeneratedResponse[]> {
    const result = await this.model.generateContent(prompt);
    const raw = result.response
      .text()
      .replace(/```json\n?|```/g, '')
      .trim();

    let parsed: { responses: GeneratedResponse[] };
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      parsed = JSON.parse(raw);
    } catch {
      this.logger.error('Invalid JSON from Gemini:', raw.slice(0, 300));
      throw new Error('Gemini returned invalid JSON');
    }

    if (!Array.isArray(parsed.responses)) {
      throw new Error('Unexpected shape: missing responses array');
    }

    return parsed.responses;
  }
}
