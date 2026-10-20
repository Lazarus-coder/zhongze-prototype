const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const { Store } = require('./store');
const api = require('./api');
const matching = require('./matching');
const privacy = require('./privacy');
const seed = require('./seed');
const simulate = require('./simulate');

const PORT = Number(process.env.PORT || 4321);
const WEB_DIR = path.join(__dirname, '..', 'web');
const store = new Store();

if (process.env.QZ_RESET === '1' || !Object.keys(store.db.dilemmas).length) seed.reset(store);
const stopSim = process.env.SIM === '0' ? () => {} : simulate.start(store, { interval: Number(process.env.SIM_MS || 3800) });

const clients = new Set();
store.on('ballot', (payload) => {
  const d = store.db.dilemmas[payload.dilemma_id];
  if (!d) return;
  const rows = require('./stats').tally(store.ballotsOf(d.id));
  broadcast({ type: 'ballot', dilemma_id: d.id, n: rows.reduce((s, r) => s + r.raw, 0), rows, voter: payload.ballot.voter_pid });
});
store.on('status', (d) => broadcast({ type: 'status', dilemma_id: d.id, status: d.status }));
store.on('jury', (j) => broadcast({ type: 'jury', jury_id: j.id, status: j.status }));

function broadcast(evt) {
  const data = 'event: ' + evt.type + '\ndata: ' + JSON.stringify(evt) + '\n\n';
  for (const res of clients) {
    try {
      res.write(data);
    } catch (err) {
      clients.delete(res);
    }
  }
}

function send(res, code, body, headers) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(payload);
}

function viewer(req) {
  const pid = req.headers['x-pid'];
  return pid ? store.db.personas[pid] || null : null;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 2e6) {
        reject(new Error('too_large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error('bad_json'));
      }
    });
    req.on('error', reject);
  });
}

