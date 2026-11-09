import type { CSSProperties } from 'react';

export function Icon({
  name,
  size = 20,
  style,
}: {
  name:
    | 'arrow'
    | 'arrow-left'
    | 'external'
    | 'chevron-right'
    | 'minus'
    | 'enter'
    | 'download'
    | 'spark'
    | 'github'
    | 'windows'
    | 'check'
    | 'plus'
    | 'play'
    | 'repeat'
    | 'bookmark'
    | 'globe'
    | 'connection'
    | 'chat'
    | 'menu'
    | 'close'
    | 'pin'
    | 'pause';
  size?: number;
  style?: CSSProperties;
}) {
  const paths = {
    chat: (
      <>
        <path d="M21 11a8 8 0 0 1-8 8H7l-5 3 2-6a8 8 0 0 1-1-5 8 8 0 0 1 8-8h2a8 8 0 0 1 8 8Z" />
        <path d="M7 9h10M7 13h6" />
      </>
    ),
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    connection: (
      <>
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 21h8m-4-5v5m-4-9 3-3 2 2 3-3" />
      </>
    ),
    globe: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z" />
      </>
    ),
    repeat: <path d="m16 2 4 4-4 4M4 11V8a2 2 0 0 1 2-2h14M8 22l-4-4 4-4m12-1v3a2 2 0 0 1-2 2H4" />,
    bookmark: <path d="M6 3h12v18l-6-4-6 4V3Z" />,
    pin: (
      <>
        <path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),
    'arrow-left': <path d="M19 12H5m6-6-6 6 6 6" />,
    external: <path d="M7 17 17 7M7 7h10v10" />,
    'chevron-right': <path d="m9 5 7 7-7 7" />,
    minus: <path d="M5 12h14" />,
    enter: <path d="M20 5v9H5m5-5-5 5 5 5" />,
    play: <path d="m8 5 11 7-11 7V5Z" fill="currentColor" stroke="none" />,
    pause: <path d="M7 5h3v14H7zm7 0h3v14h-3z" fill="currentColor" stroke="none" />,
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    download: (
      <>
        <path d="M12 3v12m-5-5 5 5 5-5M5 16v4h14v-4" />
      </>
    ),
    spark: (
      <>
        <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" />
      </>
    ),
    github: (
      <path d="M9 19c-4 1-4-2-5-2m10 5v-4c0-1 .1-1.5-.5-2 3-.3 6-1.5 6-7A5.4 5.4 0 0 0 18 5a5 5 0 0 0-.1-4S16.7.7 14 2a14 14 0 0 0-7 0C4.3.7 3.1 1 3.1 1A5 5 0 0 0 3 5a5.4 5.4 0 0 0-1.5 4c0 5.5 3 6.7 6 7-.5.5-.6 1.2-.5 2v4" />
    ),
    windows: (
      <>
        <path d="m3 5 7-1v7H3V5Zm10-1 8-1v8h-8V4ZM3 14h7v7l-7-1v-6Zm10 0h8v9l-8-1v-8Z" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    plus: <path d="M12 5v14M5 12h14" />,
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      {paths[name]}
    </svg>
  );
}
