const STOP = new Set(['什么', '怎么', '自己', '这个', '那个', '现在', '已经', '可能', '一点', '还是', '因为', '所以', '如果', '感觉', '觉得', '可以', '其实', '真的', '我们', '你们', '他们', '一个', '没有', '就是', '知道', '不是', '的话', '有点', '觉得']);

function tokenize(text) {
  const clean = String(text).toLowerCase().replace(/[\s\n\r]+/g, '');
  const tokens = [];
  let latin = '';
  for (const ch of clean) {
    if (/[a-z0-9]/.test(ch)) {
      latin += ch;
      continue;
    }
    if (latin) {
      if (latin.length > 1) tokens.push(latin);
      latin = '';
    }
    if (/[\u4e00-\u9fa5]/.test(ch)) tokens.push(ch);
  }
  if (latin && latin.length > 1) tokens.push(latin);
  const bigrams = [];
  for (let i = 0; i < tokens.length; i += 1) {
    if (/[a-z0-9]/.test(tokens[i])) continue;
    bigrams.push(tokens[i]);
    if (i + 1 < tokens.length && /[一-龥]/.test(tokens[i + 1])) bigrams.push(tokens[i] + tokens[i + 1]);
  }
  return bigrams.filter((t) => t.length > 1 && !STOP.has(t));
}

function tf(tokens) {
  const m = new Map();
  for (const t of tokens) m.set(t, (m.get(t) || 0) + 1);
  return m;
}

function idf(docs) {
  const df = new Map();
  for (const d of docs) {
    for (const t of new Set(d)) df.set(t, (df.get(t) || 0) + 1);
  }
  const n = Math.max(1, docs.length);
  const m = new Map();
  for (const [t, c] of df) m.set(t, Math.log(1 + n / (1 + c)));
  return m;
}

function vec(map, idfMap) {
  const out = new Map();
  let norm = 0;
  for (const [t, c] of map) {
    const w = (1 + Math.log(c)) * (idfMap.get(t) || Math.log(1 + idfMap.size));
    out.set(t, w);
    norm += w * w;
  }
  norm = Math.sqrt(norm) || 1;
  for (const [t, w] of out) out.set(t, w / norm);
  return out;
}

function cosine(a, b) {
  const [small, big] = a.size > b.size ? [b, a] : [a, b];
  let s = 0;
  for (const [t, w] of small) s += w * (big.get(t) || 0);
  return s;
}

function topTerms(maps, idfMap, k) {
  const agg = new Map();
  for (const m of maps) {
    for (const [t, w] of m) agg.set(t, (agg.get(t) || 0) + w * (idfMap.get(t) || 1));
  }
  return [...agg.entries()].sort((a, b) => b[1] - a[1]).slice(0, k).map(([t]) => t);
}

const SIDE_WORDS = {
  pro: ['建议', '选', '去', '冲', '应该', '值得', '支持', '优先', '同意', '试', '签', '报'],
  con: ['别', '不要', '千万', '谨慎', '反对', '不值得', '算了', '劝退', '风险', '犹豫', '不选', '后悔', '冷静'],
};

function stanceScore(text) {
  let s = 0;
  for (const w of SIDE_WORDS.pro) if (text.includes(w)) s += 1;
  for (const w of SIDE_WORDS.con) if (text.includes(w)) s -= 1;
  return s;
}

function clusterBallots(ballots, options) {
  const docs = ballots.map((b) => tokenize(b.reason || b.option_label || ''));
  const idfMap = idf(docs);
  const vecs = docs.map((d) => vec(tf(d), idfMap));

  const clusters = [];
  const used = new Set();
  for (let i = 0; i < ballots.length; i += 1) {
    if (used.has(i)) continue;
    const members = [i];
    used.add(i);
    for (let j = i + 1; j < ballots.length; j += 1) {
      if (used.has(j)) continue;
      if (cosine(vecs[i], vecs[j]) >= 0.42) {
        members.push(j);
        used.add(j);
      }
    }
    clusters.push(members);
  }

  const out = clusters
    .map((members, idx) => {
      const items = members.map((m) => ballots[m]);
      const optionCount = new Map();
      let stanceSum = 0;
      for (const b of items) {
        optionCount.set(b.option_key, (optionCount.get(b.option_key) || 0) + 1);
        stanceSum += stanceScore(b.reason || '');
      }
      const [topOption, topCount] = [...optionCount.entries()].sort((a, b) => b[1] - a[1])[0];
      const sorted = [...items].sort((a, b) => b.helpful_votes - a.helpful_votes || b.confidence - a.confidence);
      const rep = sorted[0];
      return {
        id: 'c' + idx,
        option_key: topOption,
        option_label: (options.find((o) => o.key === topOption) || {}).label || topOption,
        side: topOption === (options[0] && options[0].key) ? 'pro' : 'con',
        count: items.length,
        weighted: items.reduce((s, b) => s + (b.weight || 1), 0),
        avg_confidence: Math.round(items.reduce((s, b) => s + (b.confidence || 0), 0) / items.length),
        terms: topTerms(members.map((m) => vecs[m]), idfMap, 6),
        representative: { pid: rep.voter_pid, text: rep.reason, option_label: rep.option_label, confidence: rep.confidence, helpful_votes: rep.helpful_votes, experience: rep.experience_claim || [] },
        ballot_ids: members.map((m) => ballots[m].id),
        dissent: stanceSum > 0 && topCount < items.length ? true : stanceSum < 0,
      };
    })
    .sort((a, b) => b.count - a.count || b.weighted - a.weighted);

  const grouped = { pro: [], con: [], neutral: [] };
  for (const c of out) {
    const bucket = c.option_key === options[0].key ? 'pro' : 'con';
    grouped[bucket].push(c);
  }
  return grouped;
}

function buildIndex(items) {
  const docs = items.map((it) => tokenize(it.text));
  const idfMap = idf(docs);
  const vecs = docs.map((d) => vec(tf(d), idfMap));
  return { items, idfMap, vecs };
}

function search(index, query, limit) {
  const qTokens = tokenize(query);
  const qv = vec(tf(qTokens), index.idfMap);
  return index.items
    .map((item, i) => ({ item, sim: cosine(qv, index.vecs[i]) }))
    .filter((r) => r.sim > 0.12)
    .sort((a, b) => b.sim - a.sim)
    .slice(0, limit || 5)
    .map((r) => ({ ...r.item, similarity: Number(r.sim.toFixed(3)) }));
}

module.exports = { tokenize, tf, idf, vec, cosine, clusterBallots, buildIndex, search, topTerms, stanceScore };
