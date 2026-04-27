import { Injectable, Logger } from '@nestjs/common';
import { FormAnalysis, FormField } from '../form-analyzer';
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

const OPEN_ENDED_PLACEHOLDER = 'test';

@Injectable()
export class FormSubmitterService {
  private readonly logger = new Logger(FormSubmitterService.name);

  async submitMany(options: SubmitOptions): Promise<SubmitResult> {
    const { formId, analysis, count, delayMs = 1000, onProgress } = options;
    let success = 0;
    let failed = 0;

    for (let i = 1; i <= count; i++) {
      try {
        if (analysis.isMultiPage) {
          await this.submitMultiPage(formId, analysis);
        } else {
          await this.submitSinglePage(formId, analysis);
        }
        success++;
        this.logger.log(`[${i}/${count}] ✅`);
      } catch (err) {
        failed++;
        this.logger.error(
          `[${i}/${count}] ❌ ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      if (onProgress) await onProgress(i);
      if (i < count) await this.delay(delayMs);
    }

    return { success, failed };
  }

  // ─── Single Page ───────────────────────────────────────────────────────────

  async submitSinglePage(
    formId: string,
    analysis: FormAnalysis,
  ): Promise<void> {
    const fbzx = this.randomFbzx();
    const params = new URLSearchParams();

    for (const field of analysis.fields) {
      this.appendField(params, field);
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
  ): Promise<void> {
    const fbzx = this.randomFbzx();
    const accumulated: FieldAnswer[] = [];
    const pages = analysis.pages;
    const lastPage = pages.length;

    // page 0 — initial load, empty partialResponse
    await this.post(formId, this.buildPageParams([], 0, fbzx, accumulated));
    await this.delay(300);

    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
      const page = pages[pageIndex];
      const isLastPage = pageIndex === lastPage - 1;
      const pageNum = pageIndex + 1;

      const pageAnswers: FieldAnswer[] = page.fields
        .map((field) => this.resolveAnswer(field))
        .filter((a): a is FieldAnswer => a !== null);

      const params = this.buildPageParams(
        page.fields,
        pageNum,
        fbzx,
        accumulated,
        isLastPage,
      );

      await this.post(formId, params);

      // accumulate AFTER posting this page
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
  ): URLSearchParams {
    const params = new URLSearchParams();

    for (const field of fields) {
      this.appendField(params, field);
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

  private appendField(params: URLSearchParams, field: FormField): void {
    const value = this.generateValue(field);
    if (value === null) return;

    if (Array.isArray(value)) {
      for (const v of value) {
        params.append(`entry.${field.entryId}`, v);
      }
    } else {
      params.set(`entry.${field.entryId}`, value);
    }

    // sentinel AFTER the field value, only for radio/checkbox/dropdown
    if (['radio', 'checkbox', 'dropdown'].includes(field.type)) {
      params.set(`entry.${field.entryId}_sentinel`, '');
    }
  }

  private resolveAnswer(field: FormField): FieldAnswer | null {
    const value = this.generateValue(field);
    if (value === null) return null;
    const str = Array.isArray(value) ? value[0] : value;
    return [field.entryId, str];
  }

  private generateValue(field: FormField): string | string[] | null {
    switch (field.type) {
      case 'radio':
      case 'dropdown':
        return field.options?.length ? this.randomChoice(field.options) : null;

      case 'checkbox': {
        if (!field.options?.length) return null;
        const shuffled = [...field.options].sort(() => Math.random() - 0.5);
        const count = this.randomChoice([1, 2, 2, 3]);
        return shuffled.slice(0, Math.min(count, shuffled.length));
      }

      case 'linear_scale': {
        const min = field.scaleMin ?? 1;
        const max = field.scaleMax ?? 5;
        const weights = Array.from({ length: max - min + 1 }, (_, i) => {
          const val = min + i;
          return val >= max - 1 ? 3 : 1;
        });
        return String(this.weightedRandom(min, max, weights));
      }

      case 'text':
      case 'paragraph':
        return this.generateTextValue(field);

      case 'date':
        return this.randomDate();

      case 'time':
        return this.randomTime();

      default:
        return null;
    }
  }

  private generateTextValue(field: FormField): string {
    const rules = field.validation ?? [];

    const isEmail = rules.some((r) => r.type === 'is_email');
    const isUrl = rules.some((r) => r.type === 'is_url');
    const isNumber = rules.some(
      (r) => r.type === 'is_number' || r.type === 'is_whole_number',
    );
    const minLength = rules.find((r) => r.type === 'min_length')?.value as
      | number
      | undefined;
    const maxLength = rules.find((r) => r.type === 'max_length')?.value as
      | number
      | undefined;
    const minValue = rules.find((r) => r.type === 'min_value')?.value as
      | number
      | undefined;
    const maxValue = rules.find((r) => r.type === 'max_value')?.value as
      | number
      | undefined;

    if (isEmail) {
      return `test${Math.floor(Math.random() * 10000)}@example.com`;
    }

    if (isUrl) {
      return `https://example.com/${Math.random().toString(36).slice(2)}`;
    }

    if (isNumber) {
      const min = minValue ?? 1;
      const max = maxValue ?? 100;
      return String(Math.floor(Math.random() * (max - min + 1)) + min);
    }

    const base = OPEN_ENDED_PLACEHOLDER;

    if (minLength && base.length < minLength) {
      return base
        .repeat(Math.ceil(minLength / base.length))
        .slice(0, minLength + 10);
    }

    if (maxLength && base.length > maxLength) {
      return base.slice(0, maxLength);
    }

    return base;
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private buildPartialResponse(answers: FieldAnswer[], fbzx: string): string {
    if (answers.length === 0) {
      return `[null,null,"${fbzx}"]`;
    }
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

  private randomChoice<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  private weightedRandom(min: number, max: number, weights: number[]): number {
    const total = weights.reduce((a, b) => a + b, 0);
    let rand = Math.random() * total;
    for (let i = 0; i < weights.length; i++) {
      rand -= weights[i];
      if (rand <= 0) return min + i;
    }
    return max;
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
