const crypto = require('node:crypto');

const ADJECTIVES = ['晚点的', '沉默的', '爱笑的', '谨慎的', '值夜的', '北上的', '缺觉的', '克制的', '爱问的', '慢热的', '倔强的', '爱算账的', '失眠的', '爱爬山的', '抠细节的', '温柔的', '想多的', '爱走神的'];
const NOUNS = ['银杏', '夜班公交', '盐汽水瓶', '折耳猫', '第三杯咖啡', '候补车票', '绿皮火车', '台历', '便利贴', '保温杯', '风铃', '共享雨伞', '泡面', '行李箱', '多肉', '老式手机', '草稿纸', '指北针'];
const AGE_BANDS = ['18-22', '23-28', '29-35', '36-45', '46+'];
const REGIONS = ['华东', '华北', '华南', '华中', '西南', '西北', '东北', '海外'];
const INDUSTRIES = ['互联网', '制造', '金融', '体制内', '教育', '医疗', '自由职业', '学生'];

function hmac(key, input) {
  return crypto.createHmac('sha256', key).update(input).digest('hex');
}

function newKeyRing() {
  return { current: crypto.randomBytes(32).toString('hex'), previous: null, version: 1 };
}

function rotateKeyRing(ring) {
  return { current: crypto.randomBytes(32).toString('hex'), previous: ring.current, version: ring.version + 1 };
}

function derivePersonaId(ring, seed) {
  return 'p_' + hmac(ring.current, 'persona:' + seed).slice(0, 14);
}

function resolvePersonaId(ring, seed) {
  const now = derivePersonaId(ring, seed);
  if (ring.previous && hmac(ring.previous, 'persona:' + seed).slice(0, 14) === now) return now;
  return now;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function handleFrom(rnd) {
  const pick = (arr) => arr[Math.floor(rnd() * arr.length) % arr.length];
  return pick(ADJECTIVES) + pick(NOUNS) + '#' + String(1000 + Math.floor(rnd() * 8999));
}

function avatarFrom(rnd) {
  const hue = Math.floor(rnd() * 360);
  const second = (hue + 40 + Math.floor(rnd() * 120)) % 360;
  return { hue, second, glyph: String.fromCharCode(0x4e00 + Math.floor(rnd() * 0x5000)) };
}

function createPersona(ring, seedStr, rndSource) {
  const rnd = rndSource || mulberry32(Math.floor(Math.random() * 1e9));
  const seed = seedStr || crypto.randomBytes(12).toString('hex');
  return {
    pid: derivePersonaId(ring, seed),
    seed,
    handle: handleFrom(rnd),
    avatar: avatarFrom(rnd),
    joined_at: Date.now(),
    attributes: {
      gender: ['女', '男', '其他', '不愿透露'][Math.floor(rnd() * 4)],
      age_band: AGE_BANDS[Math.floor(rnd() * AGE_BANDS.length)],
      region: REGIONS[Math.floor(rnd() * REGIONS.length)],
      industry: INDUSTRIES[Math.floor(rnd() * INDUSTRIES.length)],
      marital: ['单身', '恋爱中', '已婚', '离异'][Math.floor(rnd() * 4)],
    },
    declared_tags: [],
    declared_experience: [],
    credibility: 1,
    device: 'd_' + Math.floor(rnd() * 400),
    karma: 0,
    badges: [],
  };
}

function coarseRegion(region) {
  return region || '未知大区';
}

function fuzzTimestamp(ts, now) {
  const skew = Math.floor((ts % 900000) / 60000);
  const shifted = ts - skew * 60000;
  const label = new Date(shifted).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  return { label, exact: false, now: now - ts };
}

module.exports = { newKeyRing, rotateKeyRing, derivePersonaId, resolvePersonaId, mulberry32, createPersona, handleFrom, avatarFrom, coarseRegion, fuzzTimestamp, AGE_BANDS, REGIONS, INDUSTRIES };
