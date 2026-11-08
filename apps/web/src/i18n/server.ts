import { notFound } from 'next/navigation';
import { isLocale, type Locale } from './config';
export type LocalePageProps = { params: Promise<{ locale: string }> };
export async function resolveLocale(params: LocalePageProps['params']): Promise<Locale> {
  const { locale } = await params;
  if (!isLocale(locale)) {
    notFound();
  }
  return locale;
}
