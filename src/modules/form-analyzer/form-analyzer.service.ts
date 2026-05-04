import { Injectable, Logger } from '@nestjs/common';
import {
  BASE_PRICE_UZS,
  FIELD_SURCHARGE_CAP,
  FIELD_SURCHARGE_STEP,
} from './pricing.constants';

export type FieldType =
  | 'text'
  | 'paragraph'
  | 'radio'
  | 'checkbox'
  | 'dropdown'
  | 'linear_scale'
  | 'date'
  | 'time'
  | 'unknown';

export interface ValidationRule {
  type:
    | 'min_length'
    | 'max_length'
    | 'min_value'
    | 'max_value'
    | 'regex'
    | 'is_number'
    | 'is_email'
    | 'is_url'
    | 'is_whole_number';
  value?: string | number;
  errorMessage?: string;
}

export interface FormField {
  entryId: number;
  title: string;
  description?: string;
  type: FieldType;
  required: boolean;
  options?: string[];
  scaleMin?: number;
  scaleMax?: number;
  scaleMinLabel?: string;
  scaleMaxLabel?: string;
  validation?: ValidationRule[];
}

export interface FormPage {
  title?: string;
  description?: string;
  fields: FormField[];
}

export interface FormAnalysis {
  formId: string;
  title: string;
  description?: string;
  isMultiPage: boolean;
  pageCount: number;
  fieldCount: number;
  pages: FormPage[];
  fields: FormField[];
  price: PriceBreakdown | null;
}

export interface PriceBreakdown {
  basePrice: number;
  fieldSurcharge: number;
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  finalPrice: number;
  totalPrice: number;
  formatted: string;
  totalFormatted: string;
}

type RawData = unknown[][];

const FIELD_TYPE_MAP: Record<number, FieldType> = {
  0: 'text',
  1: 'paragraph',
  2: 'radio',
  3: 'checkbox',
  4: 'dropdown',
  5: 'linear_scale',
  9: 'date',
  10: 'time',
};

const VALIDATION_TYPE_MAP: Record<number, ValidationRule['type']> = {
  1: 'min_value',
  2: 'max_value',
  3: 'is_number',
  4: 'is_whole_number',
  5: 'min_length',
  6: 'max_length',
  7: 'regex',
  8: 'is_email',
  9: 'is_url',
};

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function getNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function getArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

@Injectable()
export class FormAnalyzerService {
  private readonly logger = new Logger(FormAnalyzerService.name);

  async analyze(formUrl: string, count: number): Promise<FormAnalysis> {
    const html = await this.fetchForm(formUrl);
    const data = this.extractFormData(html);
    const formId = this.extractFormId(formUrl);
    const analysis = this.parseFormData(data, formId);

    const price = this.calculateSubmissionPrice(analysis.fieldCount, count);

    return {
      ...analysis,
      price,
    };
  }

