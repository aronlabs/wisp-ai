'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState, type MouseEvent } from 'react';
import { localizedPath, stripLocale, type Locale } from '../i18n/config';
import { Icon } from './icon';

export function LanguageSwitch({ locale }: { locale: Locale }) {
  const path = stripLocale(usePathname());
  const [open, setOpen] = useState(false);
  const [suffix, setSuffix] = useState('');
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const label = locale === 'es' ? 'ES — Idioma: Español' : 'EN — Language: English';

  useEffect(() => {
    if (!open) {
      return;
    }
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !container.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  function toggle() {
    setSuffix(window.location.search + window.location.hash);
    setOpen((value) => !value);
  }

  return (
    <div
      className="language-picker"
      ref={container}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="language-switch"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={toggle}
      >
        <Icon name="globe" size={15} />
        <span>{locale.toUpperCase()}</span>
        <Icon
          name="chevron-right"
          size={11}
          style={{ transform: `rotate(${open ? -90 : 90}deg)` }}
        />
      </button>
      {open && (
        <ul
          className="language-options"
          id={panelId}
          aria-label={locale === 'es' ? 'Idioma del sitio' : 'Site language'}
        >
          {(['en', 'es'] as const).map((language) => (
            <li key={language}>
              <Link
                href={localizedPath(language, path) + suffix}
                hrefLang={language}
                lang={language}
                scroll={false}
                aria-current={locale === language ? 'true' : undefined}
                onClick={(event: MouseEvent<HTMLAnchorElement>) => {
                  document.cookie = `wisp-locale=${language}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
                  setOpen(false);
                  trigger.current?.focus();
                  if (language === locale) {
                    event.preventDefault();
                  }
                }}
              >
                <span>{language === 'es' ? 'Español' : 'English'}</span>
                {locale === language && <Icon name="check" size={14} />}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
