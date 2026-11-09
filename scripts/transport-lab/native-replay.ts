// Explicitly opt-in live host for a controlled native WoW replay. Never runs a model.
// Stop the production desktop service before starting this process. Root operates UI.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { DiskTransport } from '../../apps/bridge/src/transport.ts';
import type { Packet } from '../../packages/protocol/src/protocol.ts';
import { deterministicText, replayFixtures } from './replay-fixtures.ts';
import { historicalHostSource, historicalProtocol } from './historical-reference.ts';

if (!process.argv.includes('--live')) {
  throw Error(
    'This writes the configured game transport. Start deliberately with --live after stopping the desktop service.',
  );
}
const arg = (name: string, fallback: string) =>
  process.argv.find((value) => value.startsWith('--' + name + '='))?.slice(name.length + 3) ||
  fallback;
const mode = arg('mode', 'optimized');
assert.ok(['legacy', 'pre-opt', 'optimized'].includes(mode), 'Unknown mode label');
const scenario = arg('scenario', 'all');
assert.ok(
  ['all', 'small', 'stream', 'history', 'idle', 'bulk-stress'].includes(scenario),
  'Unknown scenario',
);
const count = Number(arg('count', '1025'));
assert.ok(Number.isInteger(count) && count >= 1 && count <= 4096, 'Invalid stress count');
const timeoutMs = Number(arg('timeout-ms', scenario === 'bulk-stress' ? '210000' : '120000'));
assert.ok(
  Number.isInteger(timeoutMs) && timeoutMs >= 10000 && timeoutMs <= 600000,
  'Invalid timeout',
);
const configured = JSON.parse(await readFile('config.local.json', 'utf8')) as { wow?: string };
assert.ok(configured.wow, 'Configured WoW path is missing');
const wow = configured.wow;
const payloadPath = path.join(wow, 'Interface/AddOns/WispAI_Payload/Payload.lua');
const observedPayload = await readFile(payloadPath, 'utf8');
const baselinePayloadPath = path.resolve(arg('base', payloadPath));
const originalPayload =
  baselinePayloadPath === path.resolve(payloadPath)
    ? observedPayload
    : await readFile(baselinePayloadPath, 'utf8');
const wrapped = /WispAI_Receive\(\[(=*)\[([\s\S]*)\]\1\]\)\s*$/.exec(originalPayload);
assert.ok(wrapped, 'Payload is not the expected data-only JSON wrapper');
const original = JSON.parse(wrapped[2]) as Record<string, unknown>;
const outputDirectory = path.resolve('runtime/bridge-research');
await mkdir(outputDirectory, { recursive: true });
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const output = path.resolve(
  arg('out', path.join(outputDirectory, `native-replay-${mode}-${scenario}-${runId}.json`)),
);
const hostReference =
  mode === 'legacy'
    ? 'runtime/bridge-research/deploy-before-v2-20261108_224025/host-transport.ts'
    : mode === 'pre-opt'
      ? 'runtime/bridge-research/host-transport-before-opt.ts'
      : 'apps/bridge/src/transport.ts';
const hostSource = await readFile(hostReference, 'utf8');
let TransportClass = DiskTransport;
const protocolReference = mode === 'optimized' ? undefined : await historicalProtocol();
if (mode !== 'optimized') {
  // Only module specifiers change. Preserve the original baseline source and
  // execute a derived copy; no network or package installation is involved.
  const derived = historicalHostSource(hostSource, protocolReference!);
  const modulePath = path.join(outputDirectory, `native-replay-host-${mode}-${runId}.ts`);
  await writeFile(modulePath, derived, 'utf8');
  TransportClass = (await import(pathToFileURL(modulePath).href))
    .DiskTransport as typeof DiskTransport;
}
const chatId = 'transport-benchmark';
const startedAt = Date.now();
let revision = Date.now(),
  session = '',
  nextAcks: number[] = [],
  profileLabel = '';
let state: Record<string, unknown> | undefined;
let profile: Record<string, unknown> | undefined;
let profileStartedAt = 0,
  fixtureRunning = false,
  shutdown = false;
let lastProfileEndSequence = 0;
const handledPackets = new Set<string>();
let publishChain = Promise.resolve();
const errors: string[] = [];
const publications: {
  fixture: string;
  step: number;
  revision: number;
  publishedAtMs: number;
  acknowledgedAtMs?: number;
  checkpointMs?: number;
}[] = [];
const controlPackets: { type: string; atMs: number }[] = [];
const chats = () => state!.chats as Record<string, unknown>[];

