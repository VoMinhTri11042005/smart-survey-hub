import { stripHtml, toUnaccented } from './stringUtils';

const plain = (value: string) => stripHtml(value).trim().replace(/\s+/g, ' ');
const normalized = (value: string) => toUnaccented(plain(value)).toLocaleLowerCase('vi-VN');

/** Resolve only an unambiguous label; do not silently choose the first match. */
export function findImportedOption(label: string, options: string[]): string | undefined {
  const exact = options.filter(option => plain(option) === plain(label));
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return undefined;
  const loose = options.filter(option => normalized(option) === normalized(label));
  return loose.length === 1 ? loose[0] : undefined;
}

/** Ordered arrays exported by this application are JSON, preserving commas and semicolons. */
export function parseRankingCell(value: string, options: string[]): string[] | null {
  const text = value.trim();
  let labels: unknown;
  if (text.startsWith('[')) {
    try { labels = JSON.parse(text); } catch { return null; }
  } else {
    const exact = findImportedOption(text, options);
    labels = exact ? [text] : text.split(/[;\n]+/).map(part => part.trim()).filter(Boolean);
  }
  if (!Array.isArray(labels) || !labels.length || labels.some(label => typeof label !== 'string')) return null;
  const matched = labels.map(label => findImportedOption(label as string, options));
  if (matched.some(option => !option) || new Set(matched).size !== matched.length) return null;
  return matched as string[];
}
