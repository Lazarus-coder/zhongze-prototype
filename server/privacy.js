const DETECTORS = [
  { id: 'phone', label: '手机号', severity: 'high', re: /(?<!\d)1[3-9]\d{9}(?!\d)/g, mask: '【已隐去手机号】' },
  { id: 'id_card', label: '身份证号', severity: 'high', re: /(?<!\d)\d{17}[\dXx](?!\d)/g, mask: '【已隐去证件号】' },
  { id: 'email', label: '邮箱', severity: 'high', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, mask: '【已隐去邮箱】' },
  { id: 'im_account', label: '社交账号引流', severity: 'high', re: /(微信|weixin|wx|vx|v信|QQ|q群|telegram|tg)\s*[:：]?\s*[A-Za-z0-9_-]{4,}/g, mask: '【已隐去账号】' },
  { id: 'url', label: '外链', severity: 'medium', re: /https?:\/\/[^\s，。,]+/g, mask: '【已隐去链接】' },
  { id: 'address', label: '门牌级地址', severity: 'high', re: /[\u4e00-\u9fa5]{2,8}(?:路|街|道|巷)\s*\d{1,4}\s*号(?:\s*\d{1,3}\s*[栋号楼])?(?:\s*\d{1,4}\s*[室房])?/g, mask: '【已隐去地址】' },
  { id: 'plate', label: '车牌', severity: 'high', re: /[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼使领][A-HJ-NP-Z]·?\d{5}/g, mask: '【已隐去车牌】' },
  { id: 'full_name', label: '真实姓名指向', severity: 'high', re: /(?:我叫|姓名是|全名|同事|领导|室友|男友|女友|老公|老婆|他叫|她叫)[\u4e00-\u9fa5]{2,4}(?=先生|女士|哥|姐|总|经理)?/g, mask: '【已改为称谓】', advice: '用"某位同事/伴侣"代替具体姓名或称呼' },
  { id: 'company', label: '具体公司名', severity: 'medium', re: /[\u4e00-\u9fa5A-Za-z]{2,10}(?:科技|集团|公司|事务所|银行|证券|研究院|事业部)(?!名)/g, mask: '【行业化表述】', advice: '可改为"某大厂/某股份制行"，避免被同事认出' },
  { id: 'school', label: '具体学校名', severity: 'medium', re: /[\u4e00-\u9fa5]{2,10}(?:大学|学院|附中|中学|小学)(?:[\u4e00-\u9fa5]{0,6}(?:系|专业))?/g, mask: '【层次化表述】', advice: '可改为"985/双非/省内一本"，保留决策相关信息' },
  { id: 'exact_date', label: '精确日期', severity: 'low', re: /\d{4}年\d{1,2}月\d{1,2}日/g, mask: '【月份】', advice: '精确到月份通常已足够支撑判断' },
  { id: 'exact_money', label: '精确金额', severity: 'low', re: /(?<!\d)\d+(?:\.\d+)?\s*(?:万|w|k|千|元|块)(?!\d)/gi, mask: '【金额区间】', advice: '换成区间（如 25-30w）可降低识别度且不影响建议质量' },
  { id: 'medical_record', label: '病历/报告编号', severity: 'high', re: /(?:病历号|住院号|报告号|检查号)\s*[:：]?\s*[A-Za-z0-9-]{4,}/g, mask: '【已隐去编号】' },
  { id: 'coords', label: '经纬度坐标', severity: 'high', re: /[-+]?\d{2,3}\.\d{4,}[,，]\s*[-+]?\d{2,3}\.\d{4,}/g, mask: '【已隐去坐标】' },
];

const HARD_BLOCK_HINTS = [
  { id: 'doxxing', label: '曝光他人隐私', re: /(她的名字是|地址在|工牌|入职照|实名举报她|人肉|扒出)/g },
  { id: 'transaction', label: '交易引流', re: /(代下单|返现|佣金|加微信详聊|内部渠道价)/g },
];

function scan(text) {
  const findings = [];
  for (const d of DETECTORS) {
    d.re.lastIndex = 0;
    const hits = [];
    let m;
    while ((m = d.re.exec(text)) !== null) {
      hits.push({ start: m.index, end: m.index + m[0].length, value: m[0] });
      if (m[0].length === 0) d.re.lastIndex += 1;
      if (hits.length > 12) break;
    }
    if (hits.length) {
      findings.push({ id: d.id, label: d.label, severity: d.severity, count: hits.length, hits, advice: d.advice || defaultAdvice(d) });
    }
  }
  for (const h of HARD_BLOCK_HINTS) {
    h.re.lastIndex = 0;
    if (h.re.test(text)) findings.push({ id: h.id, label: h.label, severity: 'blocking', count: 1, hits: [], advice: '该内容会让当事人或第三方被定位，发布前请删除。' });
  }
  const risk = scoreRisk(findings);
  return { findings, risk, autoMasked: mask(text, findings.filter((f) => f.severity === 'high')) };
}

function defaultAdvice(d) {
  if (d.severity === 'high') return '此项可直接定位到你或他人，建议隐去。';
  return '保留决策所需的相对信息即可。';
}

function scoreRisk(findings) {
  let s = 0;
  for (const f of findings) {
    if (f.severity === 'blocking') s += 60;
    else if (f.severity === 'high') s += 25 * Math.min(f.count, 3);
    else if (f.severity === 'medium') s += 10 * Math.min(f.count, 3);
    else s += 3 * Math.min(f.count, 3);
  }
  return Math.min(100, s);
}

function mask(text, findings) {
  let out = text;
  const all = [];
  for (const f of findings) {
    const det = DETECTORS.find((d) => d.id === f.id);
    if (!det) continue;
    for (const h of f.hits) all.push({ ...h, mask: det.mask });
  }
  all.sort((a, b) => b.start - a.start);
  for (const h of all) out = out.slice(0, h.start) + h.mask + out.slice(h.end);
  return out;
}

function maskByTypes(text, ids) {
  const src = String(text || '');
  const findings = [];
  for (const id of ids) {
    const det = DETECTORS.find((d) => d.id === id);
    if (!det) continue;
    det.re.lastIndex = 0;
    const hits = [];
    let m;
    while ((m = det.re.exec(text)) !== null) {
      hits.push({ start: m.index, end: m.index + m[0].length });
      if (m[0].length === 0) det.re.lastIndex += 1;
    }
    if (hits.length) findings.push({ id, severity: det.severity, hits });
  }
  return mask(src, findings);
}

module.exports = { DETECTORS, scan, mask, maskByTypes, scoreRisk };
