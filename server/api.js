const { TAGS, AXE_LIBRARY, EXPERIENCE_ATTRIBUTES, tracks } = require('./taxonomy');
const privacy = require('./privacy');
const moderation = require('./moderation');
const opinions = require('./opinions');
const stats = require('./stats');
const matching = require('./matching');
const { SPECIFIC_ADVICE } = require('./moderation');

const SLICE_DIMS = ['age_band', 'industry', 'gender', 'region'];
const K_MIN = Number(process.env.QZ_K_MIN || 8);
const EPSILON = Number(process.env.QZ_EPSILON || 1);

function publicPersona(store, pid) {
  const p = store.db.personas[pid];
  if (!p) return null;
  return { pid: p.pid, handle: p.handle, avatar: p.avatar, karma: p.karma, badges: p.badges, credibility: p.credibility };
}

function tagLabel(id) {
  const t = TAGS.find((x) => x.id === id);
  return t ? t.label : id;
}

function redact(text) {
  let out = text;
  let hit = false;
  for (const s of SPECIFIC_ADVICE) {
    s.re.lastIndex = 0;
    if (s.re.test(out)) {
      hit = true;
      out = out.replace(s.re, '【已折叠：' + s.label + '】');
    }
  }
  return { text: out, redacted: hit };
}

function publicBallot(store, b) {
  const voter = publicPersona(store, b.voter_pid);
  const r = redact(b.reason || '');
  return {
    id: b.id,
    option_key: b.option_key,
    option_label: b.option_label,
    reason: r.text,
    original_redacted: r.redacted,
    confidence: b.confidence,
    weight: b.weight,
    weight_components: b.weight_components,
    experience_claim: (b.experience_claim || []).map(tagLabel),
    helpful_votes: b.helpful_votes,
    adopted: b.adopted,
    created_at: b.created_at,
    voter,
    filter_labels: (b.ballot_moderation && b.ballot_moderation.labels) || [],
  };
}

function crowdWeights(ballots, axes, options) {
  const out = {};
  for (const axe of axes) {
    let num = 0;
    let den = 0;
    for (const b of ballots) {
      if (!b.axis_scores) continue;
      const mine = b.axis_scores[b.option_key];
      if (!mine || mine[axe.id] === undefined) continue;
      for (const other of options) {
        if (other.key === b.option_key) continue;
        const theirs = b.axis_scores[other.key];
        if (!theirs || theirs[axe.id] === undefined) continue;
        num += mine[axe.id] - theirs[axe.id];
        den += 1;
      }
    }
    out[axe.id] = den ? Number(Math.max(0.4, Math.abs(num / den) / 3 + 0.6).toFixed(2)) : 1;
  }
  return out;
}

function dilemmaSummary(store, d, n) {
  return {
    id: d.id,
    title: d.title,
    tags: d.tags.map(tagLabel),
    status: d.status,
    intent: d.intent,
    n_votes: n === undefined ? store.ballotsOf(d.id).length : n,
    created_at: d.created_at,
    due: d.decision_due_at,
  };
}

function similarDecisions(store, dilemma, limit) {
  const pool = Object.values(store.db.dilemmas).filter((d) => d.id !== dilemma.id && (d.status === 'decided' || d.status === 'closed' || d.outcome));
  if (!pool.length) return [];
  const index = opinions.buildIndex(pool.map((d) => ({ id: d.id, text: d.title + '\n' + d.situation, ref: d })));
  const hits = opinions.search(index, dilemma.title + '\n' + dilemma.situation, limit || 3);
  return hits.map((h) => ({
    id: h.id,
    title: h.ref.title,
    tags: h.ref.tags.map(tagLabel),
    similarity: h.sim,
    n_votes: store.ballotsOf(h.ref.id).length,
    outcome: h.ref.outcome ? { chosen: (h.ref.options.find((o) => o.key === h.ref.outcome.chosen_option_key) || {}).label, went_with_advice: h.ref.outcome.went_with_advice, reflection: h.ref.outcome.reflection, months_after: h.ref.outcome.months_after } : null,
  }));
}

