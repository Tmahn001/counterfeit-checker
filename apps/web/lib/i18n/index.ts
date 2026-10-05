import { en, type Dictionary } from './en';

const dictionaries: Record<string, Dictionary> = { en };

/** Returns the dictionary for a locale; falls back to English. */
export function t(locale = 'en'): Dictionary {
  return dictionaries[locale] ?? en;
}