const routes = {
  'GET /api/bootstrap': (req, res) => send(res, 200, { ...api.bootstrap(store, viewer(req)), feed: matching.buildFeed({ store, persona: viewer(req) || fallbackPersona(), limit: 12 }) }),
  'POST /api/session/persona': (req, res, params, body) => {
    const p = store.createPersona({ seed: body.seed, declared_tags: body.declared_tags, declared_experience: body.declared_experience, attributes: body.attributes });
    store.audit('persona_created', { actor: 'client', pid: p.pid });
    send(res, 200, { pid: p.pid, handle: p.handle, avatar: p.avatar, declared_tags: p.declared_tags, attributes: p.attributes });
  },
  'GET /api/feed': (req, res) => send(res, 200, matching.buildFeed({ store, persona: viewer(req) || fallbackPersona(), limit: Number(new URL(req.url, 'http://x').searchParams.get('limit') || 12) })),
  'POST /api/privacy/scan': (req, res, params, body) => send(res, 200, api.publish(store, viewer(req) || store.createPersona({ seed: 'scan-only' }), { ...body, dry_run: true })),
  'POST /api/dilemmas': (req, res, params, body) => {
    const me = viewer(req);
    if (!me) return send(res, 401, { error: 'no_persona' });
    const out = api.publish(store, me, body);
    if (out.dilemma && out.dilemma.status === 'open') store.emit('status', out.dilemma);
    send(res, 201, out);
  },
  'GET /api/dilemmas/:id': (req, res, params) => {
    const out = api.detail(store, params.id, viewer(req));
    return out ? send(res, 200, out) : send(res, 404, { error: 'not_found' });
  },
  'POST /api/dilemmas/:id/ballots': (req, res, params, body) => {
    const me = viewer(req);
    if (!me) return send(res, 401, { error: 'no_persona' });
    const out = api.castBallot(store, me, params.id, body);
    if (out.error) return send(res, 409, out);
    send(res, 201, out);
  },
  'POST /api/dilemmas/:id/helpful': (req, res, params, body) => {
    const me = viewer(req);
    if (!me) return send(res, 401, { error: 'no_persona' });
    const b = store.markHelpful(params.id, body.ballot_id, me.pid);
    send(res, 200, b ? { ok: true, helpful_votes: b.helpful_votes } : { error: 'not_found' });
  },
  'POST /api/dilemmas/:id/adopt': (req, res, params, body) => {
    const me = viewer(req);
    if (!me || store.db.dilemmas[params.id].author_pid !== me.pid) return send(res, 403, { error: 'author_only' });
    const b = store.markAdopted(params.id, body.ballot_id);
    send(res, 200, b ? { ok: true } : { error: 'not_found' });
  },
  'POST /api/dilemmas/:id/reopen': (req, res, params, body) => {
    const me = viewer(req);
    const d = store.db.dilemmas[params.id];
    if (!d || !me || d.author_pid !== me.pid) return send(res, 403, { error: 'author_only' });
    const types = (d.privacy && d.privacy.masked_types) || [];
    const patch = {
      title: body.title ? privacy.maskByTypes(body.title, types) : undefined,
      situation: body.situation ? privacy.maskByTypes(body.situation, types) : undefined,
      options: body.options,
    };
    const updated = store.reopenDilemma(params.id, patch);
    send(res, 200, { dilemma: updated, moderation: updated.moderation, hotline: updated.status === 'crisis_hold' ? api.hotlineCard() : null });
  },
  'POST /api/dilemmas/:id/safety-checked': (req, res, params) => {
    const me = viewer(req);
    const d = store.db.dilemmas[params.id];
    if (!d || !me || d.author_pid !== me.pid) return send(res, 403, { error: 'author_only' });
    const updated = store.requestHumanReview(params.id);
    send(res, 200, { dilemma: updated, note: '已转人工复核，通过前不会推给陌生人' });
  },
  'POST /api/governance/dilemmas/:id/approve': (req, res, params) => {
    if (req.headers['x-role'] !== 'ops') return send(res, 403, { error: 'ops_only' });
    const updated = store.approveDilemma(params.id);
    send(res, 200, updated ? { dilemma_id: updated.id, status: updated.status } : { error: 'not_found' });
  },
  'POST /api/dilemmas/:id/complete': (req, res, params) => {
    const me = viewer(req);
    const d = store.db.dilemmas[params.id];
    if (!d || !me || d.author_pid !== me.pid) return send(res, 403, { error: 'author_only' });
    const closed = store.closeDilemma(params.id);
    send(res, 200, { dilemma_id: closed.id, memo: api.detail(store, params.id, me).memo });
  },
  'POST /api/dilemmas/:id/outcome': (req, res, params, body) => {
    const me = viewer(req);
    const d = store.db.dilemmas[params.id];
    if (!d || !me || d.author_pid !== me.pid) return send(res, 403, { error: 'author_only' });
    const o = store.addOutcome(params.id, { chosen_option_key: body.chosen_option_key, went_with_advice: Boolean(body.went_with_advice), reflection: body.reflection || '', months_after: Number(body.months_after) || 0 });
    send(res, 201, { outcome: o });
  },
  'POST /api/dilemmas/:id/question': (req, res, params, body) => {
    const me = viewer(req);
    if (!me) return send(res, 401, { error: 'no_persona' });
    send(res, 201, { question: store.addQuestion(params.id, me.pid, body.text) });
  },
  'POST /api/questions/:id/answer': (req, res, params, body) => {
    const me = viewer(req);
    const q = store.db.questions.find((x) => x.id === params.id);
    if (!q || !me || store.db.dilemmas[q.dilemma_id].author_pid !== me.pid) return send(res, 403, { error: 'author_only' });
    send(res, 200, { question: store.answerQuestion(params.id, body.answer) });
  },
  'POST /api/reports': (req, res, params, body) => {
    const me = viewer(req);
    if (!me) return send(res, 401, { error: 'no_persona' });
    send(res, 201, { report: store.report(body.target, body.reason, me.pid), jury: store.db.jury[store.db.jury.length - 1] });
  },
  'GET /api/governance': (req, res) => {
    if (req.headers['x-role'] !== 'ops') return send(res, 403, { error: 'ops_only' });
    store.audit('governance_view', { actor: 'ops', note: '审计日志被查看' });
    send(res, 200, api.governance(store));
  },
  'POST /api/governance/jury/:id/vote': (req, res, params, body) => {
    const me = viewer(req);
    if (!me) return send(res, 401, { error: 'no_persona' });
    send(res, 200, store.juryVote(params.id, me.pid, body.decision));
  },
  'POST /api/governance/keys/rotate': (req, res) => {
    if (req.headers['x-role'] !== 'ops') return send(res, 403, { error: 'ops_only' });
    send(res, 200, { version: store.rotateKeys() });
  },
  'GET /api/analytics': (req, res) => send(res, 200, api.analytics(store)),
  'GET /api/persona/:pid/expertise': (req, res, params) => {
    const ex = store.expertiseOf(params.pid);
    const top = [...ex.byTag.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([t, v]) => ({ tag: api.tagLabel(t), score: Number(v.toFixed(1)) }));
    send(res, 200, { pid: params.pid, top, adopted: ex.adopted, calibration: Number(ex.calibration.toFixed(2)) });
  },
};