function hotlineCard() {
  return {
    title: '先别急着做决定',
    body: '你的帖子已经保存为草稿，没有推给陌生人。此刻更重要的是有人陪你把今天过完。',
    lines: [
      { name: '全国 24 小时心理援助热线', value: '12356' },
      { name: '北京心理危机研究与干预中心', value: '010-82951332' },
      { name: '希望 24 热线', value: '400-161-9995' },
    ],
    actions: ['我已安全，重新提交', '只想要建议，不要投票', '删除草稿'],
  };
}

function detail(store, id, viewer) {
  const d = store.db.dilemmas[id];
  if (!d) return null;
  const ballots = store.ballotsOf(d.id);
  const isAuthor = viewer && viewer.pid === d.author_pid;
  const axes = (d.axes || []).map((a) => AXE_LIBRARY[a.id] || { id: a.id, label: a.id, hint: '' });
  const rows = stats.tally(store.db.ballots.filter((b) => b.dilemma_id === d.id));
  const rawTotal = rows.reduce((s, r) => s + r.raw, 0);
  const pol = stats.polarization(rows);
  const matrix = stats.axisMatrix(ballots, axes, d.options);
  const suggested = crowdWeights(ballots, axes, d.options);
  const baseUtility = stats.utility(matrix, suggested, d.options);
  const flip = stats.flipSensitivity(matrix, suggested, d.options, axes);
  const clusters = ballots.length >= 3 ? opinions.clusterBallots(ballots.map((b) => ({ ...b, option_label: b.option_label, reason: b.reason })), d.options) : { pro: [], con: [], neutral: [] };

  const voters = ballots.map((b) => store.db.personas[b.voter_pid]).filter(Boolean);
  const slicePayload = {};
  for (const dim of SLICE_DIMS) slicePayload[dim] = stats.slice(ballots, store.db.personas, dim, K_MIN, EPSILON);

  const questions = (d.questions || []).map((qid) => store.db.questions.find((q) => q.id === qid)).filter(Boolean).map((q) => ({
    id: q.id,
    text: q.text,
    answer: q.answer,
    from: publicPersona(store, q.from_pid),
    created_at: q.created_at,
  }));

  store.audit('detail_view', { actor: viewer ? viewer.pid : 'anon', dilemma_id: id, policy: d.policy.advice });

  const myBallot = viewer ? ballots.find((b) => b.voter_pid === viewer.pid) : null;

  return {
    dilemma: {
      id: d.id,
      title: d.title,
      situation: d.situation,
      intent: d.intent,
      options: d.options,
      axes: axes.map((a) => ({ ...a, weight: suggested[a.id] || 1 })),
      tags: d.tags,
      tag_labels: d.tags.map(tagLabel),
      status: d.status,
      created_at: d.created_at,
      due: d.decision_due_at,
      author: isAuthor ? { pid: d.author_pid, self: true } : { anonymous: true },
      wanted_experience: Object.entries(d.wanted_experience || {}).map(([k, v]) => ({ key: k, label: (EXPERIENCE_ATTRIBUTES.find((a) => a.id === k) || {}).label || k, values: v })),
      privacy: d.privacy,
      moderation: d.moderation,
      policy: d.policy,
      outcome: d.outcome || null,
      accepted_ballot_ids: d.accepted_ballot_ids,
      matching: { eligible_voters: matching.countMatchingVoters(d, store.db.personas).eligible, experienced_share: ballots.length ? Number((ballots.filter((b) => (b.experience_claim || []).length).length / ballots.length).toFixed(2)) : 0 },
    },
    stats: { n: ballots.length, rows, polarization: pol, ci95: rows.length ? stats.wilson(rows[0].raw, rawTotal) : null, weight_explain: stats.weightExplain(ballots, store.db.personas) },
    clusters,
    matrix,
    utility: baseUtility,
    flip_sensitivity: flip,
    slices: slicePayload,
    memo: stats.memo(d, ballots, store.db.personas),
    hotline: d.status === 'crisis_hold' ? hotlineCard() : null,
    questions,
    ballots: ballots.sort((a, b) => b.helpful_votes - a.helpful_votes || b.created_at - a.created_at).slice(0, 40).map((b) => publicBallot(store, b)),
    similar: similarDecisions(store, d, 3),
    is_author: Boolean(isAuthor),
    my_ballot: myBallot ? publicBallot(store, myBallot) : null,
  };
}

