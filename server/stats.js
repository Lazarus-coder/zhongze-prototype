const crypto = require('node:crypto');

function laplace(b) {
  const u = crypto.randomBytes(4).readUInt32BE(0) / 4294967296 - 0.5;
  return -b * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
}

function tally(ballots) {
  const byOption = new Map();
  for (const b of ballots) {
    const cur = byOption.get(b.option_key) || { raw: 0, weighted: 0, confidence: 0, experienced: 0, adopted: 0 };
    cur.raw += 1;
    cur.weighted += b.weight || 1;
    cur.confidence += b.confidence || 0;
    if ((b.experience_claim || []).length) cur.experienced += 1;
    if (b.adopted) cur.adopted += 1;
    byOption.set(b.option_key, cur);
  }
  const totalRaw = ballots.length;
  const totalWeighted = [...byOption.values()].reduce((s, v) => s + v.weighted, 0) || 1;
  return [...byOption.entries()].map(([key, v]) => ({
    option_key: key,
    raw: v.raw,
    raw_share: totalRaw ? Number((v.raw / totalRaw).toFixed(3)) : 0,
    weighted: Number(v.weighted.toFixed(2)),
    weighted_share: Number((v.weighted / totalWeighted).toFixed(3)),
    avg_confidence: v.raw ? Math.round(v.confidence / v.raw) : 0,
    experienced: v.experienced,
    adopted: v.adopted,
  })).sort((a, b) => b.weighted - a.weighted);
}

function polarization(rows) {
  const total = rows.reduce((s, r) => s + r.weighted, 0) || 1;
  const ps = rows.map((r) => r.weighted / total).filter((p) => p > 0);
  const H = -ps.reduce((s, p) => s + p * Math.log(p), 0);
  const Hmax = ps.length > 1 ? Math.log(ps.length) : 1;
  const sorted = [...ps].sort((a, b) => b - a);
  const margin = sorted.length > 1 ? sorted[0] - sorted[1] : 1;
  return { entropy_norm: Number((H / (Hmax || 1)).toFixed(3)), margin: Number(margin.toFixed(3)), index: Number((0.5 * (H / (Hmax || 1)) + 0.5 * (1 - Math.min(1, margin * 2))).toFixed(3)) };
}

function wilson(hits, total, z) {
  if (!total) return { low: 0, high: 1 };
  const zz = z || 1.96;
  const phat = hits / total;
  const denom = 1 + (zz * zz) / total;
  const centre = (phat + (zz * zz) / (2 * total)) / denom;
  const margin = (zz * Math.sqrt((phat * (1 - phat) + (zz * zz) / (4 * total)) / total)) / denom;
  return { low: Number(Math.max(0, centre - margin).toFixed(3)), high: Number(Math.min(1, centre + margin).toFixed(3)) };
}

function slice(ballots, personas, dimKey, kMin, epsilon) {
  const k = kMin || 8;
  const eps = epsilon || 1;
  const buckets = new Map();
  let suppressed = 0;
  for (const b of ballots) {
    const p = personas[b.voter_pid];
    const value = p ? (p.attributes[dimKey] || '未知') : '未知';
    if (!buckets.has(value)) buckets.set(value, new Map());
    const inner = buckets.get(value);
    inner.set(b.option_key, (inner.get(b.option_key) || 0) + 1);
  }
  const out = [];
  const bScale = 1 / eps;
  for (const [value, inner] of buckets) {
    const n = [...inner.values()].reduce((s, v) => s + v, 0);
    if (n < k) {
      suppressed += n;
      continue;
    }
    const counts = {};
    let noisyTotal = 0;
    for (const [opt, c] of inner) {
      const nc = Math.max(0, Math.round(c + laplace(bScale)));
      counts[opt] = nc;
      noisyTotal += nc;
    }
    if (noisyTotal < k) {
      suppressed += n;
      continue;
    }
    out.push({
      value,
      n_reported: noisyTotal,
      k_anonymous: true,
      shares: Object.fromEntries(Object.entries(counts).map(([o, c]) => [o, noisyTotal ? Number((c / noisyTotal).toFixed(2)) : 0])),
      counts,
    });
  }
  out.sort((a, b) => b.n_reported - a.n_reported);
  return { dim: dimKey, k_min: k, epsilon: eps, buckets: out, suppressed_n: suppressed, note: `小于 ${k} 人的分组已合并并加入统计噪声，避免通过投票分布反推个人身份。` };
}

function axisMatrix(ballots, axes, options) {
  const acc = new Map();
  for (const b of ballots) {
    if (!b.axis_scores) continue;
    for (const [optKey, scores] of Object.entries(b.axis_scores)) {
      if (!acc.has(optKey)) acc.set(optKey, new Map());
      const inner = acc.get(optKey);
      for (const [axe, value] of Object.entries(scores)) {
        const cur = inner.get(axe) || { n: 0, sum: 0, sq: 0 };
        cur.n += 1;
        cur.sum += value;
        cur.sq += value * value;
        inner.set(axe, cur);
      }
    }
  }
  const matrix = {};
  for (const opt of options) {
    const inner = acc.get(opt.key) || new Map();
    matrix[opt.key] = {};
    for (const axe of axes) {
      const cur = inner.get(axe.id);
      if (!cur || !cur.n) {
        matrix[opt.key][axe.id] = { mean: null, n: 0, sd: 0 };
        continue;
      }
      const mean = cur.sum / cur.n;
      const variance = Math.max(0, cur.sq / cur.n - mean * mean);
      matrix[opt.key][axe.id] = { mean: Number(mean.toFixed(2)), n: cur.n, sd: Number(Math.sqrt(variance).toFixed(2)) };
    }
  }
  return matrix;
}

