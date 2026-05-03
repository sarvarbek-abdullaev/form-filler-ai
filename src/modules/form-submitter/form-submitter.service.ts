import { Injectable, Logger } from '@nestjs/common';
import { FormAnalysis, FormField } from '../form-analyzer';
import { FormResponseGeneratorService } from '../form-response-generator';
import * as https from 'https';

interface SubmitOptions {
  formId: string;
  analysis: FormAnalysis;
  count: number;
  delayMs?: number;
  onProgress?: (completed: number) => Promise<void>;
}

interface SubmitResult {
  success: number;
  failed: number;
}

type FieldAnswer = [number, string];

@Injectable()
export class FormSubmitterService {
  private readonly logger = new Logger(FormSubmitterService.name);

  constructor(
    private readonly formResponseGenerator: FormResponseGeneratorService,
  ) {}

  async submitMany(options: SubmitOptions): Promise<SubmitResult> {
    const { formId, analysis, count, delayMs = 1000, onProgress } = options;
    let success = 0;
    let failed = 0;

    this.logger.log(`Generating ${count} AI responses...`);
    const generatedResponses =
      await this.formResponseGenerator.generateResponses(analysis, count);

    for (let i = 0; i < count; i++) {
      const response = generatedResponses[i];
      if (!response) {
        this.logger.warn(`No generated response for index ${i}, skipping`);
        failed++;
        continue;
      }

      try {
        if (analysis.isMultiPage) {
          await this.submitMultiPage(formId, analysis, response.answers);
        } else {
          await this.submitSinglePage(formId, analysis, response.answers);
        }
        success++;
        this.logger.log(`[${i + 1}/${count}] ✅`);
      } catch (err) {
        failed++;
        this.logger.error(
          `[${i + 1}/${count}] ❌ ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      if (onProgress) await onProgress(i + 1);
      if (i < count - 1) await this.delay(delayMs);
    }

    return { success, failed };
  }

  // ─── Single Page ───────────────────────────────────────────────────────────

  async submitSinglePage(
    formId: string,
    analysis: FormAnalysis,
    answers: Record<string, string>,
  ): Promise<void> {
    const fbzx = this.randomFbzx();
    const params = new URLSearchParams();

    for (const field of analysis.fields) {
      this.appendField(params, field, answers);
    }

    params.set('fvv', '1');
    params.set('partialResponse', `[null,null,"${fbzx}"]`);
    params.set('pageHistory', '0');
    params.set('fbzx', fbzx);
    params.set('submissionTimestamp', Date.now().toString());

    await this.post(formId, params);
  }

  // ─── Multi Page ────────────────────────────────────────────────────────────

  private async submitMultiPage(
    formId: string,
    analysis: FormAnalysis,
    answers: Record<string, string>,
  ): Promise<void> {
    const fbzx = this.randomFbzx();
    const accumulated: FieldAnswer[] = [];
    const pages = analysis.pages;
    const lastPage = pages.length;

    await this.post(formId, this.buildPageParams([], 0, fbzx, accumulated));
    await this.delay(300);

    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
      const page = pages[pageIndex];
      const isLastPage = pageIndex === lastPage - 1;
      const pageNum = pageIndex + 1;

      const pageAnswers: FieldAnswer[] = page.fields
        .map((field) => this.resolveAnswer(field, answers))
        .filter((a): a is FieldAnswer => a !== null);

      const params = this.buildPageParams(
        page.fields,
        pageNum,
        fbzx,
        accumulated,
        isLastPage,
        answers,
      );

      await this.post(formId, params);

      accumulated.push(...pageAnswers);
      await this.delay(300);
    }
  }

  private buildPageParams(
    fields: FormField[],
    pageNum: number,
    fbzx: string,
    accumulated: FieldAnswer[],
    isLastPage = false,
    answers: Record<string, string> = {},
  ): URLSearchParams {
    const params = new URLSearchParams();

    for (const field of fields) {
      this.appendField(params, field, answers);
    }

    params.set('fvv', '1');
    params.set('partialResponse', this.buildPartialResponse(accumulated, fbzx));
    params.set(
      'pageHistory',
      Array.from({ length: pageNum + 1 }, (_, i) => i).join(','),
    );
    params.set('fbzx', fbzx);
    params.set(
      'submissionTimestamp',
      isLastPage ? Date.now().toString() : '-1',
    );

    if (!isLastPage) {
      params.set('continue', '1');
      params.set('dlut', Date.now().toString());
      params.set('hud', 'true');
    }

    return params;
  }

  // ─── Field Handling ────────────────────────────────────────────────────────

  private appendField(
    params: URLSearchParams,
    field: FormField,
    answers: Record<string, string>,
  ): void {
    const value = this.resolveValue(field, answers);
    if (value === null) return;

    if (Array.isArray(value)) {
      for (const v of value) {
        params.append(`entry.${field.entryId}`, v);
      }
    } else {
      params.set(`entry.${field.entryId}`, value);
    }

    if (['radio', 'checkbox', 'dropdown'].includes(field.type)) {
      params.set(`entry.${field.entryId}_sentinel`, '');
    }
  }

  private resolveAnswer(
    field: FormField,
    answers: Record<string, string>,
  ): FieldAnswer | null {
    const value = this.resolveValue(field, answers);
    if (value === null) return null;
    const str = Array.isArray(value) ? value[0] : value;
    return [field.entryId, str];
  }

  private resolveValue(
    field: FormField,
    answers: Record<string, string>,
  ): string | string[] | null {
    const aiAnswer = answers[String(field.entryId)];

    if (aiAnswer !== undefined) {
      // checkbox or multi-select dropdown: split comma-separated into array
      if (
        field.type === 'checkbox' ||
        (field.type === 'dropdown' && aiAnswer.includes(','))
      ) {
        return aiAnswer.split(',').map((v) => v.trim());
      }
      return aiAnswer;
    }

    // fallback for any field Gemini missed
    this.logger.warn(
      `No AI answer for entryId ${field.entryId}, using fallback`,
    );
    return this.fallbackValue(field);
  }

  private fallbackValue(field: FormField): string | string[] | null {
    switch (field.type) {
      case 'radio':
      case 'dropdown':
        return field.options?.[0] ?? null;
      case 'checkbox':
        return field.options?.slice(0, 1) ?? null;
      case 'linear_scale':
        return String(field.scaleMin ?? 1);
      case 'text':
      case 'paragraph':
        return 'N/A';
      case 'date':
        return this.randomDate();
      case 'time':
        return this.randomTime();
      default:
        return null;
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private buildPartialResponse(answers: FieldAnswer[], fbzx: string): string {
    if (answers.length === 0) return `[null,null,"${fbzx}"]`;
    const arr = answers.map(([id, val]) => [null, id, [val], 0]);
    return `[${JSON.stringify(arr)},null,"${fbzx}"]`;
  }

  private post(formId: string, params: URLSearchParams): Promise<number> {
    return new Promise((resolve, reject) => {
      const body = params.toString();
      const options = {
        hostname: 'docs.google.com',
        path: `/forms/u/0/d/e/${formId}/formResponse`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          Referer: `https://docs.google.com/forms/d/e/${formId}/viewform`,
          Origin: 'https://docs.google.com',
        },
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (c: string) => (data += c));
        res.on('end', () => {
          const status = res.statusCode ?? 0;
          if (status !== 200 && status !== 302) {
            reject(new Error(`Unexpected status: ${status}`));
          } else {
            resolve(status);
          }
        });
      });

      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  private randomFbzx(): string {
    const max = 9007199254740991n;
    const rand = BigInt(Math.floor(Math.random() * Number(max)));
    return `-${rand.toString()}`;
  }

  private randomDate(): string {
    const start = new Date(1980, 0, 1);
    const end = new Date(2000, 11, 31);
    const d = new Date(
      start.getTime() + Math.random() * (end.getTime() - start.getTime()),
    );
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private randomTime(): string {
    const h = Math.floor(Math.random() * 24);
    const m = Math.floor(Math.random() * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