function bootstrap(store, viewer) {
  const all = Object.values(store.db.dilemmas);
  const open = all.filter((d) => d.status === 'open' || d.status === 'needs_context');
  return {
    tracks: tracks().map((t) => ({ id: t.id, label: t.label, children: t.children.map((c) => ({ id: c.id, label: c.label, advice: c.advice, crisis: Boolean(c.crisisSensitive) })) })),
    axes: Object.values(AXE_LIBRARY),
    experience_attributes: EXPERIENCE_ATTRIBUTES,
    rules: moderation.RULES_DOC,
    me: viewer ? { ...publicPersona(store, viewer.pid), declared_tags: viewer.declared_tags, attributes: viewer.attributes } : null,
    counts: {
      dilemmas: all.length,
      open: open.length,
      ballots: store.db.ballots.length,
      held: all.filter((d) => d.status === 'crisis_hold').length,
      decided: all.filter((d) => d.outcome).length,
    },
    slice_policy: { k_min: K_MIN, epsilon: EPSILON },
  };
}

function publish(store, viewer, input) {
  const rawText = [input.title, input.situation].join('\n');
  const scan = privacy.scan(rawText);
  const maskedTypes = input.mask_types || scan.findings.filter((f) => f.severity !== 'low').map((f) => f.id);
  const title = privacy.maskByTypes(input.title, maskedTypes);
  const situation = privacy.maskByTypes(input.situation, maskedTypes);
  const dryRun = Boolean(input.dry_run);
  const payload = {
    title,
    situation,
    intent: input.intent || 'conclusion',
    tags: input.tags || [],
    axes: (input.axes || []).map((a) => ({ id: typeof a === 'string' ? a : a.id })),
    options: (input.options || []).map((o, i) => ({ key: o.key || 'o' + (i + 1), label: privacy.maskByTypes(o.label, maskedTypes), desc: privacy.maskByTypes(o.desc || '', maskedTypes) })),
    wanted_experience: input.wanted_experience || {},
    privacy: { masked_types: maskedTypes, region_granularity: '大区', auto_mask_applied: true },
  };
  if (dryRun) {
    const preview = moderation.classifyPost(payload);
    return { preview: true, scan: { risk: scan.risk, findings: scan.findings.map((f) => ({ id: f.id, label: f.label, severity: f.severity, count: f.count, advice: f.advice })) }, masked: { title, situation }, moderation: preview, hotline: preview.level === 'crisis' ? hotlineCard() : null };
  }
  const d = store.addDilemma(payload, viewer);
  return { dilemma: d, scan: { risk: scan.risk, findings: scan.findings.map((f) => ({ id: f.id, label: f.label, severity: f.severity, count: f.count, advice: f.advice })) }, hotline: d.status === 'crisis_hold' ? hotlineCard() : null };
}

function castBallot(store, viewer, dilemmaId, input) {
  const d = store.db.dilemmas[dilemmaId];
  if (!d) return { error: 'not_found' };
  if (d.status === 'crisis_hold' || d.status === 'rejected') return { error: 'held', message: '该抉择未进入投票池' };
  if (d.status !== 'open' && d.status !== 'needs_context') return { error: 'closed' };
  if (d.author_pid === viewer.pid) return { error: 'self_vote' };
  const existing = store.ballotsOf(dilemmaId).find((b) => b.voter_pid === viewer.pid);
  const reason = privacy.maskByTypes(input.reason || '', ['phone', 'id_card', 'email', 'im_account', 'url', 'address', 'plate', 'coords', 'medical_record']);
  const payload = {
    voter_pid: viewer.pid,
    option_key: input.option_key,
    reason,
    confidence: Number(input.confidence) || 60,
    axis_scores: input.axis_scores || null,
    experience_claim: input.experience_claim || [],
  };
  const ballot = existing ? (() => {
    store.db.ballots = store.db.ballots.filter((b) => b.id !== existing.id);
    store.expertiseCache.delete(viewer.pid);
    const nb = store.addBallot(d, payload);
    nb.replaced = true;
    return nb;
  })() : store.addBallot(d, payload);
  const flags = moderation.anomalyReport(store.ballotsOf(dilemmaId), store.db.personas).filter((f) => f.pid === viewer.pid || f.key && f.key.includes(viewer.pid));
  return { ballot: publicBallot(store, ballot), anomaly: flags, stats: stats.tally(store.db.ballots.filter((b) => b.dilemma_id === dilemmaId)) };
}