  private async fetchForm(url: string): Promise<string> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch form: ${res.status}`);
    return res.text();
  }

  private extractFormData(html: string): RawData {
    const match = html.match(
      /FB_PUBLIC_LOAD_DATA_\s*=\s*(\[[\s\S]*?\]);\s*<\/script>/,
    );
    if (!match?.[1]) throw new Error('Could not find form data in page');

    const parsed: unknown = JSON.parse(match[1]);
    if (!Array.isArray(parsed)) throw new Error('Unexpected form data format');
    return parsed as RawData;
  }

  private parseFormData(data: RawData, formId: string): FormAnalysis {
    const formTitle = getString(data[3]) ?? 'Unknown';
    const formDescription = getString(getArray(data[1])[0]);
    const items = getArray(getArray(data[1])[1]); // data[1][1] is the flat items array

    const parsedPages: FormPage[] = [];
    const allFields: FormField[] = [];

    let currentPage: FormPage = { fields: [] };

    for (const item of items) {
      const itemArr = getArray(item);
      const typeCode = getNumber(itemArr[3]);

      // typeCode 8 = section header → start a new page
      if (typeCode === 8) {
        if (currentPage.fields.length > 0 || currentPage.title) {
          parsedPages.push(currentPage);
        }
        currentPage = {
          title: getString(itemArr[1]),
          description: getString(itemArr[2]),
          fields: [],
        };
        continue;
      }

      const field = this.parseField(itemArr);
      if (field) {
        currentPage.fields.push(field);
        allFields.push(field);
      }
    }

    // push last page
    if (currentPage.fields.length > 0 || currentPage.title) {
      parsedPages.push(currentPage);
    }

    if (parsedPages.length === 0) {
      parsedPages.push({ fields: allFields });
    }

    const isMultiPage = parsedPages.length > 1;

    this.logger.log(
      `Analyzed form "${formTitle}": ${allFields.length} fields across ${parsedPages.length} section(s)`,
    );

    return {
      formId,
      title: formTitle,
      description: formDescription,
      isMultiPage,
      pageCount: parsedPages.length,
      fieldCount: allFields.length,
      pages: parsedPages,
      fields: allFields,
      price: null,
    };
  }

  private parseField(question: unknown[]): FormField | null {
    const fieldDataArr = getArray(question[4]);
    if (fieldDataArr.length === 0) return null;

    const fieldData = getArray(fieldDataArr[0]);
    const entryId = getNumber(fieldData[0]);
    if (!entryId) return null;

    const title = getString(question[1]) ?? '';
    const description = getString(question[2]);
    const typeCode = getNumber(question[3]) ?? -1;
    const required = fieldData[2] === 1;
    const type: FieldType = FIELD_TYPE_MAP[typeCode] ?? 'unknown';

    const field: FormField = { entryId, title, description, type, required };

    if (['radio', 'checkbox', 'dropdown'].includes(type)) {
      field.options = getArray(fieldData[1])
        .map((opt) => getString(getArray(opt)[0]))
        .filter((v): v is string => v !== undefined && v.length > 0);
    }

    if (type === 'linear_scale') {
      const scaleData = getArray(fieldData[3]);
      field.scaleMin = getNumber(scaleData[0]) ?? 1;
      field.scaleMax = getNumber(scaleData[1]) ?? 5;
      field.scaleMinLabel = getString(scaleData[2]);
      field.scaleMaxLabel = getString(scaleData[3]);
    }

    const validationData = fieldData[4];
    if (validationData) {
      field.validation = this.parseValidation(getArray(validationData));
    }

    return field;
  }

  private parseValidation(validationData: unknown[]): ValidationRule[] {
    const rules: ValidationRule[] = [];

    for (const rule of validationData) {
      const ruleArr = getArray(rule);
      const typeCode = getNumber(ruleArr[0]);
      if (typeCode === undefined) continue;

      const type = VALIDATION_TYPE_MAP[typeCode];
      if (!type) continue;

      const rawValue = ruleArr[1];
      const value =
        typeof rawValue === 'string' || typeof rawValue === 'number'
          ? rawValue
          : undefined;

      const errorMessage = getString(ruleArr[2]);

      rules.push({ type, value, errorMessage });
    }

    return rules;
  }

  private extractFormId(formUrl: string): string {
    const match = formUrl.match(/\/d\/e\/([^/]+)\//);
    if (!match?.[1]) throw new Error('Could not extract form ID from URL');
    return match[1];
  }

  getLoyaltyDiscountPercent(totalSubmissions: number): number {
    if (totalSubmissions <= 10) return 0;
    if (totalSubmissions <= 30) return 15;
    if (totalSubmissions <= 70) return 25;
    if (totalSubmissions <= 120) return 40;
    return 55;
  }

  getFieldSurcharge(fieldCount: number): number {
    if (fieldCount <= 10) return 0;

    // Every 10 fields above 10 adds 100 UZS, capped at 300
    const steps = Math.ceil((fieldCount - 10) / 10);
    return Math.min(steps * FIELD_SURCHARGE_STEP, FIELD_SURCHARGE_CAP);
  }

  formatUzs(amount: number): string {
    return amount.toLocaleString('uz-UZ').replace(/,/g, ' ') + ' UZS';
  }

  calculateSubmissionPrice(
    fieldCount: number,
    totalSubmissions: number,
  ): PriceBreakdown {
    const fieldSurcharge = this.getFieldSurcharge(fieldCount);
    const subtotal = BASE_PRICE_UZS + fieldSurcharge;

    const discountPercent = this.getLoyaltyDiscountPercent(totalSubmissions);
    const discountAmount = Math.round((subtotal * discountPercent) / 100);
    const finalPrice = subtotal - discountAmount;
    const totalPrice = finalPrice * totalSubmissions;

    return {
      basePrice: BASE_PRICE_UZS,
      fieldSurcharge,
      subtotal,
      discountPercent,
      discountAmount,
      finalPrice,
      totalPrice,
      formatted: this.formatUzs(finalPrice),
      totalFormatted: this.formatUzs(totalPrice),
    };
  }
}
