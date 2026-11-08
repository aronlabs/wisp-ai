'use client';
import { getTranslator, translateData, type Locale } from '../i18n';
import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Item, Money } from './game-ui';
import { Icon } from './icon';
const baseScenes = [
  {
    prompt: 'Which piece of my gear should I upgrade first?',
    label: 'Equipment & prices',
    reply: 'I’d start with your chest. More survivability, and a little more damage.',
  },
  {
    prompt: 'Make a wand macro that won’t stop shooting when I press it again.',
    label: 'Macros & actions',
    reply:
      'Done. Repeated presses won’t toggle Shoot off. Place the macro on your action bar when you’re ready.',
  },
  {
    prompt: 'Look at my bags. What’s worth keeping for my professions?',
    label: 'Bags & professions',
    reply: 'You have Mining and Cooking. Here’s where I’d start:',
  },
];
const baseFollowupPrompt = 'Is it worth it with the gold I have?';
const baseFollowupReply =
  'At that price, I’d buy the vest and save the rest. Check the final price and quantity before buying.';
export function Demo({ locale }: { locale: Locale }) {
  const t = getTranslator(locale);
  const scenes = translateData(baseScenes, locale);
  const followupPrompt = t(baseFollowupPrompt);
  const followupReply = t(baseFollowupReply);
  const [scene, setScene] = useState(0);
  // write prompt, think, write reply, hold, write follow-up, think, write reply, hold, leave
  const [stage, setStage] = useState(0);
  const [characters, setCharacters] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [visible, setVisible] = useState(true);
  const [inView, setInView] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const progress = useRef(0);
  const current = scenes[scene];
  const typing = [0, 2, 4, 6].includes(stage);
  const text =
    stage === 0
      ? current.prompt
      : stage === 4
        ? followupPrompt
        : stage === 6
          ? followupReply
          : current.reply;
  const stopped = paused || reduced || !visible || !inView;
  useEffect(() => {
    progress.current = characters;
  }, [characters]);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    const visibility = () => setVisible(!document.hidden);
    update();
    visibility();
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      threshold: 0.05,
    });
    if (container.current) {
      observer.observe(container.current);
    }
    media.addEventListener('change', update);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      observer.disconnect();
      media.removeEventListener('change', update);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  useEffect(() => {
    if (stopped) {
      return;
    }
    const increment = stage === 0 || stage === 4 ? 2 : 4;
    const cadence = 40;
    const delay = typing
      ? Math.ceil((text.length - progress.current) / increment) * cadence + 500
      : stage === 8
        ? 420
        : stage === 3
          ? 3000
          : stage === 7
            ? 6000
            : stage === 1 || stage === 5
              ? 1000
              : 500;
    const writingTimer = typing
      ? window.setInterval(() => {
          setCharacters((value) => Math.min(value + increment, text.length));
        }, cadence)
      : undefined;
    const timer = window.setTimeout(() => {
      setCharacters(0);
      if (stage === 8) {
        setScene((scene + 1) % scenes.length);
        setStage(0);
      } else if (stage === 3 && scene !== 0) {
        setStage(7);
      } else {
        setStage(stage + 1);
      }
    }, delay);
    return () => {
      clearTimeout(timer);
      clearInterval(writingTimer);
    };
  }, [scene, stage, typing, text, stopped]);
  useEffect(() => {
    const element = transcript.current;
    if (element) {
      if (stage === 0) {
        element.scrollTop = 0;
      } else {
        element.scrollTo({
          top: element.scrollHeight,
          behavior: reduced || [0, 2, 4, 6].includes(stage) ? 'instant' : 'smooth',
        });
      }
    }
  }, [stage, reduced]);
  const shownStage = reduced ? 3 : stage;
  const reply = reduced || stage > 2 ? current.reply : current.reply.slice(0, characters);
  const writingPrompt = !reduced && (stage === 0 || stage === 4);
  const waiting = shownStage === 1 || shownStage === 5;
  return (
    <div
      ref={container}
      className={`live-demo ${stopped ? 'demo-stopped' : ''}`}
      data-scene={scene}
      data-stage={shownStage}
    >
      <div className="wisp-window">
        <div className="window-heading">
          <span>
            <Image src="/wisp.png" width={23} height={23} alt="" />
            {t(' Wisp')}
          </span>
          <Icon name="minus" size={13} />
        </div>
        <div
          className={`chat-content ${stage === 8 && !reduced ? 'chat-leaving' : ''}`}
          ref={transcript}
          aria-live="off"
        >
          <div className="chat-thread" key={scene}>
            {shownStage >= 1 && <p className="chat-question message-enter">{current.prompt}</p>}
            {shownStage >= 2 && (
              <div className="chat-answer message-enter">
                <p className="streaming-text">
                  <span className="streaming-measure" aria-hidden="true">
                    {current.reply}
                  </span>
                  <span>
                    {reply}
                    {stage === 2 && !reduced && <span className="writing-caret" />}
                  </span>
                </p>
                {shownStage >= 2 && (
                  <div className={shownStage >= 3 ? 'result-enter' : 'result-pending'}>
                    {scene === 0 && (
                      <div className="chat-item">
                        <Item name={t('Barbaric Linen Vest')} icon="vest" rarity="uncommon" />
                        <div>
                          <b className="uncommon">{t('Barbaric Linen Vest')}</b>
                          <small>{t('+2 Stamina \u00B7 +2 Spell Power')}</small>
                        </div>
                      </div>
                    )}
                    {scene === 1 && (
                      <>
                        <div className="chat-item">
                          <Item name={t('Wand Shot')} icon="wand" rarity="rare" />
                          <div>
                            <b>{t('Wand Shot')}</b>
                            <small className="uncommon">
                              <Icon name="check" size={12} />
                              {t(' New macro created')}
                            </small>
                          </div>
                        </div>
                        <pre>
                          <code>
                            {t('#showtooltip Shoot')}
                            {'\n'}
                            {t('/cast !Shoot')}
                          </code>
                        </pre>
                      </>
                    )}
                    {scene === 2 && (
                      <>
                        <div className="bag-advice">
                          <Item name={t('Linen Cloth')} icon="linen" />
                          <p>
                            <b>{t('Linen Cloth')}</b>
                            <small>
                              {t('Sell unless you\u2019re planning First Aid or Tailoring.')}
                            </small>
                          </p>
                        </div>
                        <div className="bag-advice">
                          <Item name={t('Light Feather')} icon="feather" />
                          <p>
                            <b>{t('Light Feather')}</b>
                            <small>{t('Keep. It\u2019s a spell reagent.')}</small>
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
            {scene === 0 && shownStage >= 5 && (
              <p className="chat-question followup message-enter">{followupPrompt}</p>
            )}
            {scene === 0 && shownStage >= 6 && (
              <div className="chat-answer message-enter">
                <div className="chat-prices">
                  <span>
                    {t('Loaded listing ')}
                    <Money silver={3} locale={locale} />
                  </span>
                  <span>
                    {t('Your gold ')}
                    <Money silver={14} copper={63} locale={locale} />
                  </span>
                </div>
                <p className="streaming-text">
                  <span className="streaming-measure" aria-hidden="true">
                    {followupReply}
                  </span>
                  <span>
                    {stage === 6 ? followupReply.slice(0, characters) : followupReply}
                    {stage === 6 && <span className="writing-caret" />}
                  </span>
                </p>
              </div>
            )}
            {waiting && (
              <div className="thinking message-enter" aria-label={t('Wisp is thinking')}>
                <Image src="/wisp.png" width={18} height={18} alt="" />
                <span />
                <span />
                <span />
              </div>
            )}
          </div>
        </div>
        <div className={`chat-composer ${writingPrompt ? 'composer-writing' : ''}`}>
          <span>
            {writingPrompt ? text.slice(0, characters) : t('Ask a follow-up\u2026')}
            {writingPrompt && <span className="writing-caret" />}
          </span>
          <Icon name="enter" size={13} />
        </div>
      </div>
      <div className="demo-caption">
        <span>
          <i />
          {current.label}
        </span>
        <button
          onClick={() => {
            setPaused(!(paused || reduced));
            setReduced(false);
          }}
          aria-label={paused || reduced ? t('Play demo') : t('Pause demo')}
        >
          <Icon name={paused || reduced ? 'play' : 'pause'} size={12} />
          {paused || reduced ? t('Play') : t('Pause')}
        </button>
      </div>
    </div>
  );
}
