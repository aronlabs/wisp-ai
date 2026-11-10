import { getTranslator, type Locale } from '../i18n';

export function UsageRisk({ locale }: { locale: Locale }) {
  const t = getTranslator(locale);
  return (
    <aside className="usage-risk">
      <strong>{t('Use at your own risk.')}</strong>{' '}
      {t(
        'We don’t know whether Blizzard permits Wisp or whether using it could lead to an account ban.',
      )}
    </aside>
  );
}
