import type { SurveyQuestion } from '../types';

export type TextAnalyticsReason = 'not_text' | 'personal_data' | 'disabled' | 'not_categorical';

export interface TextAnalyticsEligibility {
  enabled: boolean;
  source?: 'automatic' | 'manual';
  reason?: TextAnalyticsReason;
}

export interface TextCategoryOption {
  label: string;
  count: number;
  percent: number;
}

export interface TextCategorySummary {
  totalAnswered: number;
  options: TextCategoryOption[];
}

const PERSONAL_IDENTIFIER_PATTERNS = [
  /\bho va ten\b/,
  /\bho ten\b/,
  /\bten cua ban\b/,
  /\bban ten gi\b/,
  /\bfull name\b/,
  /\be\s*mail\b/,
  /\bso dien thoai\b/,
  /\bdien thoai\b/,
  /\bphone\b/,
  /\bmobile\b/,
  /\bmssv\b/,
  /\bma sinh vien\b/,
  /\bstudent id\b/,
  /\bcmnd\b/,
  /\bcccd\b/,
  /\bcan cuoc\b/,
  /\bdia chi\b/,
  /\baddress\b/,
  /\bzalo\b/,
  /\bfacebook\b/,
  /\binstagram\b/,
  /\blinkedin\b/,
  /\busername\b/,
  /\btai khoan\b/,
];

const RESEARCH_CATEGORY_PATTERNS = [
  /\btruong\b/,
  /\bdai hoc\b/,
  /\buniversity\b/,
  /\bcollege\b/,
  /\bcao dang\b/,
  /\bnganh\b/,
  /\bchuyen nganh\b/,
  /\bmajor\b/,
  /\bfaculty\b/,
  /\bkhoa\b/,
  /\blop\b/,
  /\bnam hoc\b/,
  /\bnam may\b/,
  /\bnam thu\b/,
  /\byear\b/,
  /\btuoi\b/,
  /\bage\b/,
  /\bgioi tinh\b/,
  /\bgender\b/,
  /\btinh\b/,
  /\bthanh pho\b/,
  /\bdia phuong\b/,
  /\bque quan\b/,
  /\bquoc gia\b/,
  /\bcountry\b/,
  /\bnghe nghiep\b/,
  /\bcong viec\b/,
  /\boccupation\b/,
  /\bthu nhap\b/,
  /\bincome\b/,
];

function decodeCommonHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;|&#160;|&#x0*a0;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

export function cleanTextAnswer(value: unknown): string {
  if (typeof value !== 'string') return '';

  return decodeCommonHtmlEntities(value)
    .replace(/<[^>]*>/g, ' ')
    .normalize('NFC')
    .replace(/\s+/gu, ' ')
    .trim();
}

function toSearchKey(value: string): string {
  return cleanTextAnswer(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLocaleLowerCase('vi-VN')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function getQuestionText(question: SurveyQuestion): string {
  return [question.text, question.label].filter(Boolean).join(' ');
}

export function isPersonalIdentifierQuestion(question: SurveyQuestion): boolean {
  if (question.type !== 'text') return false;
  const prompt = toSearchKey(getQuestionText(question));
  return PERSONAL_IDENTIFIER_PATTERNS.some(pattern => pattern.test(prompt));
}

export function getTextAnalyticsEligibility(question: SurveyQuestion): TextAnalyticsEligibility {
  if (question.type !== 'text') return { enabled: false, reason: 'not_text' };
  if (isPersonalIdentifierQuestion(question)) return { enabled: false, reason: 'personal_data' };
  if (question.textAnalysisMode === 'exclude') return { enabled: false, reason: 'disabled' };
  if (question.textAnalysisMode === 'include') return { enabled: true, source: 'manual' };

  const prompt = toSearchKey(getQuestionText(question));
  return RESEARCH_CATEGORY_PATTERNS.some(pattern => pattern.test(prompt))
    ? { enabled: true, source: 'automatic' }
    : { enabled: false, reason: 'not_categorical' };
}

export function normalizeTextCategoryValue(value: unknown): { key: string; label: string } | null {
  const trimmed = cleanTextAnswer(value)
    .replace(/^[\s.,;:!?()[\]{}“”"'`–—-]+|[\s.,;:!?()[\]{}“”"'`–—-]+$/gu, '')
    .trim();
  if (!trimmed) return null;

  const compactCode = trimmed.replace(/[.\s-]/g, '');
  if (/^[A-Za-z0-9]{2,6}$/.test(compactCode)) {
    return { key: compactCode.toLocaleLowerCase('vi-VN'), label: compactCode.toUpperCase() };
  }

  const key = trimmed.toLocaleLowerCase('vi-VN').replace(/\s+/gu, ' ').trim();
  if (!key) return null;
  const label = trimmed;
  return { key, label };
}

export function summarizeTextCategories(values: unknown[]): TextCategorySummary {
  const categories = new Map<string, { count: number; labels: Map<string, number> }>();
  let totalAnswered = 0;

  for (const value of values) {
    const normalized = normalizeTextCategoryValue(value);
    if (!normalized) continue;

    totalAnswered++;
    const category = categories.get(normalized.key) ?? { count: 0, labels: new Map<string, number>() };
    category.count++;
    category.labels.set(normalized.label, (category.labels.get(normalized.label) ?? 0) + 1);
    categories.set(normalized.key, category);
  }

  const options = [...categories.entries()]
    .map(([key, category]) => {
      const label = [...category.labels.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'vi'))[0]?.[0] ?? key;
      return {
        label,
        count: category.count,
        percent: totalAnswered ? Math.round((category.count / totalAnswered) * 1000) / 10 : 0,
      };
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'vi'));

  return { totalAnswered, options };
}
