const { mulberry32 } = require('./identity');
const { DETAILS } = require('./seed');
const { AXE_LIBRARY } = require('./taxonomy');

const rnd = mulberry32(777001);
const pick = (arr) => arr[Math.floor(rnd() * arr.length) % arr.length];

function axisLabel(dilemma) {
  const axes = (dilemma.axes || []).map((a) => a.id);
  return AXE_LIBRARY[pick(axes)] ? AXE_LIBRARY[pick(axes)].label : '整体';
}

function synthesize(dilemma, optionKey) {
  const chosen = dilemma.options.find((o) => o.key === optionKey) || dilemma.options[0];
  const other = dilemma.options.find((o) => o.key !== optionKey);
  const axe = axisLabel(dilemma);
  const templates = [
    `选「${chosen.label}」。你写的情境里 ${axe} 这一项它是明显占优的，${pick(DETAILS)}。`,
    `我站「${chosen.label}」。${other ? `「${other.label}」的问题在于把风险留给了以后的你，` : ''}${pick(DETAILS)}。`,
    `先别管票多少，问自己一个问题：一年后你会后悔没选「${chosen.label}」吗？我的答案是会，${pick(DETAILS)}。`,
    `${axe} 这项权重你至少要给到 8 分，按这个算就该选「${chosen.label}」，${pick(DETAILS)}。`,
    `投「${chosen.label}」，但补一个前提：${pick(['先把合同/条款里的退出机制看一遍', '给对方一个书面时间点', '把最坏情况写在一页纸上再签', '先做一次体检或预算复核'])}，做不到就反过来选。`,
  ];
  return pick(templates);
}

function axisScores(dilemma, optionKey) {
  const out = {};
  for (const o of dilemma.options) {
    const row = {};
    for (const a of dilemma.axes || []) {
      const base = o.key === optionKey ? 6 + rnd() * 4 : 3 + rnd() * 4.5;
      row[a.id] = Math.round(base);
    }
    out[o.key] = row;
  }
  return out;
}

function start(store, opts) {
  const interval = (opts && opts.interval) || 3800;
  const timer = setInterval(() => {
    const open = Object.values(store.db.dilemmas).filter((d) => d.status === 'open');
    if (!open.length) return;
    const target = open[Math.floor(rnd() * open.length)];
    const n = 1 + Math.floor(rnd() * 2);
    for (let i = 0; i < n; i += 1) {
      const pool = Object.values(store.db.personas).filter((p) => p.pid !== target.author_pid && !store.ballotsOf(target.id).some((b) => b.voter_pid === p.pid));
      if (!pool.length) return;
      const voter = pick(pool);
      const key = rnd() < 0.5 ? target.options[0].key : (target.options[1] || target.options[0]).key;
      store.addBallot(target, {
        voter_pid: voter.pid,
        option_key: key,
        reason: synthesize(target, key),
        confidence: 45 + Math.floor(rnd() * 50),
        axis_scores: target.axes && target.axes.length ? axisScores(target, key) : null,
        experience_claim: rnd() < 0.3 ? [target.tags[0]] : [],
      });
    }
  }, interval);
  if (timer.unref) timer.unref();
  return () => clearInterval(timer);
}

module.exports = { start, synthesize };
