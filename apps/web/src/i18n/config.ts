export const locales = ['en', 'es'] as const;
export type Locale = (typeof locales)[number];
export function isLocale(value: string): value is Locale {
  return value === 'en' || value === 'es';
}
export function localizedPath(locale: Locale, path = '/') {
  return `/${locale}${path === '/' ? '' : path}`;
}
export function stripLocale(path: string) {
  return path.replace(/^\/(en|es)(?=\/|$)/, '') || '/';
}
export function preferredLocale(header: string | null): Locale {
  const choices = (header || '')
    .split(',')
    .map((entry, index) => {
      const [tag, ...params] = entry.trim().toLowerCase().split(';');
      const quality = params.find((param) => param.trim().startsWith('q='));
      const q = quality ? Number(quality.trim().slice(2)) : 1;
      return {
        language: tag.split('-')[0],
        q: Number.isFinite(q) && q >= 0 && q <= 1 ? q : 0,
        index,
      };
    })
    .filter((item) => item.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  for (const choice of choices) {
    if (isLocale(choice.language)) {
      return choice.language;
    }
  }
  return 'en';
}
