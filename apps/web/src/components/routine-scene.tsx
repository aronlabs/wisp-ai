'use client';
import { getTranslator, type Locale } from '../i18n';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { Icon } from './icon';
import { Item } from './game-ui';
const baseAdvice =
  'Your guide’s next step: learn your new spell ranks, then continue the quest route.';
const baseFollowup = 'And which talents should I take according to the guide?';
const baseTalentAdvice =
  'Let’s compare your build with the guide’s talent order before you spend the next point.';
const holds: Record<number, number> = {
  2: 650,
  3: 650,
  4: 200,
  5: 2600,
  6: 1000,
  7: 200,
  8: 5500,
  9: 500,
};
export function RoutineScene({ locale }: { locale: Locale }) {
  const t = getTranslator(locale);
  const advice = t(baseAdvice);
  const followup = t(baseFollowup);
  const talentAdvice = t(baseTalentAdvice);
  const [step, setStep] = useState(2);
  const [letters, setLetters] = useState(0);
  const [inView, setInView] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(true);
  const section = useRef<HTMLElement>(null);
  const activeText = step === 7 ? talentAdvice : advice;
  const finishedWriting = letters >= activeText.length;
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const motion = () => setReduced(media.matches);
    const visibility = () => setVisible(!document.hidden);
    motion();
    visibility();
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      threshold: 0.25,
    });
    if (section.current) {
      observer.observe(section.current);
    }
    media.addEventListener('change', motion);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      observer.disconnect();
      media.removeEventListener('change', motion);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  useEffect(() => {
    if (!inView || reduced || paused || !visible || ([4, 7].includes(step) && !finishedWriting)) {
      return;
    }
    const timer = setTimeout(() => {
      const next = step === 9 ? 2 : step + 1;
      if ([2, 4, 7].includes(next)) {
        setLetters(0);
      }
      setStep(next);
    }, holds[step]);
    return () => clearTimeout(timer);
  }, [step, finishedWriting, inView, reduced, paused, visible]);
  useEffect(() => {
    if (![4, 7].includes(step) || finishedWriting || !inView || reduced || paused || !visible) {
      return;
    }
    const timer = setInterval(
      () => setLetters((value) => Math.min(value + 4, activeText.length)),
      44,
    );
    return () => clearInterval(timer);
  }, [step, activeText, finishedWriting, inView, reduced, paused, visible]);
  const shown = reduced ? 5 : step;
  const complete = reduced || step > 4 || (step === 4 && finishedWriting);
  const stopped = reduced || paused || !inView || !visible;
  return (
    <section
      className={`routine-section ${stopped ? 'routine-stopped' : ''}`}
      id="routines"
      aria-labelledby="routine-title"
      ref={section}
      data-step={shown}
    >
      <div className="routine-heading">
        <div>
          <span className="eyebrow">{t('MEMORY & ROUTINES')}</span>
          <h2 id="routine-title">
            {t('Your plan.')}
            <br />
            <em>{t('Your next step.')}</em>
          </h2>
        </div>
        <p>
          {t('Wisp remembers the guide you follow and checks what\u2019s next when you level up.')}
        </p>
      </div>
      <div className="routine-story" aria-live="off">
        <div className="routine-instruction">
          <span className="routine-moment">{t('SET IT UP ONCE')}</span>
          <div className="saved-guide">
            <Item icon="book" name={t('Saved leveling guide')} />
            <div>
              <small>{t('YOUR SAVED GUIDE')}</small>
              <strong>{t('My leveling plan')}</strong>
              <span>{t('One adventure. A little direction.')}</span>
            </div>
          </div>
          <p className="routine-prompt">
            {t(
              '\u201CFollow this guide. Whenever I level up, tell me what I should do next.\u201D',
            )}
          </p>
          <div className="routine-confirmations">
            <span className={shown >= 1 ? 'confirmed' : ''}>
              <Icon name="check" size={13} />
              {t('Guide remembered')}
            </span>
            <span className={shown >= 2 ? 'confirmed' : ''}>
              <Icon name="repeat" size={13} />
              {t('Level-up routine active')}
            </span>
          </div>
        </div>
        <div className={`routine-connection ${shown >= 2 ? 'connected' : ''}`} aria-hidden="true">
          <svg
            width="42"
            height="42"
            viewBox="0 0 42 42"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m10 12 9 9-9 9" />
            <path d="m22 12 9 9-9 9" />
          </svg>
        </div>
        <div className="routine-outcome">
          <span className="routine-moment">{t('THEN, WHILE YOU PLAY')}</span>
          <div className={`level-event ${shown >= 3 ? 'level-reached' : ''}`}>
            <div className="level-medallion">20</div>
            <div>
              <span>{t('LEVEL UP')}</span>
              <strong>{t('You\u2019ve reached level 20.')}</strong>
            </div>
            <div className="level-rays" aria-hidden="true" />
          </div>
          <div className={`routine-feed ${step === 9 && !reduced ? 'routine-fading' : ''}`}>
            <div
              className={`routine-reply ${shown >= 4 && shown < 6 ? 'reply-visible' : ''}`}
              aria-hidden={shown < 4 || shown >= 6}
            >
              <div className="routine-reply-heading">
                <Image src="/wisp.png" alt="" width={24} height={24} />
                <strong>{t(' Wisp')}</strong>
                <span>{t('Your level-up check-in')}</span>
              </div>
              <p className="streaming-text">
                <span className="streaming-measure" aria-hidden="true">
                  {advice}
                </span>
                <span>
                  {reduced || step > 4 ? advice : advice.slice(0, letters)}
                  {!complete && <span className="writing-caret" />}
                </span>
              </p>
              <div className={`routine-next-actions ${complete ? 'actions-visible' : ''}`}>
                <div>
                  <Item icon="frost" name={t('Spell upgrades')} />
                  <span>{t('Review spell upgrades')}</span>
                </div>
                <div>
                  <Item icon="book" name={t('Quest route')} />
                  <span>{t('Continue your quest route')}</span>
                </div>
              </div>
            </div>
            {!reduced && step >= 6 && (
              <div className="routine-followup-scene">
                <p className="routine-followup message-enter">{followup}</p>
                {!reduced && step >= 7 && (
                  <div className="routine-talent-answer message-enter">
                    <div className="routine-reply-heading">
                      <Image src="/wisp.png" alt="" width={24} height={24} />
                      <strong>{t(' Wisp')}</strong>
                      <span>{t('Using your saved guide')}</span>
                    </div>
                    <p className="streaming-text">
                      <span className="streaming-measure" aria-hidden="true">
                        {talentAdvice}
                      </span>
                      <span>
                        {step === 7 ? talentAdvice.slice(0, letters) : talentAdvice}
                        {step === 7 && !finishedWriting && <span className="writing-caret" />}
                      </span>
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="routine-bottom">
        <span>{t('Keep your plan in memory. Let a routine bring it back at the right time.')}</span>
        <button
          type="button"
          onClick={() => {
            if (reduced) {
              setStep(2);
              setLetters(0);
              setReduced(false);
              setPaused(false);
            } else {
              setPaused(!paused);
            }
          }}
          aria-label={paused || reduced ? t('Play routine example') : t('Pause routine example')}
        >
          <Icon name={paused || reduced ? 'play' : 'pause'} size={12} />
          {paused || reduced ? t('Play') : t('Pause')}
        </button>
      </div>
    </section>
  );
}
