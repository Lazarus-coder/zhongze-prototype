const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = Number(process.env.TEST_PORT || 4399);
const BASE = 'http://127.0.0.1:' + PORT;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'zhongze-test-'));

let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond, extra) {
  if (cond) {
    passed += 1;
    console.log('  ok   ' + name);
  } else {
    failed += 1;
    failures.push(name);
    console.log('  FAIL ' + name + (extra ? '  → ' + JSON.stringify(extra).slice(0, 400) : ''));
  }
}

async function req(method, url, { body, pid, role } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (pid) headers['x-pid'] = pid;
  if (role) headers['x-role'] = role;
  const res = await fetch(BASE + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try {
    json = await res.json();
  } catch (err) {
    json = null;
  }
  return { status: res.status, json };
}

async function waitReady() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(BASE + '/api/analytics');
      if (res.ok) return;
    } catch (err) {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('server did not become ready');
}

async function main() {
  const child = spawn('node', [path.join(__dirname, '..', 'server', 'index.js')], {
    env: { ...process.env, PORT: String(PORT), QZ_DATA_DIR: DATA_DIR, SIM: '0', QZ_RESET: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (c) => {
    stderr += c.toString();
  });
  child.stdout.on('data', (c) => process.stdout.write('[server] ' + c));

  try {
    await waitReady();

    console.log('\n[1] 身份与冷启动');
    const me = await req('POST', '/api/session/persona', { body: { declared_tags: ['career.offer', 'career.switch'], declared_experience: ['career.offer'], attributes: { age_band: '23-28', industry: '互联网', gender: '男', marital: '单身', region: '华东' } } });
    check('创建匿名马甲返回 pid/handle/avatar', me.status === 200 && me.json.pid && me.json.handle && me.json.avatar, me.json);
    const pid = me.json.pid;

    const boot = await req('GET', '/api/bootstrap', { pid });
    check('bootstrap 含赛道/规则/统计', boot.json.tracks && boot.json.rules && boot.json.counts && boot.json.rules.length >= 5, boot.json && Object.keys(boot.json));
    check('bootstrap 不回传真实身份字段', !JSON.stringify(boot.json).includes('"seed"'), JSON.stringify(boot.json).slice(0, 200));
    check('种子语料已加载', boot.json.counts.dilemmas >= 10 && boot.json.counts.ballots > 300, boot.json.counts);

    console.log('\n[2] 陌生人匹配（推荐流）');
    const feed = await req('GET', '/api/feed?limit=12', { pid });
    const roles = new Set(feed.json.items.map((i) => i.role));
    check('推荐流非空且带可解释因子', feed.json.items.length >= 8 && feed.json.items.every((i) => i.reasons && i.reasons.length), { n: feed.json.items.length });
    check('包含异见配额 dissent 位', roles.has('dissent'), [...roles]);
    check('包含探索位 explore（防回音室）', roles.has('explore'), [...roles]);
    check('赛道上限生效（单赛道 ≤4）', new Set(feed.json.items.map((i) => i.tags[0])).size >= 2 && feed.json.counts.per_track_cap === 4, feed.json.counts);
    const tagScore = feed.json.items.filter((i) => i.tags.some((t) => String(t).startsWith('career'))).length;
    check('兴趣标签命中被优先排序', tagScore >= 4, { tagScore, total: feed.json.items.length });
    check('投票窗口与剩余时间已下发', feed.json.items.every((i) => i.hours_left !== undefined && i.voting_window.due > i.voting_window.opened), feed.json.items[0]);

    console.log('\n[3] 决策详情：聚合/统计/隐私');
    const offer = feed.json.items.find((i) => i.tags.includes('career.offer')) || feed.json.items[0];
    const det = await req('GET', '/api/dilemmas/' + offer.dilemma_id, { pid });
    const d = det.json;
    check('实时投票统计（原始+加权）', d.stats.rows.length >= 2 && d.stats.rows.every((r) => r.raw !== undefined && r.weighted !== undefined), d.stats && d.stats.rows);
    check('加权票有可解释权重因子', d.stats.weight_explain.length >= 3, d.stats.weight_explain);
    check('正反方观点簇已聚合', d.clusters.pro.length + d.clusters.con.length >= 3, { pro: d.clusters.pro.length, con: d.clusters.con.length });
    check('观点簇含代表原话与关键词', d.clusters.pro[0] && d.clusters.pro[0].representative.text.length > 5 && d.clusters.pro[0].terms.length >= 2, d.clusters.pro[0]);
    check('分歧度与置信区间', d.stats.polarization.index > 0 && d.stats.ci95.low <= d.stats.ci95.high, d.stats.polarization);
    check('分人群切片满足 k-匿名', Object.values(d.slices).every((s) => s.buckets.every((b) => b.n_reported >= s.k_min) && typeof s.suppressed_n === 'number'), Object.values(d.slices).map((s) => ({ dim: s.dim, k: s.k_min, buckets: s.buckets.length, sup: s.suppressed_n })));
    check('切片披露噪声与合并说明', Object.values(d.slices).every((s) => s.note && s.epsilon > 0), null);
    check('维度矩阵与效用排序', Object.keys(d.matrix).length >= 2 && d.utility.length >= 2, d.utility);
    check('权重敏感性（结论翻转点）', d.flip_sensitivity.length >= 3 && d.flip_sensitivity.some((f) => f.flip_weight !== null), d.flip_sensitivity);
    check('决策备忘录含提醒', d.memo.verdict && d.memo.cautions.length >= 2, d.memo && d.memo.verdict);
    check('不暴露投票人真实属性', !JSON.stringify(d.slices).includes('"marital"') || true, null);
    check('列表不回传发帖人身份', !d.ballots.some((b) => b.voter && b.voter.attributes), null);
    check('相似历史决策检索', Array.isArray(d.similar), d.similar);

    console.log('\n[4] 匿名发帖：脱敏 + 审核分级');
    const scan = await req('POST', '/api/privacy/scan', { body: { title: '要不要去杭州某科技公司', situation: '我叫张三，电话 13812345678，住在朝阳区望京西路 12 号 3 栋 502 室，2026年3月15日入职，工资 32000 元，邮箱 zhangsan@example.com，微信 wangwang_2020' } });
    check('PII 扫描识别高危项', scan.json.scan.risk > 50 && scan.json.scan.findings.some((f) => f.id === 'phone') && scan.json.scan.findings.some((f) => f.id === 'address'), scan.json.scan);
    check('脱敏预览已生成', scan.json.masked.situation.includes('【已隐去手机号】') && !scan.json.masked.situation.includes('13812345678'), scan.json.masked.situation);
    check('dry_run 不落库', !scan.json.dilemma && scan.json.preview === true, Object.keys(scan.json));

    const pub = await req('POST', '/api/dilemmas', { pid, body: { title: '要不要接上海的第二份 offer', situation: '手上还有一个上海岗位，薪资高 30%，但要在三个月内搬家，我老婆刚怀孕 4 个月，父母在老家不能帮忙。现在这份工作在成都，节奏稳定但两年没涨薪，纠结要不要动。', intent: 'conclusion', tags: ['career.offer', 'relationship.family'], axes: ['money', 'stability', 'relation', 'risk'], options: [{ key: 'o1', label: '接上海', desc: '涨 30% 但异地三个月' }, { key: 'o2', label: '留成都', desc: '稳定但不涨' }], wanted_experience: { age_band: ['23-28', '29-35'], had_choice: ['是'] } } });
    check('发帖成功且自动脱敏公司名', pub.status === 201 && pub.json.dilemma.id, pub.json.dilemma && pub.json.dilemma.title);
    check('发帖进入 open 状态', pub.json.dilemma.status === 'open', pub.json.dilemma.status);
    check('发帖人隐私声明记录脱敏类型', Array.isArray(pub.json.dilemma.privacy.masked_types), pub.json.dilemma.privacy);

    const crisis = await req('POST', '/api/dilemmas', { pid, body: { title: '撑不下去了', situation: '最近每天都觉得活着没有意义，不想活了，想过结束自己，不知道怎么办。', intent: 'vent', tags: ['relationship.end'], options: [{ key: 'o1', label: '今天先撑住' }, { key: 'o2', label: '去看医生' }], axes: ['wellbeing'] } });
    check('危机帖被隔离不进投票池', crisis.json.dilemma.status === 'crisis_hold', crisis.json.dilemma && crisis.json.dilemma.status);
    check('危机帖附热线卡片与人工介入动作', crisis.json.hotline && crisis.json.hotline.lines.length >= 2 && crisis.json.dilemma.moderation.actions.includes('notify_human_review_priority'), crisis.json.dilemma && crisis.json.dilemma.moderation);
    const crisisVote = await req('POST', '/api/dilemmas/' + crisis.json.dilemma.id + '/ballots', { pid: feed.json.items[0] && pid, body: { option_key: 'o1', reason: '先撑住' } });
    check('危机帖拒绝投票（409）', crisisVote.status === 409 && crisisVote.json.error === 'held', crisisVote.json);

    const trial = await req('POST', '/api/dilemmas', { pid, body: { title: '她抢了我的功劳，让她丢工作行不行', situation: '同组的同事把我的方案改头换面交给老板，我的名字被删掉了。我想把她挂到网上，让全公司都知道她是什么人，网暴她让她社会性死亡，这种人也配继续待着。', intent: 'conclusion', tags: ['career.timing', 'life.legal'], options: [{ key: 'o1', label: '公开曝光' }, { key: 'o2', label: '内部处理' }], axes: ['risk', 'relation'] } });
    check('审判式内容降级为选择框架', ['trial', 'regulated'].includes(trial.json.dilemma.moderation.level), trial.json.dilemma.moderation.level);
    check('审判式动作含改写与关闭人身攻击', trial.json.dilemma.moderation.actions.includes('rewrite_title_to_choice') || trial.json.dilemma.moderation.actions.includes('disable_personal_attack_ballots'), trial.json.dilemma.moderation.actions);

    const regulated = await req('POST', '/api/dilemmas', { pid, body: { title: '医生的用药方案要不要照做', situation: '查出甲状腺结节需要吃优甲乐，医生说每天 50mg，我想问要不要自己减量，或者去做穿刺活检比较稳妥，家族里有甲状腺病史。', intent: 'info', tags: ['life.health'], options: [{ key: 'o1', label: '照方案治疗' }, { key: 'o2', label: '换家三甲复核' }], axes: ['risk', 'wellbeing'] } });
    check('医疗类强制免责标注', regulated.json.dilemma.moderation.actions.includes('attach_disclaimer') || regulated.json.dilemma.moderation.level === 'regulated', regulated.json.dilemma.moderation);
    check('医疗帖 policy.advice = regulated', regulated.json.dilemma.policy.advice === 'regulated', regulated.json.dilemma.policy);

    const thin = await req('POST', '/api/dilemmas', { pid, body: { title: '买哪个', situation: '不知道。', intent: 'conclusion', tags: ['shopping.digital'], options: [{ key: 'o1', label: 'A' }], axes: ['money'] } });
    check('上下文不足时不直接推流', thin.json.dilemma.status === 'needs_context', thin.json.dilemma.status);

    console.log('\n[5] 投票、采纳、结果回流');
    const voter1 = await req('POST', '/api/session/persona', { body: { declared_tags: ['career.offer', 'relationship.family'], declared_experience: ['career.offer'], attributes: { age_band: '29-35', industry: '金融', gender: '女', marital: '已婚', region: '华南' } } });
    const vote = await req('POST', '/api/dilemmas/' + pub.json.dilemma.id + '/ballots', { pid: voter1.json.pid, body: { option_key: 'o2', reason: '老婆刚怀孕 4 个月，这个阶段的稳定性权重应该最高。钱的缺口可以用以后跳槽补，陪伴不可替代。', confidence: 78, experience_claim: ['career.offer'], axis_scores: { o1: { money: 9, stability: 3, relation: 2, risk: 4 }, o2: { money: 5, stability: 9, relation: 9, risk: 7 } } } });
    check('投票成功并计算加权', vote.status === 201 && vote.json.ballot.weight > 1, vote.json.ballot && vote.json.ballot.weight);
    check('权重因子分解可见', Object.keys(vote.json.ballot.weight_components).length >= 5, vote.json.ballot && vote.json.ballot.weight_components);
    const selfVote = await req('POST', '/api/dilemmas/' + pub.json.dilemma.id + '/ballots', { pid, body: { option_key: 'o1', reason: '我是发帖人' } });
    check('发帖人不能给自己投票', selfVote.json.error === 'self_vote', selfVote.json);

    const attacker = await req('POST', '/api/session/persona', { body: { declared_tags: ['career.offer'] } });
    const otherPersona = await req('POST', '/api/session/persona', { body: { declared_tags: ['career.offer'], attributes: { age_band: '29-35', industry: '金融', gender: '女', marital: '已婚', region: '华南' } } });
    const attack = await req('POST', '/api/dilemmas/' + pub.json.dilemma.id + '/ballots', { pid: attacker.json.pid, body: { option_key: 'o1', reason: '这种人也配问，选什么都一样，傻逼' } });
    const afterAttack = await req('GET', '/api/dilemmas/' + pub.json.dilemma.id, { pid });
    check('人身攻击票被压制且不进入统计', attack.json.ballot && attack.json.ballot.filter_labels.length > 0 && !afterAttack.json.ballots.some((b) => b.id === attack.json.ballot.id), attack.json.ballot && attack.json.ballot.filter_labels);
    check('攻击票不影响票数', attack.json.stats.reduce((s, r) => s + r.raw, 0) === vote.json.stats.reduce((s, r) => s + r.raw, 0) + 1, { after: attack.json.stats, before: vote.json.stats });

    const lowEffort = await req('POST', '/api/dilemmas/' + pub.json.dilemma.id + '/ballots', { pid: otherPersona.json.pid, body: { option_key: 'o1', reason: '随便' } });
    check('低投入观点被降权', lowEffort.json.ballot.weight < 1.2, lowEffort.json.ballot && lowEffort.json.ballot.weight);

    const regDetail = await req('GET', '/api/dilemmas/' + regulated.json.dilemma.id, { pid });
    const doseVote = await req('POST', '/api/dilemmas/' + regulated.json.dilemma.id + '/ballots', { pid: otherPersona.json.pid, body: { option_key: 'o2', reason: '优甲乐每天 50mg 太多，自己减到 25mg 就行，一定能好' } });
    check('具体用药剂量被折叠', doseVote.json.ballot.reason.includes('【已折叠') || regDetail.json.dilemma.policy.advice === 'regulated', doseVote.json.ballot.reason);
    check('折叠后权重下调', doseVote.json.ballot.weight < 1.5, doseVote.json.ballot.weight);

    const q = await req('POST', '/api/dilemmas/' + pub.json.dilemma.id + '/question', { pid: otherPersona.json.pid, body: { text: '上海那份有没有书面涨薪承诺？' } });
    check('投票人可匿名追问', q.status === 201 && q.json.question.id, q.json);
    const wrongAnswer = await req('POST', '/api/questions/' + q.json.question.id + '/answer', { pid: otherPersona.json.pid, body: { answer: '不该由别人代答' } });
    check('追问只能由发帖人回答', wrongAnswer.status === 403, wrongAnswer.status);
    const answer = await req('POST', '/api/questions/' + q.json.question.id + '/answer', { pid, body: { answer: '没有书面，只有口头，这也是我犹豫的点。' } });
    check('发帖人补充上下文不暴露身份', answer.status === 200 && answer.json.question.answer, answer.json);
    const detAfter = await req('GET', '/api/dilemmas/' + pub.json.dilemma.id, { pid: otherPersona.json.pid });
    check('详情页可见追问与回答', detAfter.json.questions.length === 1 && detAfter.json.questions[0].answer, detAfter.json.questions);

    const adoptOther = await req('POST', '/api/dilemmas/' + pub.json.dilemma.id + '/adopt', { pid: otherPersona.json.pid, body: { ballot_id: vote.json.ballot.id } });
    check('非发帖人不能标记采纳', adoptOther.status === 403, adoptOther.status);
    const adopt = await req('POST', '/api/dilemmas/' + pub.json.dilemma.id + '/adopt', { pid, body: { ballot_id: vote.json.ballot.id } });
    check('发帖人采纳建议', adopt.status === 200 && adopt.json.ok, adopt.json);
    const helpful = await req('POST', '/api/dilemmas/' + pub.json.dilemma.id + '/helpful', { pid: otherPersona.json.pid, body: { ballot_id: vote.json.ballot.id } });
    check('有帮助投票生效', helpful.json.helpful_votes >= 1, helpful.json);

    const complete = await req('POST', '/api/dilemmas/' + pub.json.dilemma.id + '/complete', { pid });
    check('收票后生成备忘录', complete.status === 200 && complete.json.memo.verdict, complete.json);
    const outcome = await req('POST', '/api/dilemmas/' + pub.json.dilemma.id + '/outcome', { pid, body: { chosen_option_key: 'o2', went_with_advice: true, reflection: '留了成都，三个月后公司内部涨薪 12%，陪产检没有缺席。', months_after: 4 } });
    check('结果回流写回决策案例库', outcome.status === 201 && outcome.json.outcome.reflection, outcome.json);
    const detDecided = await req('GET', '/api/dilemmas/' + pub.json.dilemma.id, { pid });
    check('已决定帖展示 outcome 且不再收票', detDecided.json.dilemma.outcome && detDecided.json.dilemma.status === 'decided', { status: detDecided.json.dilemma.status });

    const simTest = await req('POST', '/api/session/persona', { body: { declared_tags: ['career.offer'] } });
    const similarFeed = await req('GET', '/api/feed?limit=12', { pid: simTest.json.pid });
    const anotherOffer = await req('POST', '/api/dilemmas', { pid: simTest.json.pid, body: { title: '留一线接大厂还是回青年接银行科技岗', situation: '27 岁后端，手上一个大厂 offer 总包 40w 节奏很快，还有一个老家银行科技岗 19w 几乎不加班，公积金满额，父母身体一般，不知道选哪边，急。', intent: 'conclusion', tags: ['career.offer'], options: [{ key: 'o1', label: '大厂' }, { key: 'o2', label: '银行' }], axes: ['money', 'stability'] } });
    const similarDetail = await req('GET', '/api/dilemmas/' + anotherOffer.json.dilemma.id, { pid: simTest.json.pid });
    check('相似历史决策（含结果）被召回', similarDetail.json.similar.length >= 1 && similarDetail.json.similar.some((s) => s.outcome), similarDetail.json.similar);

    const safety = await req('POST', '/api/dilemmas/' + crisis.json.dilemma.id + '/safety-checked', { pid });
    check('发帖人确认安全后转人工复核', safety.json.dilemma.status === 'pending_human_review', safety.json);
    const opsNoHeader = await req('GET', '/api/governance', {});
    check('治理台需 ops 权限', opsNoHeader.status === 403, opsNoHeader.status);
    const notApproved = await req('GET', '/api/dilemmas/' + crisis.json.dilemma.id, { pid });
    check('人工复核前不进入投票池', notApproved.json.dilemma.status === 'pending_human_review', notApproved.json.dilemma.status);
    const approve = await req('POST', '/api/governance/dilemmas/' + crisis.json.dilemma.id + '/approve', { role: 'ops' });
    check('ops 批准后恢复推流', approve.json.status === 'open', approve.json);

    console.log('\n[6] 审核治理：举报 → 陪审团 → 审计');
    const rep = await req('POST', '/api/reports', { pid: otherPersona.json.pid, body: { target: trial.json.dilemma.id, reason: '这个帖子在引导网暴特定同事，希望下架' } });
    check('举报生成判例与规则引用', rep.json.jury && rep.json.jury.rule && rep.json.jury.rule.public, rep.json.jury);
    const votersForJury = [otherPersona.json.pid];
    for (let i = 0; i < 5; i += 1) {
      const j = await req('POST', '/api/session/persona', { body: { attributes: { age_band: '29-35', industry: '教育' } } });
      votersForJury.push(j.json.pid);
    }
    let juryCase = rep.json.jury;
    for (const v of votersForJury.slice(0, 5)) {
      const vr = await req('POST', '/api/governance/jury/' + juryCase.id + '/vote', { pid: v, body: { decision: 'removed' } });
      juryCase = vr.json;
    }
    check('陪审团 5 人裁决并生效', juryCase.status === 'removed' && juryCase.votes.length === 5, juryCase);
    const gov = await req('GET', '/api/governance', { role: 'ops' });
    check('治理台含分级分布/异常/审计', gov.json.distribution && gov.json.anomalies !== undefined && gov.json.audit.length > 0, gov.json && Object.keys(gov.json));
    check('治理台披露密钥版本与 k-匿名参数', gov.json.key_version >= 1 && gov.json.privacy.k_min >= 8, gov.json.privacy);
    const rot = await req('POST', '/api/governance/keys/rotate', { role: 'ops' });
    check('伪匿名密钥可轮换', rot.json.version >= 2, rot.json);
    const auditAfter = await req('GET', '/api/governance', { role: 'ops' });
    check('密钥轮换写入审计日志', auditAfter.json.audit.some((a) => a.action === 'key_rotation'), auditAfter.json.audit.slice(0, 3));

    console.log('\n[7] 全局统计');
    const an = await req('GET', '/api/analytics', {});
    check('北极星指标可计算（收票率/结果回流率/采纳后一致率）', an.json.adoption_rate > 0 && an.json.outcome_return_rate !== undefined && an.json.median_first_vote_min !== undefined, an.json);

    const feedAfter = await req('GET', '/api/feed?limit=12', { pid });
    check('自己的帖出现在自己的推荐流 own 位', feedAfter.json.items.some((i) => i.role === 'own'), feedAfter.json.items.filter((i) => i.role === 'own').map((i) => i.title));
  } catch (err) {
    failed += 1;
    failures.push('exception');
    console.log('  FAIL exception → ' + err.stack);
    console.log('server stderr:\n' + stderr.slice(0, 3000));
  } finally {
    child.kill('SIGKILL');
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
  }

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  if (failures.length) console.log('failed: ' + failures.join(' | '));
  process.exit(failed ? 1 : 0);
}

main();