const bridge = new TransportClass(wow, receive, (error) => errors.push(String(error)));
function sanitizedBase(packet: Packet) {
  const base = structuredClone(original);
  base.v = 1;
  base.session = packet.session;
  base.connected = true;
  base.benchmarkPrepare = true;
  base.requests = [];
  delete base.routineCommand;
  delete base.panelCommand;
  base.chats = [...((base.chats || []) as unknown[])];
  base.activeChat = chatId;
  (base.chats as Record<string, unknown>[]).push({
    id: chatId,
    title: 'Bridge benchmark',
    status: 'idle',
    messages: [
      { id: chatId + '-user', role: 'user', text: 'Controlled transport replay. No model calls.' },
    ],
  });
  return base;
}
function acknowledgePacket(sequence: number) {
  if (!nextAcks.includes(sequence)) {
    nextAcks = [...nextAcks, sequence].slice(-128);
  }
}
function publish(label = 'control', step = 0, tag?: { textBytes: number; final: boolean }) {
  assert.ok(state, 'No active addon session');
  const snapshot = structuredClone(state);
  snapshot.rev = ++revision;
  snapshot.acks = [...nextAcks];
  if (tag) {
    snapshot.benchmark = { id: label, step, ...tag };
  } else {
    delete snapshot.benchmark;
  }
  const record = { fixture: label, step, revision, publishedAtMs: Date.now() - startedAt };
  publications.push(record);
  publishChain = publishChain.then(() => bridge.publish(snapshot));
  return publishChain.then(() => record);
}
function receive(packet: Packet) {
  if (shutdown) {
    return;
  }
  let established = false;
  if (packet.type === 'hello' && packet.session !== session) {
    if (session && fixtureRunning) {
      errors.push('Addon session changed during replay');
      shutdown = true;
      return;
    }
    session = packet.session;
    bridge.resetSession();
    nextAcks = [];
    handledPackets.clear();
    state = sanitizedBase(packet);
    established = true;
    process.stdout.write('ADDON_CONNECTED ' + mode + '\n');
  }
  if (!state || packet.session !== session) {
    return;
  }
  acknowledgePacket(packet.seq);
  bridge.setCursor(packet.nextSlot || 1, Number(packet.receivedRev || 0));
  // A retransmission still advertises its receipt cursor and remains ACKed,
  // but must not restart the profile or manufacture another publication.
  // This mirrors the application's session/sequence idempotence boundary.
  const identity = packet.session + ':' + packet.seq;
  if (handledPackets.has(identity)) {
    return;
  }
  handledPackets.add(identity);
  if (packet.type === 'inline_status' && packet.data && typeof packet.data === 'object') {
    const data = packet.data as Record<string, unknown>;
    if (data.event === 'profile_start' || data.event === 'transport_profile_start') {
      profileLabel = String(data.label || mode);
      profileStartedAt = Date.now();
      process.stdout.write('PROFILE_STARTED ' + profileLabel + '\n');
    } else if (data.event === 'transport_profile') {
      profile = data;
      lastProfileEndSequence = packet.seq;
      process.stdout.write('PROFILE_RECEIVED ' + profileLabel + '\n');
    }
  }
  if (packet.type === 'say' || packet.type === 'inline_say') {
    errors.push(
      'A user/model turn was attempted during a model-free replay; no model was invoked.',
    );
  }
  controlPackets.push({ type: packet.type, atMs: Date.now() - startedAt });
  // ACKs are also needed for start/end profile packets and legacy cursor polls.
  // Heartbeat/poll revisions are not allowed to overwrite an unacknowledged
  // fixture: DiskTransport coalesces the most recent publication itself.
  if (established || (packet.type !== 'poll' && !packet.heartbeat)) {
    void publish().catch((error) => errors.push(String(error)));
  }
}
async function until(predicate: () => boolean, timeout = timeoutMs) {
  const start = Date.now();
  while (!predicate()) {
    if (shutdown || Date.now() - start > timeout) {
      throw Error('Replay wait timed out');
    }
    await delay(10);
  }
}
async function checkpoint(record: (typeof publications)[number]) {
  await until(() => bridge.peerRevision >= record.revision);
  record.acknowledgedAtMs = Date.now() - startedAt;
  record.checkpointMs = record.acknowledgedAtMs - record.publishedAtMs;
}
async function runFixtures() {
  fixtureRunning = true;
  const names =
    scenario === 'small'
      ? ['short-reply']
      : scenario === 'stream'
        ? ['streamed-reply']
        : scenario === 'history'
          ? ['long-history-stream']
          : ['short-reply', 'tiny-stream', 'streamed-reply', 'large-reply', 'long-history-stream'];
  for (const fixture of replayFixtures().filter((entry) => names.includes(entry.id))) {
    const chat = chats().find((entry) => entry.id === chatId)!;
    chat.title = 'Bridge benchmark: ' + fixture.id;
    chat.status = 'working';
    chat.messages = structuredClone(fixture.seed.chats[0].messages);
    (chat.messages as unknown[]).push({ id: chatId + '-user', role: 'user', text: fixture.prompt });
    await checkpoint(await publish(fixture.id + '-seed'));
    const releaseStart = Date.now();
    let finalRecord: (typeof publications)[number] | undefined;
    for (const update of fixture.updates) {
      await delay(Math.max(0, releaseStart + update.atMs - Date.now()));
      const incoming = update.snapshot.chats[0];
      chat.status = 'working'; // Keep native receiver awake until all fixture checkpoints finish.
      chat.messages = structuredClone(incoming.messages);
      finalRecord = await publish(fixture.id, Number(update.snapshot.benchmark!.step), {
        textBytes: update.snapshot.benchmark!.textBytes,
        final: update.snapshot.benchmark!.final,
      });
    }
    await checkpoint(finalRecord!);
    process.stdout.write('FIXTURE_DONE ' + fixture.id + '\n');
  }
  fixtureRunning = false;
}
async function runBulkStress() {
  fixtureRunning = true;
  const chat = chats().find((entry) => entry.id === chatId)!;
  chat.title = 'Bridge benchmark: bulk stress';
  chat.status = 'working';
  for (let index = 0; index < count; index++) {
    // Entropy is intentionally ignored by the UI; forcing large changed bytes
    // tests real optional bulk selection without expensive transcript rendering.
    state!.benchmarkEntropy = deterministicText(index + 1234, 2048);
    await checkpoint(
      await publish('bulk-stress', index + 1, { textBytes: 0, final: index === count - 1 }),
    );
    if ((index + 1) % 64 === 0 || index + 1 === count) {
      process.stdout.write(`STRESS ${index + 1}/${count}\n`);
    }
  }
  delete state!.benchmarkEntropy;
  fixtureRunning = false;
}

