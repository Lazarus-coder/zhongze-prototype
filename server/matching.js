const { ancestry } = require('./taxonomy');

function tagOverlap(aTags, bTags) {
  let score = 0;
  for (const a of aTags) {
    ancestry(a).forEach((c, depth) => {
      if (bTags.includes(c)) score += depth === 0 ? 1 : 0.55 ** depth;
    });
  }
  return score;
}

function cohortLean(dilemma, persona, ballots, personas, attrs) {
  const sets = attrs || [['age_band', 'industry'], ['age_band'], ['industry']];
  for (const keys of sets) {
    const same = ballots.filter((b) => {
      const p = personas[b.voter_pid];
      return p && keys.every((k) => p.attributes[k] === persona.attributes[k]);
    });
    if (same.length < 4) continue;
    const counts = new Map();
    for (const b of same) counts.set(b.option_key, (counts.get(b.option_key) || 0) + 1);
    const [option, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    const second = [...counts.values()].sort((a, b) => b - a)[1] || 0;
    if (n - second < 2) continue;
    return { option, n, cohort: keys.join('+'), share: Number((n / same.length).toFixed(2)) };
  }
  return null;
}

function pluralityOption(ballots) {
  if (!ballots.length) return null;
  const counts = new Map();
  for (const b of ballots) counts.set(b.option_key, (counts.get(b.option_key) || 0) + (b.weight || 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

const ATTR_LABEL = { gender: '性别', age_band: '年龄段', region: '大区', industry: '行业', marital: '婚恋状态' };

function wantedExperienceMatch(dilemma, persona) {
  const want = dilemma.wanted_experience || {};
  const hits = [];
  for (const [key, values] of Object.entries(want)) {
    if (!values || !values.length) continue;
    if (key === 'had_choice') {
      const exp = persona.declared_experience || [];
      const first = dilemma.tags[0];
      if (exp.includes(first) || exp.some((t) => ancestry(t).includes(first))) hits.push('经历过同一抉择');
      continue;
    }
    if (persona.attributes[key] && values.includes(persona.attributes[key])) hits.push((ATTR_LABEL[key] || key) + '·' + persona.attributes[key]);
  }
  return hits;
}

function countMatchingVoters(dilemma, personas) {
  const matched = Object.values(personas).filter((p) => wantedExperienceMatch(dilemma, p).length > 0);
  return { eligible: matched.length };
}

function scoreItem(dilemma, persona, ctx) {
  const ballots = ctx.ballotsByDilemma[dilemma.id] || [];
  const ex = ctx.store.expertiseOf(persona.pid);
  const declared = [...(persona.declared_tags || []), ...(persona.declared_experience || [])];
  const affinity = tagOverlap(dilemma.tags, declared) / 3;
  const expertise = Math.min(1, (ex.byTag.get(dilemma.tags[0]) || 0) / 6);
  const now = Date.now();
  const ageH = (now - dilemma.created_at) / 3600000;
  const decay = Math.exp(-ageH / 40);
  const hoursLeft = Math.max(0, (dilemma.decision_due_at - now) / 3600000);
  const urgency = hoursLeft <= 0 ? 0 : Math.min(1, 48 / Math.max(6, hoursLeft)) * (ballots.length < 45 ? 1 : 0.4);
  const needVotes = Math.max(0, 1 - ballots.length / 40);
  const heat = Math.log1p(ballots.length) / Math.log(1 + Math.max(60, ctx.maxBallots));
  const wantHits = wantedExperienceMatch(dilemma, persona);
  const wanted = Math.min(1, wantHits.length / 3);

  const score =
    0.3 * Math.min(1, affinity) +
    0.18 * expertise +
    0.16 * urgency +
    0.14 * needVotes +
    0.1 * heat +
    0.12 * wanted +
    0.1 * decay;

  return {
    score,
    is_own: dilemma.author_pid === persona.pid,
    factors: [
      { key: 'affinity', label: '标签匹配 ' + dilemma.tags.join(' / '), value: Number((0.3 * Math.min(1, affinity)).toFixed(3)) },
      { key: 'expertise', label: '你在该领域被验证过', value: Number((0.18 * expertise).toFixed(3)) },
      { key: 'urgency', label: `距决策截止 ${Math.round(hoursLeft)} 小时`, value: Number((0.16 * urgency).toFixed(3)) },
      { key: 'need_votes', label: `还差 ${Math.max(0, 40 - ballots.length)} 票结论才稳`, value: Number((0.14 * needVotes).toFixed(3)) },
      { key: 'wanted', label: wantHits.length ? '符合发帖人条件：' + wantHits.join('、') : '发帖人未设听众条件', value: Number((0.12 * wanted).toFixed(3)) },
      { key: 'recency', label: `发布 ${ageH.toFixed(1)} 小时`, value: Number((0.1 * decay).toFixed(3)) },
    ],
  };
}

function buildFeed(opts) {
  const { store, persona, limit = 12, dissentQuota = 0.2, exploreRatio = 0.15 } = opts;
  const personas = store.personaIndex();
  const candidates = Object.values(store.db.dilemmas).filter((d) => d.status === 'open' || d.status === 'needs_context');
  const ballotsByDilemma = {};
  for (const d of candidates) ballotsByDilemma[d.id] = store.ballotsOf(d.id);
  const ctx = { store, ballotsByDilemma, personas, maxBallots: Math.max(20, ...Object.values(ballotsByDilemma).map((l) => l.length)) };

  const scored = candidates.map((d) => {
    const s = scoreItem(d, persona, ctx);
    const ballots = ballotsByDilemma[d.id];
    const plurality = pluralityOption(ballots);
    const lean = cohortLean(d, persona, ballots, personas);
    return { dilemma: d, ...s, plurality, cohort_lean: lean, dissent: Boolean(lean && plurality && lean.option !== plurality) };
  });

  const ranked = scored.filter((s) => !s.is_own).sort((a, b) => b.score - a.score);
  const dissentPool = ranked.filter((s) => s.dissent);
  const mainPool = ranked.filter((s) => !s.dissent);
  const explorePool = scored
    .filter((s) => !s.is_own && tagOverlap(s.dilemma.tags, [...(persona.declared_tags || []), ...(persona.declared_experience || [])]) === 0)
    .map((s) => ({ ...s, factors: [{ key: 'explore', label: '陌生领域，防止只听到同类声音', value: 0.3 }] }));

  const picked = [];
  const perTrack = new Map();
  const chosen = new Set();

  const take = (item, role) => {
    if (!item || chosen.has(item.dilemma.id)) return false;
    const track = String(item.dilemma.tags[0]).split('.')[0];
    if ((perTrack.get(track) || 0) >= 4) return false;
    perTrack.set(track, (perTrack.get(track) || 0) + 1);
    chosen.add(item.dilemma.id);
    const d = item.dilemma;
    picked.push({
      dilemma_id: d.id,
      title: d.title,
      tags: d.tags,
      intent: d.intent,
      status: d.status,
      n_votes: (ballotsByDilemma[d.id] || []).length,
      hours_left: Math.max(0, Math.round((d.decision_due_at - Date.now()) / 3600000)),
      plurality: item.plurality || null,
      cohort_lean: item.cohort_lean || null,
      role,
      score: Number(item.score.toFixed(3)),
      reasons: (() => {
        const base = [...item.factors].sort((a, b) => b.value - a.value).slice(0, 3);
        if (role === 'dissent' && item.cohort_lean) {
          const opt = d.options.find((o) => o.key === item.cohort_lean.option) || d.options[0];
          base.unshift({ key: 'dissent', label: `和你同${item.cohort_lean.cohort === 'age_band+industry' ? '龄同行' : '景'}的 ${item.cohort_lean.n} 位多半选「${opt.label}」，与当前多数相反`, value: 1 });
        }
        return base;
      })(),
      voting_window: { opened: d.created_at, due: d.decision_due_at },
    });
    return true;
  };

  const dissentTarget = Math.round(limit * dissentQuota);
  const exploreTarget = Math.round(limit * exploreRatio);
  const mainTarget = limit - dissentTarget - exploreTarget;

  let mains = 0;
  for (const item of mainPool) {
    if (mains >= mainTarget) break;
    if (take(item, 'matched')) mains += 1;
  }
  let ds = 0;
  for (const item of dissentPool) {
    if (ds >= dissentTarget) break;
    if (take(item, 'dissent')) ds += 1;
  }
  let es = 0;
  for (const item of explorePool) {
    if (es >= exploreTarget) break;
    if (take(item, 'explore')) es += 1;
  }
  for (const item of ranked) {
    if (picked.length >= limit) break;
    take(item, 'matched');
  }

  const own = scored
    .filter((s) => s.is_own)
    .map((s) => ({
      dilemma_id: s.dilemma.id,
      title: s.dilemma.title,
      tags: s.dilemma.tags,
      status: s.dilemma.status,
      intent: s.dilemma.intent,
      n_votes: (ballotsByDilemma[s.dilemma.id] || []).length,
      hours_left: Math.max(0, Math.round((s.dilemma.decision_due_at - Date.now()) / 3600000)),
      plurality: s.plurality || null,
      role: 'own',
      score: 1,
      reasons: [{ key: 'own', label: '你自己发布的抉择', value: 1 }],
      voting_window: { opened: s.dilemma.created_at, due: s.dilemma.decision_due_at },
    }));

  return { items: [...own, ...picked], counts: { open: candidates.length, main_target: mainTarget, dissent_slots: dissentTarget, explore_slots: exploreTarget, per_track_cap: 4 } };
}

function rankVotersForDilemma(store, dilemma, personas, limit) {
  return Object.values(personas)
    .filter((p) => p.pid !== dilemma.author_pid)
    .map((p) => {
      const ex = store.expertiseOf(p.pid);
      const affinity = tagOverlap(dilemma.tags, [...(p.declared_tags || []), ...(p.declared_experience || [])]);
      const wanted = wantedExperienceMatch(dilemma, p).length;
      return { pid: p.pid, affinity, wanted, expertise: ex.byTag.get(dilemma.tags[0]) || 0, karma: p.karma };
    })
    .sort((a, b) => b.affinity + b.wanted * 2 + b.expertise - (a.affinity + a.wanted * 2 + a.expertise))
    .slice(0, limit || 30);
}

module.exports = { buildFeed, scoreItem, tagOverlap, wantedExperienceMatch, countMatchingVoters, cohortLean, pluralityOption, rankVotersForDilemma };
