// Deterministic synthetic UI publications. No model, account data or game actions.
export interface ReplaySnapshot {
  v: number;
  session: string;
  rev: number;
  connected: boolean;
  activeChat: string;
  acks: number[];
  chats: {
    id: string;
    title: string;
    status: string;
    messages: { id: string; role: string; text: string }[];
  }[];
  benchmark?: { id: string; step: number; textBytes: number; final: boolean };
  [key: string]: unknown;
}

export interface ReplayFixture {
  id: string;
  description: string;
  prompt: string;
  seed: ReplaySnapshot;
  updates: { atMs: number; snapshot: ReplaySnapshot }[];
}

export function deterministicText(seed: number, length: number) {
  let value = seed;
  const alphabet = 'abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length }, () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return alphabet[value % alphabet.length];
  }).join('');
}

function fixture(id: string, history: number, chunks: string[], spacing: number): ReplayFixture {
  const seed: ReplaySnapshot = {
    v: 1,
    session: 'replay',
    rev: 1,
    connected: true,
    activeChat: 'benchmark',
    acks: [],
    chats: [
      {
        id: 'benchmark',
        title: 'Bridge benchmark',
        status: 'idle',
        messages: Array.from({ length: history }, (_, i) => ({
          id: 'history-' + i,
          role: i % 2 ? 'assistant' : 'user',
          text: deterministicText(i + 31, 192),
        })),
      },
    ],
  };
  let text = '';
  const updates = chunks.map((chunk, index) => {
    text += chunk;
    const final = index === chunks.length - 1;
    const snapshot = structuredClone(seed);
    snapshot.rev = index + 2;
    snapshot.acks = [1];
    snapshot.chats[0].status = final ? 'done' : 'working';
    snapshot.chats[0].messages.push(
      { id: 'benchmark-user', role: 'user', text: 'Controlled transport replay.' },
      { id: 'benchmark-assistant', role: 'assistant', text },
    );
    snapshot.benchmark = { id, step: index + 1, textBytes: Buffer.byteLength(text), final };
    return { atMs: 100 + index * spacing, snapshot };
  });
  return {
    id,
    description: `${history} history messages; ${chunks.length} publications`,
    prompt: 'Controlled transport replay.',
    seed,
    updates,
  };
}

export function replayFixtures(): ReplayFixture[] {
  return [
    fixture('short-reply', 0, ['El bridge respondió. ☀️ ' + deterministicText(1, 64)], 250),
    fixture(
      'tiny-stream',
      0,
      Array.from({ length: 12 }, () => '.'),
      250,
    ),
    fixture(
      'streamed-reply',
      0,
      Array.from({ length: 8 }, (_, i) => deterministicText(i + 10, 128)),
      250,
    ),
    fixture('large-reply', 0, [deterministicText(3, 2048)], 250),
    fixture(
      'long-history-stream',
      48,
      Array.from({ length: 8 }, (_, i) => deterministicText(i + 20, 96)),
      250,
    ),
  ];
}