function utility(matrix, weights, options) {
  return options.map((opt) => {
    let total = 0;
    let wsum = 0;
    const detail = {};
    for (const [axeId, w] of Object.entries(weights)) {
      const cell = (matrix[opt.key] || {})[axeId];
      if (!cell || cell.mean === null) continue;
      total += cell.mean * w;
      wsum += w;
      detail[axeId] = Number((cell.mean * w).toFixed(2));
    }
    return { option_key: opt.key, label: opt.label, utility: wsum ? Number((total / wsum).toFixed(2)) : 0, detail };
  }).sort((a, b) => b.utility - a.utility);
}

function flipSensitivity(matrix, baseWeights, options, axes) {
  const baseWinner = utility(matrix, baseWeights, options)[0];
  const steps = [];
  for (const axe of axes) {
    let flipAt = null;
    let direction = null;
    for (let w = (baseWeights[axe.id] || 1) + 0.2; w <= 12; w += 0.2) {
      const weights = { ...baseWeights, [axe.id]: Number(w.toFixed(2)) };
      if (utility(matrix, weights, options)[0].option_key !== baseWinner.option_key) {
        flipAt = Number(w.toFixed(2));
        direction = 'up';
        break;
      }
    }
    if (flipAt === null) {
      for (let w = (baseWeights[axe.id] || 1) - 0.2; w >= 0; w -= 0.2) {
        const weights = { ...baseWeights, [axe.id]: Number(Math.max(0, w).toFixed(2)) };
        if (utility(matrix, weights, options)[0].option_key !== baseWinner.option_key) {
          flipAt = Number(Math.max(0, w).toFixed(2));
          direction = 'down';
          break;
        }
      }
    }
    steps.push({
      axis_id: axe.id,
      axis_label: axe.label,
      base_weight: Number((baseWeights[axe.id] || 1).toFixed(2)),
      flip_weight: flipAt,
      direction,
      robust: flipAt === null,
    });
  }
  return steps.sort((a, b) => (a.robust === b.robust ? 0 : a.robust ? 1 : -1));
}

function weightExplain(ballots, personas) {
  const factors = new Map();
  for (const b of ballots) {
    for (const [key, value] of Object.entries(b.weight_components || {})) {
      const cur = factors.get(key) || { n: 0, sum: 0 };
      cur.n += 1;
      cur.sum += value;
      factors.set(key, cur);
    }
  }
  return [...factors.entries()].map(([key, v]) => ({ factor: key, n: v.n, avg_multiplier: Number((v.sum / v.n).toFixed(2)) })).sort((a, b) => b.n - a.n);
}

function memo(dilemma, ballots, personas) {
  const rows = tally(ballots);
  const pol = polarization(rows);
  const total = ballots.length;
  const leader = rows[0];
  const interval = total ? wilson(leader.raw, total) : { low: 0, high: 1 };
  const experienced = ballots.filter((b) => (b.experience_claim || []).length).length;
  const due = dilemma.decision_due_at || dilemma.expires_at;
  const hoursLeft = Math.max(0, Math.round((due - Date.now()) / 3600000));
  let verdict;
  if (!leader || leader.raw < 8) verdict = '样本不足，先补齐情境再判断';
  else if (pol.index > 0.62) verdict = '群体本身高度分裂，说明这不是"对错"问题而是"偏好权重"问题';
  else if (interval.low >= 0.5) verdict = '群体一致偏向一个选项';
  else verdict = '多数偏向一个选项，但优势在统计误差边缘';
  return {
    dilemma_id: dilemma.id,
    generated_at: Date.now(),
    n: total,
    leader: leader ? { option_key: leader.option_key, label: leader.option_label, weighted_share: leader.weighted_share, raw_share: leader.raw_share } : null,
    ci95: interval,
    polarization: pol,
    experienced_share: total ? Number((experienced / total).toFixed(2)) : 0,
    hours_left: hoursLeft,
    verdict,
    cautions: buildCautions(dilemma, rows, total, pol),
    rows,
  };
}

function buildCautions(dilemma, rows, total, pol) {
  const out = [];
  if (total < 20) out.push('投票人数偏少，结论会随少量新票明显移动。');
  if (pol.index > 0.6) out.push('正反方都提出了有力论据，请重点看权重滑块如何改变结论。');
  if (dilemma.moderation && dilemma.moderation.level === 'regulated') out.push('本议题涉及医疗/法律/财务专业判断，群聊结果不构成专业建议。');
  const spread = rows.length ? rows[0].weighted_share - rows[rows.length - 1].weighted_share : 0;
  if (spread > 0.5) out.push('选项间差距很大，可能有发帖人未写出的约束条件。');
  out.push('陌生人不知道你的隐性约束（家庭、健康、现金流），把"必须"和"想要"分开再决定。');
  return out;
}

module.exports = { tally, polarization, wilson, slice, axisMatrix, utility, flipSensitivity, weightExplain, memo, laplace };
