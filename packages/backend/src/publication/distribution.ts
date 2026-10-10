// Stored public editions only. Distribution never guesses language from source names or text.
import type { CategoryKey } from '@aihot/contracts/taxonomy';
import { CATEGORY_LABELS } from '@aihot/contracts/taxonomy';

export type DistributionLanguage = 'en' | 'zh';

/** Callers at HTTP boundaries must turn an invalid value into a 400 response. */
export function distributionLanguage(value: unknown, fallback: DistributionLanguage = 'en'): DistributionLanguage {
  if (value === undefined) return fallback;
  if (value !== 'en' && value !== 'zh') throw new RangeError('lang must be en or zh');
  return value;
}

/** Missing metadata is not proof of an edition. Legacy zh is allowed only on legacy surfaces. */
export function editionReady(value: unknown, lang: DistributionLanguage, legacyZh = false): boolean {
  if (!value || typeof value !== 'object') return false;
  const dto = value as { editorialLanguage?: string; contentLanguage?: { requested?: string; status?: string; sourceLanguage?: string; language?: string } };
  const state = dto.contentLanguage;
  if (!state) return legacyZh && lang === 'zh' && (!dto.editorialLanguage || dto.editorialLanguage === 'zh');
  if (state.requested !== lang) return false;
  if (state.language !== undefined) return state.language === lang;
  return state.status === 'translated' || state.status === 'native' ||
    (state.status === 'original' && (state.sourceLanguage === lang || dto.editorialLanguage === lang));
}

export class EditionUnavailableError extends Error {
  constructor() { super('The requested stored edition is not ready'); }
}

const ENGLISH_CATEGORIES: Record<CategoryKey, string> = {
  'ai-models': 'Models', 'ai-products': 'Products', industry: 'Industry', paper: 'Research', tip: 'Tutorials', opinion: 'Opinion',
};

export function distributionCategory(category: CategoryKey, lang: DistributionLanguage): string {
  return lang === 'en' ? ENGLISH_CATEGORIES[category] : CATEGORY_LABELS[category];
}

export function editionPath(path: string, lang: DistributionLanguage): string {
  return lang === 'zh' ? `/zh${path === '/' ? '' : path}` : path;
}

/** Body language is independently validated; permission alone is not a language assertion. */
export function bodyEditionReady(value: unknown, lang: DistributionLanguage): boolean {
  if (!value || typeof value !== 'object') return false;
  const dto = value as { bodyContentLanguage?: { requested?: string; status?: string; sourceLanguage?: string; language?: string } };
  const state = dto.bodyContentLanguage;
  if (!state || (state.requested !== undefined && state.requested !== lang)) return false;
  if (state.language !== undefined) return state.language === lang;
  return state.status === 'translated' || state.status === 'native' ||
    (state.status === 'original-english' && lang === 'en') ||
    (state.status === 'original' && state.sourceLanguage === lang);
}
