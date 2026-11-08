import { getTranslator, translateData, type Locale } from '../i18n';
import Image from 'next/image';
import { Icon } from './icon';
export function Item({
  icon,
  name,
  rarity = '',
  count,
}: {
  icon: string;
  name: string;
  rarity?: string;
  count?: number;
}) {
  const asset = icon === 'vest' ? 'vest-fur' : icon === 'feather' ? 'feather-light' : icon;
  return (
    <span className={`item-icon ${rarity}`} title={name}>
      <Image src={`/items/${asset}.jpg`} width={56} height={56} alt={name} />
      {count && <span className="item-count">{count}</span>}
    </span>
  );
}
export function Money({
  silver,
  copper,
  locale = 'en',
}: {
  silver: number;
  copper?: number;
  locale?: Locale;
}) {
  const t = getTranslator(locale);
  return (
    <span className="money">
      {silver}
      <i className="coin silver" role="img" aria-label={t('silver')} />
      {copper !== undefined && (
        <>
          {copper}
          <i className="coin copper" role="img" aria-label={t('copper')} />
        </>
      )}
    </span>
  );
}
export function GearVisual({ locale }: { locale: Locale }) {
  const t = getTranslator(locale);
  return (
    <div className="gear-visual">
      <div className="floating-items">
        <Item name={t('Cloth robe')} icon="robe" rarity="rare" />
        <Item name={t('Barbaric Linen Vest')} icon="vest" rarity="uncommon" />
        <Item name={t('Staff')} icon="staff" rarity="uncommon" />
      </div>
      <div className="item-tooltip">
        <strong className="uncommon">{t('Barbaric Linen Vest')}</strong>
        <span>
          {t('Chest ')}
          <span>{t('Cloth')}</span>
        </span>
        <span>{t('+2 Stamina')}</span>
        <span>{t('+2 Spell Power')}</span>
        <small>{t('Requires Level 12')}</small>
      </div>
      <div className="auction-list">
        <div>
          <Item name={t('Barbaric Linen Vest')} icon="vest" rarity="uncommon" />
          <span className="uncommon">{t('Barbaric Linen Vest')}</span>
          <Money silver={3} locale={locale} />
        </div>
        <div>
          <Item name={t('Barbaric Linen Vest')} icon="vest" rarity="uncommon" />
          <span className="uncommon">{t('Barbaric Linen Vest')}</span>
          <Money silver={3} copper={50} locale={locale} />
        </div>
        <small>{t('Example loaded listings')}</small>
      </div>
    </div>
  );
}
const baseBagItems: [string, string, number][] = [
  ['linen', 'Linen Cloth', 20],
  ['linen', 'Linen Cloth', 20],
  ['feather', 'Light Feather', 6],
  ['ore', 'Copper Ore', 10],
  ['meat', 'Boar Meat', 1],
  ['potion', 'Healing Potion', 5],
  ['book', 'Spellbook', 1],
];
export function BagsVisual({ locale }: { locale: Locale }) {
  const t = getTranslator(locale);
  const bagItems = translateData(baseBagItems, locale);
  return (
    <div className="bags-visual">
      <div className="inventory">
        <div className="inventory-heading">
          {t('Backpack ')}
          <span>{t('16 slots')}</span>
        </div>
        <div className="inventory-grid">
          {Array.from({ length: 16 }, (_, i) =>
            bagItems[i] ? (
              <Item key={i} icon={bagItems[i][0]} name={bagItems[i][1]} count={bagItems[i][2]} />
            ) : (
              <span key={i} className="empty-slot" />
            ),
          )}
        </div>
        <div className="inventory-gold">
          <Money silver={14} copper={63} locale={locale} />
        </div>
      </div>
      <div className="macro-toast">
        <Item icon="wand" name={t('Wand Shot')} rarity="rare" />
        <div>
          <small>
            <Icon name="check" size={12} />
            {t(' Macro created')}
          </small>
          <code>{t('/cast !Shoot')}</code>
        </div>
      </div>
      <div className="action-bar">
        {['frost', 'wand', 'fire', 'potion', 'book'].map((icon, i) => (
          <span key={icon} className={i === 1 ? 'selected-action' : ''}>
            <Item
              icon={icon}
              name={
                [
                  t('Frostbolt'),
                  t('Wand Shot'),
                  t('Fireball'),
                  t('Healing Potion'),
                  t('Spellbook'),
                ][i]
              }
            />
            <kbd>{i + 1}</kbd>
          </span>
        ))}
      </div>
    </div>
  );
}
