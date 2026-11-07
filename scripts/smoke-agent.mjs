import { cp, mkdir, readFile, writeFile, symlink, open } from 'node:fs/promises';
import { createServer } from 'node:http';
import { spawn, execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = process.cwd(),
  dir = path.resolve('../../work', 'agent-smoke-' + Date.now());
await mkdir(dir, { recursive: true });
const load = (p) => import(pathToFileURL(path.join(root, p)).href);
const { ChatGPTAuth } = await load('src/chatgpt-auth.ts'),
  { NativeVault } = await load('src/secret-vault.ts'),
  { proxyModel } = await load('src/model-proxy.ts'),
  { TheWoWDB } = await load('src/thewowdb.ts'),
  { searchWowhead } = await load('src/wowhead-search.ts'),
  { applyEvent } = await load('src/events.ts'),
  { ReplyProjection } = await load('src/reply-stream.ts');
const { Client } = await load('node_modules/eve/dist/src/client/index.js');
const { Simulator } = await load('src/simulation.ts');
const simulationSnapshot = process.env.WISP_SMOKE_CHARACTER
  ? JSON.parse(await readFile(process.env.WISP_SMOKE_CHARACTER, 'utf8'))
  : undefined;
const simulator = new Simulator(root);
const dataRoot = process.env.WISP_DATA_DIR || root;
const config = JSON.parse(await readFile(path.join(dataRoot, 'config.local.json'), 'utf8')),
  model = config.model || 'gpt-6.1-sol';
const auth = new ChatGPTAuth(
  path.join(dataRoot, 'runtime'),
  new NativeVault(
    process.env.WISP_DESKTOP_EXE || path.join(root, 'src-tauri/target/release/wisp.exe'),
  ),
);
await auth.load();
const t = auth.saved.profiles.find((p) => p.id === auth.saved.activeId)?.tokens;
if (!t || t.expiresAt - Date.now() < 600000) {
  throw Error('Token too close to expiry for isolated smoke; avoid concurrent renewal');
}
const scopedAuth = {
  models: async () => [{ slug: model }],
  authorized: async (url, init) => {
    const headers = new Headers(init.headers);
    headers.set('authorization', 'Bearer ' + t.accessToken);
    return fetch(url, { ...init, headers, redirect: 'error' });
  },
};
await cp(path.join(root, 'agent'), path.join(dir, 'agent'), { recursive: true });
await cp(path.join(root, 'src'), path.join(dir, 'src'), { recursive: true });
await cp(path.join(root, 'package.json'), path.join(dir, 'package.json'));
await symlink(path.join(root, 'node_modules'), path.join(dir, 'node_modules'), 'junction');
for (const file of ['agent/agent.ts', 'src/agent-rpc.ts', 'agent/tools/query_character.ts']) {
  const p = path.join(dir, file);
  await writeFile(p, (await readFile(p, 'utf8')).replaceAll('43187', '43197'));
}
const token = randomBytes(32).toString('hex'),
  database = new TheWoWDB(),
  rpc = [];
const server = createServer(async (req, res) => {
  try {
    if (req.headers.authorization !== 'Bearer ' + token) {
      res.writeHead(403).end();
      return;
    }
    if (req.url.startsWith('/session-model?')) {
      res
        .writeHead(200, { 'content-type': 'application/json' })
        .end(JSON.stringify({ model, effort: 'medium' }));
      return;
    }
    if (req.url === '/model/responses') {
      await proxyModel(req, res, scopedAuth);
      return;
    }
    let raw = '';
    for await (const b of req) {
      raw += b;
    }
    const data = JSON.parse(raw),
      { eveSession: _session, ...args } = data;
    let value;
    const call = { endpoint: req.url, operation: data.operation };
    rpc.push(call);
    if (req.url === '/database') {
      value = await database.query(args);
    } else if (req.url === '/simulate' && simulationSnapshot) {
      value = await simulator.run(simulationSnapshot, args);
    } else if (req.url === '/state' && simulationSnapshot) {
      value = simulationSnapshot;
    } else if (req.url === '/wowhead') {
      value = await searchWowhead(args.query, scopedAuth, model);
    } else if (req.url === '/memory' && data.operation === 'list') {
      value = { entries: [] };
    } else if (req.url === '/identity') {
      value = { characterKey: null };
    } else {
      throw Error('Smoke forbids state changes and game actions: ' + req.url);
    }
    call.status = value.status;
    call.version = value.version ?? value.source?.version;
    if (req.url === '/simulate') {
      call.plans = value.results?.map((r) => ({
        label: r.label,
        dps: r.dps.average,
        spellIds: r.damageBySpell.map((a) => a.spellId),
      }));
    }
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(value));
  } catch (e) {
    res.writeHead(500).end(e.message);
  }
});
await new Promise((r) => server.listen(43197, '127.0.0.1', r));
const log = await open(path.join(dir, 'eve.log'), 'a');
const child = spawn(
  process.execPath,
  [
    path.join(root, 'node_modules/eve/bin/eve.js'),
    'dev',
    '--no-ui',
    '--no-default-extensions',
    '--port',
    '43196',
  ],
  {
    cwd: dir,
    windowsHide: true,
    stdio: ['ignore', log.fd, log.fd],
    env: {
      ...process.env,
      WOW_BRIDGE_TOKEN: token,
      WOW_MODEL: model,
      WOW_MCP_CONFIG: '',
      WOW_CAPABILITIES_FILE: '',
    },
  },
);
const client = new Client({ baseUrl: 'http://127.0.0.1:43196' }),
  report = { model, tests: [] };
