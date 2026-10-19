const LEVELS = ['pass', 'needs_context', 'regulated', 'trial', 'crisis', 'reject'];

const LEXICON = {
  crisis: {
    label: '危机信号',
    words: ['不想活', '活不下去', '消失一段时间', '一了百了', '割腕', '吞药', '安眠药', '自杀', '结束自己', '没有意义了', '撑不下去', '跳下去'],
    action: 'quarantine_hold',
  },
  reject: {
    label: '红线违规',
    words: ['代投票返现', '拉票群', '包过', '内定', '博彩', '赌', '开房', '裸聊', '贷款中介', '起诉代理费分成', '水军', '控评'],
    action: 'block_publish',
  },
  trial: {
    label: '审判/猎巫倾向',
    words: ['该不该被开除', '让她丢工作', '网暴', '挂她', '曝光她', '荡妇', '封杀她', '社会性死亡', '人人喊打', '判她有罪', '活该'],
    action: 'rewrite_and_balance',
  },
  regulated: {
    label: '专业领域（医疗/法律/财务）',
    words: ['药', '剂量', '穿刺', '活检', '手术', '结节', 'CT', '核磁', '诊断', '起诉', '仲裁', '判', '合同违约', '赔偿', '股票', '基金', '期货', '加密', '杠杆', '房贷利率'],
    action: 'disclaimer_and_redact',
  },
  attack: {
    label: '人身攻击',
    words: ['傻逼', '滚', '贱', '脑残', '废物', '去死', '下头女', '普信', '活该被', '这种人也配'],
    action: 'suppress_ballot',
  },
  manipulation: {
    label: '情感操控/PUA 话术',
    words: ['你不配', '除了我没人要你', '你的价值就是', '听话就好', '别想太多照做', '这就是你的命'],
    action: 'suppress_ballot',
  },
};

const SPECIFIC_ADVICE = [
  { id: 'dosage', label: '具体用药剂量', re: /(每日|每天|一次)\s*\d+\s*(?:片|mg|毫克|ml|毫升)/g },
  { id: 'ticker', label: '具体标的', re: /[（(]?\d{6}[)）]?(?:股|代码)|买入价\s*\d+/g },
  { id: 'verdict', label: '法律结论式承诺', re: /(一定能赢|必判|稳赢|肯定不构成|百分之百胜诉)/g },
];

function matchLexicon(text, words) {
  const hits = [];
  for (const w of words) {
    if (text.includes(w)) hits.push(w);
  }
  return hits;
}

function classifyPost(dilemma) {
  const text = [dilemma.title, dilemma.situation, ...(dilemma.options || []).map((o) => o.label + ' ' + (o.desc || ''))].join('\n');
  const labels = [];
  const actions = [];
  let level = 'pass';

  const crisisHits = matchLexicon(text, LEXICON.crisis.words);
  if (crisisHits.length) {
    level = 'crisis';
    labels.push({ id: 'crisis', label: LEXICON.crisis.label, hits: crisisHits, confidence: 0.94 });
    actions.push('quarantine_hold', 'insert_hotline_card', 'notify_human_review_priority', 'exclude_from_vote_pool');
  }

  const rejectHits = matchLexicon(text, LEXICON.reject.words);
  if (rejectHits.length && level !== 'crisis') {
    level = 'reject';
    labels.push({ id: 'reject', label: LEXICON.reject.label, hits: rejectHits, confidence: 0.88 });
    actions.push('block_publish', 'explain_rule_to_user');
  }

  const trialHits = matchLexicon(text, LEXICON.trial.words);
  if (trialHits.length && LEVELS.indexOf(level) < LEVELS.indexOf('trial')) {
    level = 'trial';
    labels.push({ id: 'trial', label: LEXICON.trial.label, hits: trialHits, confidence: 0.8 });
    actions.push('rewrite_title_to_choice', 'require_both_side_context', 'disable_personal_attack_ballots');
  }

  const regulatedHits = matchLexicon(text, LEXICON.regulated.words);
  const tagRegulated = (dilemma.tags || []).some((t) => String(t).startsWith('life.health') || String(t).startsWith('life.legal') || String(t).startsWith('life.money'));
  if ((regulatedHits.length >= 2 || tagRegulated) && LEVELS.indexOf(level) < LEVELS.indexOf('regulated')) {
    level = 'regulated';
    labels.push({ id: 'regulated', label: LEXICON.regulated.label, hits: regulatedHits, confidence: 0.75 });
    actions.push('attach_disclaimer', 'redact_specific_advice', 'pin_evidence_sources');
  }

  const thin = (dilemma.situation || '').length < 40 || (dilemma.options || []).length < 2;
  if (thin && level === 'pass') {
    level = 'needs_context';
    labels.push({ id: 'thin', label: '决策上下文不足', hits: [], confidence: 0.6 });
    actions.push('prompt_missing_fields');
  }

  return { level, labels, actions: [...new Set(actions)], rationale: buildRationale(labels), review: level === 'crisis' || level === 'reject' ? 'required' : 'sampled' };
}

