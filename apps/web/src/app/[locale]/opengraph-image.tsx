import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveLocale, type LocalePageProps } from '../../i18n/server';
import { getLatestRelease } from '../../release.server';

export const revalidate = 300;
export const alt = 'Wisp AI — Your AI companion inside WoW: Forever';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpenGraphImage({ params }: LocalePageProps) {
  const es = (await resolveLocale(params)) === 'es';
  const release = await getLatestRelease();
  const asset = async (file: string, type = 'image/jpeg') =>
    `data:${type};base64,${(await readFile(join(process.cwd(), 'public', file))).toString('base64')}`;
  const [background, wisp, vest, staff, ring, serif, serifItalic, sans] = await Promise.all([
    asset('social-barrens.jpg'),
    asset('wisp.png', 'image/png'),
    asset('items/vest-fur.jpg'),
    asset('items/staff.jpg'),
    asset('items/ring.jpg'),
    readFile(join(process.cwd(), 'src/assets/fonts/Gelasio-Regular.ttf')),
    readFile(join(process.cwd(), 'src/assets/fonts/Gelasio-Italic.ttf')),
    readFile(join(process.cwd(), 'node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf')),
  ]);
  const gold = '#d5bb7b';
  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        position: 'relative',
        background: '#141510',
        color: '#f2eee4',
        fontFamily: 'Social Sans',
      }}
    >
      <img
        src={background}
        alt=""
        width={1200}
        height={630}
        style={{ position: 'absolute', objectFit: 'cover' }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background:
            'linear-gradient(90deg, #141510 2%, rgba(20,21,16,0.96) 30%, rgba(20,21,16,0.3) 73%, rgba(20,21,16,0.35) 100%)',
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'linear-gradient(0deg, #141510 0%, transparent 45%)',
        }}
      />
      <div
        style={{ display: 'flex', position: 'absolute', left: 54, top: 37, alignItems: 'center' }}
      >
        <img src={wisp} alt="" width={42} height={42} />
        <span style={{ fontSize: 31, marginLeft: 9, fontWeight: 700, letterSpacing: -1 }}>
          wisp
        </span>
        <span style={{ color: gold, fontSize: 17, marginLeft: 8 }}>ai</span>
      </div>
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: 58,
          top: 160,
          width: 470,
          flexDirection: 'column',
        }}
      >
        <span style={{ color: gold, fontSize: 13, letterSpacing: 3, marginBottom: 19 }}>
          WORLD OF WARCRAFT: FOREVER
        </span>
        <span
          style={{
            fontFamily: 'Gelasio',
            fontSize: 67,
            fontWeight: 400,
            letterSpacing: -3,
            lineHeight: 1.07,
          }}
        >
          {es ? 'Tu compañero' : 'Your AI'}
        </span>
        <span
          style={{
            fontFamily: 'Gelasio',
            fontSize: 67,
            fontWeight: 400,
            letterSpacing: -3,
            lineHeight: 1.07,
          }}
        >
          {es ? 'de IA.' : 'companion.'}
        </span>
        <span
          style={{
            fontFamily: 'Gelasio',
            fontStyle: 'italic',
            fontSize: 61,
            color: gold,
            letterSpacing: -3,
            lineHeight: 1.2,
            marginTop: 8,
          }}
        >
          {es ? 'Dentro de WoW.' : 'Inside WoW.'}
        </span>
        <span
          style={{ fontSize: 20, lineHeight: 1.5, color: '#c5c0b2', marginTop: 25, width: 400 }}
        >
          {es
            ? 'Mejorá tu equipo. Creá macros. Seguí tu guía.'
            : 'Find upgrades. Create macros. Follow your guide.'}
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: 578,
          top: 100,
          width: 561,
          flexDirection: 'column',
          border: '1px solid #6a6246',
          borderRadius: 14,
          background: 'rgba(19,22,20,0.97)',
          boxShadow: '0 20px 70px #0009',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '15px 23px',
            borderBottom: '1px solid #393d32',
          }}
        >
          <img src={wisp} alt="" width={32} height={32} />
          <span style={{ fontSize: 19, marginLeft: 10 }}>Wisp</span>
          <span style={{ fontSize: 12, color: '#a3b69a', marginLeft: 'auto' }}>WoW: Forever</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', padding: '23px 26px 29px' }}>
          <span style={{ color: '#aba697', fontSize: 12, letterSpacing: 2, marginBottom: 10 }}>
            {es ? 'VOS' : 'YOU'}
          </span>
          <span style={{ fontSize: 24, lineHeight: 1.3 }}>
            {es
              ? '¿Qué pieza de mi equipo debería mejorar primero?'
              : 'Which piece of my gear should I upgrade first?'}
          </span>
          <span
            style={{ color: gold, fontSize: 12, letterSpacing: 2, marginTop: 25, marginBottom: 10 }}
          >
            WISP
          </span>
          <span style={{ fontSize: 20, lineHeight: 1.45, color: '#deded2' }}>
            {es
              ? 'Empezaría por tu pechera. Más aguante y un poco más de daño.'
              : 'I’d start with your chest. More survivability, and a little more damage.'}
          </span>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              marginTop: 19,
              padding: 13,
              borderRadius: 6,
              border: '1px solid #3d5735',
              background: '#202c20',
            }}
          >
            <img
              src={vest}
              alt=""
              width={47}
              height={47}
              style={{ borderRadius: 4, border: '1px solid #719e48' }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 13 }}>
              <span style={{ color: '#81cf63', fontSize: 18 }}>Barbaric Linen Vest</span>
              <span style={{ color: '#bdc2ac', fontSize: 14, marginTop: 5 }}>
                {es ? 'Una mejora para tu equipo' : 'An upgrade for your loadout'}
              </span>
            </div>
          </div>
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: 886,
          top: 461,
          alignItems: 'center',
          gap: 9,
          padding: '11px 14px',
          borderRadius: 8,
          background: '#161b17',
          border: '1px solid #56533d',
          boxShadow: '0 10px 28px #0008',
        }}
      >
        {[staff, ring, vest].map((src, i) => (
          <img
            key={src}
            src={src}
            alt=""
            width={46}
            height={46}
            style={{ borderRadius: 4, border: `2px solid ${i === 1 ? '#608fc9' : '#719e48'}` }}
          />
        ))}
      </div>
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: 34,
          left: 58,
          right: 58,
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTop: '1px solid #d5bb7b30',
          paddingTop: 19,
        }}
      >
        <span
          style={{ color: '#aba697', fontSize: 15 }}
        >{`Windows · Open source${release ? ` · v${release.version}` : ''}`}</span>
        <span style={{ color: gold, fontSize: 18 }}>wisp.fedeya.sh</span>
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: 'Social Sans', data: sans, weight: 400, style: 'normal' },
        { name: 'Gelasio', data: serif, weight: 400, style: 'normal' },
        { name: 'Gelasio', data: serifItalic, weight: 400, style: 'italic' },
      ],
    },
  );
}
