import { Injectable, Logger } from '@nestjs/common';
import { FormAnalysis, FormField } from '../form-analyzer';
import { GeminiService, GeneratedResponse } from '../gemini';

@Injectable()
export class FormResponseGeneratorService {
  private readonly logger = new Logger(FormResponseGeneratorService.name);

  constructor(private readonly gemini: GeminiService) {}

  async generateResponses(
    form: FormAnalysis,
    n: number,
  ): Promise<GeneratedResponse[]> {
    const BATCH_SIZE = 20;
    const batches = Math.ceil(n / BATCH_SIZE);
    const results: GeneratedResponse[] = [];

    for (let i = 0; i < batches; i++) {
      const batchN = Math.min(BATCH_SIZE, n - results.length);
      const startId = results.length + 1;
      const batch = await this.generateBatch(form, batchN, startId);
      results.push(...batch);
      this.logger.log(
        `Batch ${i + 1}/${batches}: got ${batch.length} responses`,
      );
    }

    return results;
  }

  private async generateBatch(
    form: FormAnalysis,
    n: number,
    startId: number,
  ): Promise<GeneratedResponse[]> {
    const prompt = this.buildPrompt(form, n, startId);
    const responses = await this.gemini.generateFormResponses(prompt);

    if (responses.length !== n) {
      this.logger.warn(`Expected ${n} responses, got ${responses.length}`);
    }

    return this.validateResponses(responses, form.fields);
  }

  private buildPrompt(form: FormAnalysis, n: number, startId: number): string {
    const questionBlock = form.fields
      .map((f) => this.formatField(f))
      .join('\n');

    const exampleAnswers = form.fields.reduce<Record<string, string>>(
      (acc, f) => ({ ...acc, [f.entryId]: '<answer>' }),
      {},
    );

    return `
You are simulating ${n} different survey respondents filling out a form.
Each respondent must have a unique, internally consistent persona (vary seniority, role, opinions, background).

Form title: "${form.title}"${form.description ? `\nForm description: "${form.description}"` : ''}

Questions (use entryId as the key in your answers):
${questionBlock}

Rules:
- dropdown: usually pick ONE value, but if the question says "select all that apply", return comma-separated values- checkbox: pick one or more values from options as a comma-separated string
- linear_scale: respond with a single number between scaleMin and scaleMax (inclusive)
- text/paragraph: write a natural, realistic answer (1-3 sentences for paragraph, brief for text)
- date: use YYYY-MM-DD format
- time: use HH:MM (24h) format
- Required fields must always have an answer
- Never invent options for radio/dropdown/checkbox — only use what is listed

Return ONLY valid JSON, no markdown:
{
  "responses": [
    { "respondent_id": ${startId}, "answers": ${JSON.stringify(exampleAnswers)} },
    ...up to respondent_id ${startId + n - 1}
  ]
}
`.trim();
  }

  private formatField(f: FormField): string {
    const lines: string[] = [
      `- entryId: ${f.entryId} | type: ${f.type} | required: ${f.required}`,
      `  question: ${f.title}`,
    ];

    if (f.description) {
      lines.push(`  description: ${f.description}`);
    }

    if (f.options?.length) {
      lines.push(`  options: ${f.options.join(' | ')}`);
    }

    if (f.type === 'linear_scale') {
      lines.push(
        `  scale: ${f.scaleMin} (${f.scaleMinLabel ?? 'min'}) → ${f.scaleMax} (${f.scaleMaxLabel ?? 'max'})`,
      );
    }

    if (f.validation?.length) {
      const rules = f.validation
        .map((v) => `${v.type}${v.value !== undefined ? `:${v.value}` : ''}`)
        .join(', ');
      lines.push(`  validation: ${rules}`);
    }

    return lines.join('\n');
  }

  private validateResponses(
    responses: GeneratedResponse[],
    fields: FormField[],
  ): GeneratedResponse[] {
    const fieldMap = new Map(fields.map((f) => [f.entryId, f]));

    return responses.map((resp) => {
      const cleaned: Record<string, string> = {};

      for (const [rawKey, value] of Object.entries(resp.answers)) {
        const entryId = Number(rawKey);
        const field = fieldMap.get(entryId);

        this.logger.debug(
          `Field ${entryId} type: ${field?.type}, value: "${value}"`,
        );

        if (!field) {
          this.logger.warn(`Unknown entryId ${entryId} in response, skipping`);
          continue;
        }

        if (field.type === 'linear_scale') {
          const num = Number(value);
          const min = field.scaleMin ?? 1;
          const max = field.scaleMax ?? 5;
          cleaned[rawKey] = String(
            isNaN(num) ? min : Math.min(max, Math.max(min, num)),
          );
          continue;
        }

        if (
          ['radio', 'dropdown'].includes(field.type) &&
          field.options?.length
        ) {
          // treat comma-separated dropdown as multi-select
          if (value.includes(',')) {
            const selected = value.split(',').map((v) => v.trim());
            const valid = selected.filter((s) =>
              field.options!.some((o) => o.toLowerCase() === s.toLowerCase()),
            );
            cleaned[rawKey] = (valid.length ? valid : [field.options[0]]).join(
              ', ',
            );
            continue;
          }

          const match = field.options.find(
            (o) => o.toLowerCase() === value.toLowerCase(),
          );
          if (!match) {
            this.logger.warn(
              `Invalid option "${value}" for field ${entryId}, using first option`,
            );
            cleaned[rawKey] = field.options[0];
            continue;
          }
          cleaned[rawKey] = match;
          continue;
        }

        if (field.type === 'checkbox' && field.options?.length) {
          const selected = value.split(',').map((v) => v.trim());
          const valid = selected.filter((s) =>
            field.options!.some((o) => o.toLowerCase() === s.toLowerCase()),
          );
          cleaned[rawKey] = (valid.length ? valid : [field.options[0]]).join(
            ', ',
          );
          continue;
        }

        cleaned[rawKey] = value;
      }

      for (const field of fields) {
        if (field.required && !(String(field.entryId) in cleaned)) {
          cleaned[String(field.entryId)] = this.fallbackValue(field);
          this.logger.warn(
            `Filled missing required field ${field.entryId} with fallback`,
          );
        }
      }

      return { ...resp, answers: cleaned };
    });
  }

  private fallbackValue(field: FormField): string {
    switch (field.type) {
      case 'radio':
      case 'dropdown':
      case 'checkbox':
        return field.options?.[0] ?? '';
      case 'linear_scale':
        return String(field.scaleMin ?? 1);
      case 'date':
        return '2024-01-01';
      case 'time':
        return '09:00';
      default:
        return 'N/A';
    }
  }
}