let failure: string | undefined;
try {
  await bridge.start();
  process.stdout.write(`REPLAY_READY mode=${mode} scenario=${scenario}\n`);
  await until(() => Boolean(session));
  await until(() => Boolean(profileStartedAt));
  if (scenario === 'bulk-stress') {
    await runBulkStress();
  } else if (scenario !== 'idle') {
    await runFixtures();
  }
  if (state) {
    const chat = chats().find((entry) => entry.id === chatId)!;
    chat.status = 'done';
    delete state.benchmarkEntropy;
    await checkpoint(await publish('replay-finished'));
  }
  process.stdout.write('WAITING_FOR_PROFILE\n');
  await until(() => Boolean(profile));
  if (lastProfileEndSequence && state) {
    acknowledgePacket(lastProfileEndSequence);
    await checkpoint(await publish('profile-end-ack'));
  }
} catch (error) {
  failure = String(error);
  process.stderr.write(failure + '\n');
} finally {
  shutdown = true;
  await publishChain.catch(() => {});
  bridge.stop();
  const performance = (bridge as DiskTransport & { performance?: unknown }).performance;
  await writeFile(
    output,
    JSON.stringify(
      {
        atUtc: new Date().toISOString(),
        mode,
        scenario,
        scope:
          'Native addon replay through the selected reference/current DiskTransport. Synthetic response stream, no model calls. Checkpoint timings are receipt/cursor acknowledgements, not visible text latency.',
        fixtureSource: 'scripts/transport-lab/replay-fixtures.ts',
        hostReference,
        historicalProtocol: protocolReference,
        hostSha256: (await import('node:crypto'))
          .createHash('sha256')
          .update(hostSource)
          .digest('hex'),
        elapsedMs: Date.now() - startedAt,
        profileLabel,
        profileStartedAtMs: profileStartedAt ? profileStartedAt - startedAt : null,
        profile,
        performance,
        publications,
        controlPackets,
        errors,
        failure,
        originalPayloadSha256: (await import('node:crypto'))
          .createHash('sha256')
          .update(originalPayload)
          .digest('hex'),
        baselinePayloadPath,
        observedPayloadSha256: (await import('node:crypto'))
          .createHash('sha256')
          .update(observedPayload)
          .digest('hex'),
        cleanup:
          'The replay host stopped. Restart the production desktop service; it republishes authoritative state. No full addon-settings file was restored.',
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );
  process.stdout.write('REPORT ' + output + '\n');
}
if (failure) {
  process.exitCode = 1;
}