function governance(store) {
  const all = Object.values(store.db.dilemmas);
  const distribution = {};
  for (const d of all) distribution[d.moderation.level] = (distribution[d.moderation.level] || 0) + 1;
  const anomalies = moderation.anomalyReport(store.db.ballots.filter((b) => b.dilemma_id), store.db.personas);
  return {
    queue: all
      .filter((d) => d.status === 'crisis_hold' || d.status === 'pending_human_review' || d.moderation.review === 'required' || d.status === 'rejected' || d.status === 'needs_context')
      .map((d) => ({ id: d.id, title: d.title, status: d.status, level: d.moderation.level, actions: d.moderation.actions, rationale: d.moderation.rationale, n_votes: store.ballotsOf(d.id).length, created_at: d.created_at, review_requested_at: d.review_requested_at || null })),
    jury: store.db.jury.map((j) => ({
      id: j.id,
      target: j.target,
      reason: j.reason,
      auto_level: j.auto_level,
      rule: j.rule,
      status: j.status,
      votes: j.votes.length,
      needed: 5,
      created_at: j.created_at,
    })),
    distribution,
    anomalies: anomalies.slice(0, 20),
    audit: store.db.audit.slice(0, 40),
    key_version: store.db.keyRing.version,
    privacy: { k_min: K_MIN, epsilon: EPSILON, masked_types: [...new Set(all.flatMap((d) => (d.privacy && d.privacy.masked_types) || []))] },
  };
}

function analytics(store) {
  const all = Object.values(store.db.dilemmas);
  const withVotes = all.filter((d) => store.ballotsOf(d.id).length > 0);
  const firstVote = withVotes.map((d) => {
    const b = store.db.ballots.filter((x) => x.dilemma_id === d.id).sort((a, c) => a.created_at - c.created_at)[0];
    return b ? (b.created_at - d.created_at) / 60000 : null;
  }).filter((v) => v !== null);
  const adopted = store.db.ballots.filter((b) => b.adopted).length;
  const outcomes = Object.values(store.db.outcomes);
  return {
    posts: all.length,
    votes: store.db.ballots.length,
    avg_votes: Number((store.db.ballots.length / Math.max(1, all.length)).toFixed(1)),
    median_first_vote_min: firstVote.length ? Number(firstVote.sort((a, b) => a - b)[Math.floor(firstVote.length / 2)].toFixed(0)) : null,
    adoption_rate: Number((adopted / Math.max(1, store.db.ballots.length)).toFixed(3)),
    outcome_return_rate: Number((outcomes.length / Math.max(1, all.filter((d) => d.status === 'closed' || d.status === 'decided').length)).toFixed(2)),
    advice_agree_rate: outcomes.length ? Number((outcomes.filter((o) => o.went_with_advice).length / outcomes.length).toFixed(2)) : null,
    crisis_held: all.filter((d) => d.status === 'crisis_hold').length,
    regulated: all.filter((d) => d.moderation.level === 'regulated').length,
    held_rate: Number(((withVotes.length ? 0 : 0) + all.filter((d) => d.status === 'crisis_hold' || d.status === 'rejected').length / Math.max(1, all.length)).toFixed(2)),
  };
}

module.exports = { detail, bootstrap, publish, castBallot, governance, analytics, publicBallot, publicPersona, tagLabel, similarDecisions, hotlineCard, SLICE_DIMS, K_MIN, EPSILON, crowdWeights };