const fallbackState = { persona: null };
function fallbackPersona() {
  if (!fallbackState.persona) fallbackState.persona = store.createPersona({ seed: 'guest-' + Math.floor(Date.now() / 86400000) });
  return fallbackState.persona;
}

function matchRoute(method, pathname) {
  for (const key of Object.keys(routes)) {
    const [m, pattern] = key.split(' ');
    if (m !== method) continue;
    const parts = pattern.split('/');
    const got = pathname.split('/');
    if (parts.length !== got.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < parts.length; i += 1) {
      if (parts[i].startsWith(':')) params[parts[i].slice(1)] = decodeURIComponent(got[i]);
      else if (parts[i] !== got[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return { handler: routes[key], params };
  }
  return null;
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png' };

const server = http.createServer(async (req, res) => {
  let pathname;
  let hit;
  try {
    pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname.startsWith('/api/')) hit = matchRoute(req.method, pathname);
  } catch (err) {
    return send(res, 400, { error: 'bad_path' });
  }

  if (pathname === '/api/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'access-control-allow-origin': '*' });
    res.write('event: hello\ndata: ' + JSON.stringify({ ts: Date.now() }) + '\n\n');
    clients.add(res);
    const beat = setInterval(() => res.write(': ping\n\n'), 20000);
    req.on('close', () => {
      clearInterval(beat);
      clients.delete(res);
    });
    return;
  }

  if (pathname.startsWith('/api/')) {
    if (!hit) return send(res, 404, { error: 'no_route', pathname });
    let body = {};
    if (req.method !== 'GET') {
      try {
        body = await readBody(req);
      } catch (err) {
        return send(res, 400, { error: err.message });
      }
    }
    try {
      return hit.handler(req, res, hit.params, body);
    } catch (err) {
      store.audit('api_error', { actor: 'system', error: err.message, path: pathname });
      return send(res, 500, { error: 'server_error', detail: err.message });
    }
  }

  let file = pathname === '/' ? '/index.html' : pathname;
  const full = path.join(WEB_DIR, path.normalize(file).replace(/^(\.\.[/\\])+/, ''));
  if (!full.startsWith(WEB_DIR)) return send(res, 403, 'forbidden');
  fs.readFile(full, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      return res.end('not found');
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(full)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(buf);
  });
});

server.listen(PORT, () => {
  process.stdout.write('众择 server on http://localhost:' + PORT + '  (SIM=' + (process.env.SIM === '0' ? 'off' : 'on') + ')\n');
});

function shutdown() {
  stopSim();
  server.close();
  store.save();
}
process.on('SIGINT', () => {
  shutdown();
  process.exit(0);
});
process.on('SIGTERM', shutdown);

module.exports = { server, store };