let session;
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      await client.health();
      ready = true;
      break;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  assert.ok(ready, 'isolated Eve ready');
  session = (await client.sessions.create()).session;
  const chat = {
      id: 'smoke',
      title: 'Diagnostic',
      owner: 'smoke',
      status: 'working',
      messages: [],
      activity: [],
    },
    parts = new ReplyProjection();
  const run = async (name, question) => {
    console.log('START ' + name);
    const d = await session.send(
      '<conversation_context>{"needsTitle":false}</conversation_context>\n<user_message>' +
        JSON.stringify(question) +
        '</user_message>',
    );
    let calls = [];
    const failures = [];
    for await (const event of d.stream()) {
      applyEvent(chat, event, parts);
      if (event.type === 'call.requested') {
        calls.push(event.data.capability?.name);
        console.log('TOOL ' + event.data.capability?.name);
      }
      if (event.type === 'call.settled' && event.data.outcome !== 'completed') {
        console.log('TOOL_OUTCOME ' + event.data.outcome);
        failures.push(event.data.outcome);
      }
    }
    const r = await d.result();
    const row = {
      name,
      status: r.status,
      error: r.error?.message,
      calls,
      usage: structuredClone(chat.usage),
      reply: chat.messages.filter((m) => m.role === 'assistant').at(-1)?.text,
    };
    report.tests.push(row);
    console.log(JSON.stringify(row));
    assert.equal(r.status, 'completed');
    assert.deepEqual(failures, [], 'real tool calls must succeed');
    return row;
  };
  if (simulationSnapshot) {
    const result = await run(
      'current-level DPS simulation',
      'Compará con simulate_dps, al nivel real del personaje, estas dos rotaciones de 30 segundos a 5 yardas: A) repetir Descarga de Escarcha; B) apertura una vez de Descarga de Escarcha, Nova de Escarcha, Explosión de Fuego y Misiles Arcanos, después usar la varita. Primero consultá mis hechizos para elegir sus rangos aprendidos. Usá 500 iteraciones para ambas y explicá el resultado sin fingir kiteo ni ataques del enemigo.',
    );
    assert.ok(result.calls.includes('simulate_dps'));
    const call = rpc.findLast((r) => r.endpoint === '/simulate');
    assert.equal(call?.status, 'available');
    assert.equal(call.plans.length, 2);
    for (const id of [205, 122, 2136, 5143, 5019]) {
      assert.ok(
        call.plans.some((p) => p.spellIds.includes(id)),
        'real agent comparison used spell ' + id,
      );
    }
    assert.match(result.reply, /11/);
  } else {
    let result = await run(
      'primary catalog',
      '¿Qué hace Nova de Escarcha (spell 122) en Forever? Usá get_database_entity para verificar el dato en TheWoWDB y citá su fuente. No consultes mi personaje: es una pregunta general.',
    );
    assert.ok(result.calls.includes('get_database_entity'));
    result = await run(
      'Everloot complement',
      'Para verificar la cobertura: buscá Frost Nova con search_knowledge de la conexión everloot-search de Everloot. Descubrí la herramienta con eve__search y ejecutala con eve__tool aunque TheWoWDB ya tenga el hechizo. Informá si hay coincidencias confirmadas para Forever; no guardes nada en memoria.',
    );
    assert.ok(
      result.calls.some((n) => /eve__tool|search_knowledge/.test(n)),
      'real MCP invocation',
    );
    result = await run(
      'Wowhead fallback',
      'Buscá con web_search una guía de leveleo de mago escarcha en Wowhead Forever. Usá esa herramienta de búsqueda aunque haya otras fuentes. Dame 2 consejos con enlaces de esa guía, no de Retail ni Classic.',
    );
    assert.ok(result.calls.includes('web_search'));
    console.log('START manual compaction');
    const compact = await session.compact();
    for await (const event of compact.stream()) {
      applyEvent(chat, event, parts);
    }
    const cr = await compact.result();
    console.log(JSON.stringify({ compactionStatus: cr.status, usage: chat.usage }));
    assert.ok(chat.usage?.compactions >= 1, 'real compaction completed');
    result = await run(
      'post compaction',
      '¿Cuál era la versión del juego de las fuentes que estábamos consultando? Respondé brevemente y sin herramientas.',
    );
    assert.ok(result.usage.contextTokens > 0, 'usage after compact');
    for (const endpoint of ['/database', '/wowhead']) {
      assert.ok(
        rpc.some(
          (r) => r.endpoint === endpoint && r.status === 'available' && r.version === 'forever',
        ),
        endpoint + ' must return verified live data',
      );
    }
  }
  await writeFile(path.join(dir, 'report.json'), JSON.stringify({ ...report, rpc }, null, 2));
  console.log('PASS ' + dir);
} finally {
  if (session) {
    await session.end({ reason: 'Isolated smoke finished' }).catch(() => {});
  }
  await new Promise((r) =>
    execFile('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, () =>
      r(),
    ),
  );
  await new Promise((r) => server.close(r));
  await log.close();
}
