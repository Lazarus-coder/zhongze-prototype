const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const identity = require('./identity');
const moderation = require('./moderation');
const { ancestry, advicePolicy, crisisSensitive } = require('./taxonomy');

const DATA_DIR = process.env.QZ_DATA_DIR || path.join(__dirname, '..', '.data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

const DEFAULT_WINDOW_H = Number(process.env.QZ_WINDOW_H || 72);

class Store extends EventEmitter {
  constructor() {
    super();
    this.db = {
      keyRing: identity.newKeyRing(),
      personas: {},
      dilemmas: {},
      ballots: [],
      questions: [],
      reports: [],
      jury: [],
      audit: [],
      outcomes: {},
      meta: { created_at: Date.now(), key_rotations: 0 },
    };
    this.expertiseCache = new Map();
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(STATE_FILE)) {
        const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        this.db = { ...this.db, ...raw };
      }
    } catch (err) {
      process.stderr.write('state load failed: ' + err.message + '\n');
    }
  }

  save() {
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        const tmp = STATE_FILE + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(this.db));
        fs.renameSync(tmp, STATE_FILE);
      } catch (err) {
        process.stderr.write('state save failed: ' + err.message + '\n');
      }
    }, 120);
    if (this._saveTimer.unref) this._saveTimer.unref();
  }

  reset(db) {
    this.db = db;
    this.expertiseCache.clear();
    this.save();
  }

  hydrate(payload) {
    return this.db.personas[payload.pid] || null;
  }

  audit(action, meta) {
    this.db.audit.unshift({ id: 'a_' + (this.db.audit.length + 1), ts: Date.now(), action, ...meta });
    this.db.audit = this.db.audit.slice(0, 300);
    this.save();
  }

  createPersona(opts) {
    const rnd = identity.mulberry32((opts && opts.rnd_seed) || Math.floor(Math.random() * 1e9));
    const p = identity.createPersona(this.db.keyRing, opts && opts.seed, rnd);
    if (opts && opts.handle) p.handle = opts.handle;
    if (opts && opts.attributes) p.attributes = { ...p.attributes, ...opts.attributes };
    if (opts && opts.declared_tags) p.declared_tags = opts.declared_tags;
    if (opts && opts.declared_experience) p.declared_experience = opts.declared_experience;
    this.db.personas[p.pid] = p;
    this.save();
    return p;
  }

  rotateKeys() {
    this.db.keyRing = identity.rotateKeyRing(this.db.keyRing);
    this.db.meta.key_rotations += 1;
    this.audit('key_rotation', { actor: 'ops', version: this.db.keyRing.version });
    return this.db.keyRing.version;
  }

  addDilemma(input, author) {
    const now = Date.now();
    const id = 'D' + Object.keys(this.db.dilemmas).length + '_' + now.toString(36).slice(-4);
    const tags = input.tags || [];
    const mod = moderation.classifyPost({ ...input, tags });
    let status = 'open';
    if (mod.level === 'crisis') status = 'crisis_hold';
    else if (mod.level === 'reject') status = 'rejected';
    else if (mod.level === 'needs_context') status = 'needs_context';

    const dilemma = {
      id,
      author_pid: author ? author.pid : null,
      title: input.title,
      situation: input.situation,
      intent: input.intent || 'conclusion',
      options: (input.options || []).map((o, i) => ({ key: o.key || 'o' + i, label: o.label, desc: o.desc || '' })),
      axes: input.axes || [],
      tags,
      wanted_experience: input.wanted_experience || {},
      decision_due_at: input.decision_due_at || now + DEFAULT_WINDOW_H * 3600000,
      expires_at: now + DEFAULT_WINDOW_H * 3600000,
      created_at: now,
      updated_at: now,
      status,
      moderation: mod,
      privacy: input.privacy || { masked_types: [], region_granularity: '大区' },
      policy: { advice: advicePolicy(tags), crisis: crisisSensitive(tags) },
      questions: [],
      accepted_ballot_ids: [],
      helpful: {},
    };
    this.db.dilemmas[id] = dilemma;
    if (author) author.karma += 1;
    this.audit('dilemma_created', { actor: author ? author.pid : 'system', dilemma_id: id, level: mod.level, actions: mod.actions });
    this.emit('open', dilemma);
    this.save();
    return dilemma;
  }

  reopenDilemma(id, patch) {
    const d = this.db.dilemmas[id];
    if (!d) return null;
    if (patch) {
      if (patch.situation) d.situation = patch.situation;
      if (patch.title) d.title = patch.title;
      if (patch.options) d.options = patch.options;
    }
    const mod = moderation.classifyPost(d);
    d.moderation = mod;
    if (mod.level === 'crisis') d.status = 'crisis_hold';
    else if (mod.level === 'reject') d.status = 'rejected';
    else if (mod.level === 'needs_context') d.status = 'needs_context';
    else d.status = 'open';
    d.updated_at = Date.now();
    this.audit('dilemma_reopened', { actor: 'author', dilemma_id: id, level: mod.level });
    this.emit('status', d);
    this.save();
    return d;
  }

  addBallot(dilemma, input) {
    const voter = this.db.personas[input.voter_pid];
    if (!voter) throw new Error('unknown voter');
    const now = Date.now();
    const mc = moderation.classifyBallot(input, dilemma);
    const components = {};
    const ex = this.expertiseOf(voter.pid);
    let affinity = 0;
    for (const t of dilemma.tags) {
      for (const chain of [ancestry(t)]) {
        for (const c of chain) {
          const w = c === t ? 1 : 0.55;
          affinity = Math.max(affinity, (ex.byTag.get(c) || 0) * w);
        }
      }
    }
    components.domain_expertise = Number((1 + Math.min(1, affinity / 6) * 0.8).toFixed(2));
    components.calibration = Number((1 + Math.min(0.6, Math.max(-0.3, ex.calibration * 0.4))).toFixed(2));
    components.experience_claim = input.experience_claim && input.experience_claim.length ? 1.35 : 1;
    components.confidence = Number((0.7 + (input.confidence || 60) / 200).toFixed(2));
    components.moderation_factor = Number(mc.weight_factor.toFixed(2));
    components.credibility = Number((0.85 + Math.min(0.5, voter.credibility * 0.05)).toFixed(2));

    const weight = Object.values(components).reduce((s, v) => s * v, 1);
    const opt = dilemma.options.find((o) => o.key === input.option_key) || dilemma.options[0];
    const ballot = {
      id: 'B' + (this.db.ballots.length + 1),
      dilemma_id: dilemma.id,
      voter_pid: voter.pid,
      option_key: opt.key,
      option_label: opt.label,
      reason: input.reason || '',
      confidence: input.confidence || 60,
      axis_scores: input.axis_scores || null,
      experience_claim: input.experience_claim || [],
      weight: Number(weight.toFixed(3)),
      weight_components: components,
      created_at: now,
      suppressed: mc.suppressed,
      ballot_moderation: mc,
      helpful_votes: 0,
      adopted: false,
    };
    this.db.ballots.push(ballot);
    this.expertiseCache.delete(voter.pid);
    if (mc.suppressed) this.audit('ballot_suppressed', { actor: 'filter', ballot_id: ballot.id, labels: mc.labels.map((l) => l.label) });
    this.emit('ballot', { dilemma_id: dilemma.id, ballot });
    this.save();
    return ballot;
  }

  expertiseOf(pid) {
    if (this.expertiseCache.has(pid)) return this.expertiseCache.get(pid);
    const byTag = new Map();
    let calibration = 0;
    let calCount = 0;
    const declared = this.db.personas[pid] ? this.db.personas[pid].declared_tags || [] : [];
    for (const t of declared) byTag.set(t, 2);
    for (const b of this.db.ballots) {
      if (b.voter_pid !== pid) continue;
      const d = this.db.dilemmas[b.dilemma_id];
      if (!d) continue;
      const quality = 1 + Math.min(6, b.helpful_votes) * 0.5 + (b.adopted ? 2 : 0);
      for (const t of d.tags) {
        for (const c of ancestry(t)) byTag.set(c, (byTag.get(c) || 0) + quality * (c === t ? 1 : 0.4));
      }
      for (const c of b.experience_claim || []) byTag.set(c, (byTag.get(c) || 0) + 3);
      if (b.adopted) {
        calCount += 1;
        const outcome = this.db.outcomes[d.id];
        if (outcome && outcome.went_with_advice) calibration += 1;
        else if (outcome) calibration += 0.2;
        else calibration += 0.4;
      }
    }
    const res = { pid, byTag, max: Math.max(...[...byTag.values(), 1]), calibration: calCount ? calibration / calCount - 0.45 : 0, adopted: calCount };
    this.expertiseCache.set(pid, res);
    return res;
  }

  ballotsOf(dilemmaId) {
    return this.db.ballots.filter((b) => b.dilemma_id === dilemmaId && !b.suppressed);
  }

  allActiveBallots() {
    return this.db.ballots.filter((b) => {
      const d = this.db.dilemmas[b.dilemma_id];
      return d && d.status !== 'crisis_hold' && d.status !== 'rejected' && !b.suppressed;
    });
  }

  markAdopted(dilemmaId, ballotId) {
    const b = this.db.ballots.find((x) => x.id === ballotId && x.dilemma_id === dilemmaId);
    if (!b) return null;
    b.adopted = true;
    const d = this.db.dilemmas[dilemmaId];
    if (d && !d.accepted_ballot_ids.includes(ballotId)) d.accepted_ballot_ids.push(ballotId);
    this.expertiseCache.delete(b.voter_pid);
    this.audit('advice_adopted', { actor: d.author_pid, ballot_id: ballotId });
    this.save();
    return b;
  }

  markHelpful(dilemmaId, ballotId, byPid) {
    const d = this.db.dilemmas[dilemmaId];
    if (!d) return null;
    const key = ballotId + ':' + byPid;
    if (d.helpful[key]) return d.helpful[key];
    const b = this.db.ballots.find((x) => x.id === ballotId && x.dilemma_id === dilemmaId);
    if (!b) return null;
    b.helpful_votes += 1;
    d.helpful[key] = true;
    const voter = this.db.personas[b.voter_pid];
    if (voter) voter.karma += 2;
    this.expertiseCache.delete(b.voter_pid);
    this.save();
    return b;
  }

  addQuestion(dilemmaId, fromPid, text) {
    const q = { id: 'Q' + (this.db.questions.length + 1), dilemma_id: dilemmaId, from_pid: fromPid, text, answer: null, created_at: Date.now() };
    this.db.questions.push(q);
    const d = this.db.dilemmas[dilemmaId];
    if (d) d.questions.push(q.id);
    this.emit('question', q);
    this.save();
    return q;
  }

  answerQuestion(qid, answer) {
    const q = this.db.questions.find((x) => x.id === qid);
    if (!q) return null;
    q.answer = answer;
    this.emit('question_answered', q);
    this.save();
    return q;
  }

  report(target, reason, byPid) {
    const r = { id: 'R' + (this.db.reports.length + 1), target, reason, by_pid: byPid, created_at: Date.now(), status: 'open' };
    this.db.reports.push(r);
    const verdict = moderation.classifyPost({ title: reason, situation: reason, options: [] });
    this.db.jury.push({
      id: 'J' + this.db.jury.length + 1,
      report_id: r.id,
      target,
      reason,
      auto_level: verdict.level,
      votes: [],
      status: 'open',
      created_at: Date.now(),
      rule: ruleForLevel(verdict.level),
    });
    this.audit('report_filed', { actor: byPid, target, reason });
    this.emit('jury', this.db.jury[this.db.jury.length - 1]);
    this.save();
    return r;
  }

  juryVote(juryId, pid, decision) {
    const j = this.db.jury.find((x) => x.id === juryId);
    if (!j) return null;
    if (j.votes.some((v) => v.pid === pid)) return j;
    j.votes.push({ pid, decision, ts: Date.now() });
    if (j.votes.length >= 5) {
      const keep = j.votes.filter((v) => v.decision === 'keep').length;
      j.status = keep >= 3 ? 'kept' : 'removed';
      if (j.status === 'removed' && String(j.target).startsWith('D')) {
        const d = this.db.dilemmas[j.target];
        if (d) {
          d.status = 'archived';
          this.emit('status', d);
        }
      }
      this.audit('jury_verdict', { actor: 'jury', jury_id: j.id, status: j.status });
    }
    this.save();
    return j;
  }

  addOutcome(dilemmaId, outcome) {
    const o = { dilemma_id: dilemmaId, ...outcome, created_at: Date.now() };
    this.db.outcomes[dilemmaId] = o;
    const d = this.db.dilemmas[dilemmaId];
    if (d) {
      d.status = 'decided';
      d.outcome = o;
      for (const b of this.db.ballots) {
        if (b.dilemma_id === dilemmaId && b.adopted) this.expertiseCache.delete(b.voter_pid);
      }
      this.emit('status', d);
    }
    this.audit('outcome_reported', { actor: d ? d.author_pid : 'system', dilemma_id: dilemmaId, chosen: o.chosen_option_key });
    this.save();
    return o;
  }

  requestHumanReview(id) {
    const d = this.db.dilemmas[id];
    if (!d) return null;
    d.status = 'pending_human_review';
    d.review_requested_at = Date.now();
    this.audit('crisis_safety_check', { actor: d.author_pid, dilemma_id: id, note: '发帖人确认当前安全，转人工复核' });
    this.emit('status', d);
    this.save();
    return d;
  }

  approveDilemma(id) {
    const d = this.db.dilemmas[id];
    if (!d) return null;
    d.status = 'open';
    d.moderation.actions = [...new Set([...(d.moderation.actions || []), 'human_cleared_crisis'])];
    this.audit('ops_approve', { actor: 'ops', dilemma_id: id });
    this.emit('status', d);
    this.save();
    return d;
  }

  closeDilemma(dilemmaId) {
    const d = this.db.dilemmas[dilemmaId];
    if (!d) return null;
    d.status = d.status === 'open' ? 'closed' : d.status;
    this.emit('status', d);
    this.save();
    return d;
  }

  personaIndex() {
    return this.db.personas;
  }
}

function ruleForLevel(level) {
  const found = moderation.RULES_DOC.find((r) => r.level === level);
  return found ? { title: found.title, public: found.public, ops: found.ops } : null;
}

module.exports = { Store, ruleForLevel, DEFAULT_WINDOW_H, DATA_DIR, STATE_FILE };
