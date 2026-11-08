'use client';
import { getTranslator, type Locale } from '../i18n';
import { useEffect, useRef, useState } from 'react';
type FeatureLink = {
  id: string;
  title: string;
  status?: string;
};
export function FeatureIndex({ features, locale }: { features: FeatureLink[]; locale: Locale }) {
  const t = getTranslator(locale);
  const [active, setActive] = useState<string | undefined>(features[0]?.id);
  const navigation = useRef<HTMLElement>(null);
  useEffect(() => {
    const sections = features
      .map(({ id }) => document.getElementById(id))
      .filter((section): section is HTMLElement => section !== null);
    let frame = 0;
    const update = () => {
      frame = 0;
      const readingLine = Math.min(160, window.innerHeight * 0.25);
      let current: string | undefined = sections[0]?.id;
      for (const section of sections) {
        if (section.getBoundingClientRect().top > readingLine) {
          break;
        }
        current = section.id;
      }
      if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) {
        current = sections.at(-1)?.id;
      }
      setActive(current);
    };
    const schedule = () => {
      if (!frame) {
        frame = requestAnimationFrame(update);
      }
    };
    const observer = new ResizeObserver(schedule);
    sections.forEach((section) => observer.observe(section));
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('hashchange', schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('hashchange', schedule);
    };
  }, [features]);
  useEffect(() => {
    const nav = navigation.current;
    const link = nav?.querySelector<HTMLElement>('[aria-current="location"]');
    if (!nav || !link || nav.scrollHeight <= nav.clientHeight) {
      return;
    }
    const parent = nav.getBoundingClientRect();
    const item = link.getBoundingClientRect();
    if (item.top < parent.top || item.bottom > parent.bottom) {
      nav.scrollTop += item.top - parent.top - (parent.height - item.height) / 2;
    }
  }, [active]);
  return (
    <nav aria-label={t('Feature index')} ref={navigation}>
      <span>{t('EXPLORE FEATURES')}</span>
      {features.map((feature) => (
        <a
          key={feature.id}
          href={`#${feature.id}`}
          aria-current={active === feature.id ? 'location' : undefined}
        >
          {feature.title}
          {feature.status && <small>{feature.status}</small>}
        </a>
      ))}
    </nav>
  );
}
