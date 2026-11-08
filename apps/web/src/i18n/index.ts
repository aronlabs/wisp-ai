import es from './es.json';
import type { Locale } from './config';
export { localizedPath, stripLocale, isLocale, locales, preferredLocale } from './config';
export type { Locale } from './config';
export function getTranslator(locale: Locale) {
  return (source: string): string => {
    if (locale === 'en') {
      return source;
    }
    const translation = (es as Record<string, string>)[source.trim()];
    if (translation === undefined) {
      return source;
    }
    return source.replace(source.trim(), translation);
  };
}
export function translateData<T>(data: T, locale: Locale): T {
  const t = getTranslator(locale);
  function visit(value: unknown): unknown {
    if (typeof value === 'string') {
      return t(value);
    }
    if (Array.isArray(value)) {
      return value.map(visit);
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, visit(val)]));
    }
    return value;
  }
  return visit(data) as T;
}
export const descriptions: Record<Locale, string> = {
  en: 'Your AI companion for WoW: Forever. Find gear upgrades, create macros, plan quests and set routines that remember your guide. Open source for Windows.',
  es: 'Tu compañero de IA para WoW: Forever. Mejorá tu equipo, creá macros y seguí tu guía con memoria y rutinas. Código abierto para Windows.',
};