function classifyBallot(ballot, dilemma) {
  const text = ballot.reason || '';
  const labels = [];
  const actions = [];
  let weight_factor = 1;

  const attack = matchLexicon(text, LEXICON.attack.words);
  if (attack.length) {
    labels.push({ id: 'attack', label: LEXICON.attack.label, hits: attack, confidence: 0.9 });
    actions.push('suppress_ballot');
    weight_factor = 0;
  }
  const manipulation = matchLexicon(text, LEXICON.manipulation.words);
  if (manipulation.length) {
    labels.push({ id: 'manipulation', label: LEXICON.manipulation.label, hits: manipulation, confidence: 0.82 });
    actions.push('suppress_ballot', 'offer_reword_prompt');
    weight_factor = Math.min(weight_factor, 0.1);
  }
  if ((dilemma.moderation && dilemma.moderation.level === 'regulated') || (dilemma.tags || []).some((t) => String(t).startsWith('life.health') || String(t).startsWith('life.legal') || String(t).startsWith('life.money'))) {
    const hits = [];
    for (const s of SPECIFIC_ADVICE) {
      s.re.lastIndex = 0;
      if (s.re.test(text)) hits.push(s.label);
    }
    if (hits.length) {
      labels.push({ id: 'specific_advice', label: hits.join('、'), hits, confidence: 0.86 });
      actions.push('redact_specific_advice', 'attach_disclaimer');
      weight_factor = Math.min(weight_factor, 0.3);
    }
  }
  if ((ballot.reason || '').trim().length < 6) {
    labels.push({ id: 'low_effort', label: '低投入观点', hits: [], confidence: 0.5 });
    actions.push('demote_in_clustering');
    weight_factor = Math.min(weight_factor, 0.35);
  }
  return { labels, actions: [...new Set(actions)], weight_factor, suppressed: actions.includes('suppress_ballot') };
}

function anomalyReport(ballots, personaIndex) {
  const flags = [];
  const byDevice = new Map();
  for (const b of ballots) {
    const p = personaIndex[b.voter_pid];
    if (!p) continue;
    const key = b.dilemma_id + '|' + p.device;
    byDevice.set(key, (byDevice.get(key) || 0) + 1);
  }
  for (const [key, count] of byDevice) {
    if (count > 2) flags.push({ type: 'device_cluster', key, count, action: 'weight_decay', factor: 0.4 });
  }
  const byVoter = new Map();
  for (const b of ballots) {
    if (!byVoter.has(b.voter_pid)) byVoter.set(b.voter_pid, []);
    byVoter.get(b.voter_pid).push(b);
  }
  for (const [pid, list] of byVoter) {
    const dilemmas = new Set(list.map((b) => b.dilemma_id));
    if (dilemmas.size && list.length / dilemmas.size > 1.6) {
      flags.push({ type: 'stance_flip', pid, count: list.length, action: 'weight_decay', factor: 0.5 });
    }
  }
  return flags;
}

function buildRationale(labels) {
  return labels.map((l) => ({ label: l.label, evidence: l.hits.slice(0, 6), confidence: l.confidence }));
}

const RULES_DOC = [
  { level: 'crisis', title: '危机信号', public: '出现自伤/自杀相关表达时，帖子不进入投票池，先由人工与专业资源介入；你会收到支持热线卡片和一对一私信。', ops: 'SLA 5 分钟内人工接手，冻结推流但保留草稿，发帖人可主动恢复。' },
  { level: 'reject', title: '红线内容', public: '拉票返现、博彩、引流交易、色情与诈骗相关不进入社区，会向你说明触发词。', ops: '可申诉，二次由陪审团复核。' },
  { level: 'trial', title: '审判/猎巫', public: '我们把"要不要做某事"保留为选择，而不是"某个人该受什么惩罚"。标题会被改写为可决策形式，并关闭人身攻击投票。', ops: '改写需发帖人确认；第三方姓名一律隐去。' },
  { level: 'regulated', title: '医疗/法律/财务', public: '投票和建议照常进行，但强制标注"不构成专业建议"，具体剂量、标的与法律结论会被折叠。', ops: '折叠原因对用户可见，可申诉恢复。' },
  { level: 'needs_context', title: '上下文不足', public: '补齐情境和选项后，陌生人的建议质量会显著提高，我们先请你补充两件事。', ops: '自动追问模板，非强制。' },
];

module.exports = { LEVELS, LEXICON, classifyPost, classifyBallot, anomalyReport, RULES_DOC, SPECIFIC_ADVICE };
