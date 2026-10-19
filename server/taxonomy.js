const TAGS = [
  { id: 'shopping', label: '购物', parent: null, advice: 'standard' },
  { id: 'shopping.digital', label: '数码 3C', parent: 'shopping', advice: 'standard' },
  { id: 'shopping.appliance', label: '家电家居', parent: 'shopping', advice: 'standard' },
  { id: 'shopping.durable', label: '大件耐用品', parent: 'shopping', advice: 'standard' },

  { id: 'career', label: '求职', parent: null, advice: 'standard' },
  { id: 'career.offer', label: 'Offer 抉择', parent: 'career', advice: 'standard' },
  { id: 'career.switch', label: '转行换赛道', parent: 'career', advice: 'standard' },
  { id: 'career.timing', label: '跳槽与晋升', parent: 'career', advice: 'standard' },

  { id: 'relationship', label: '情感', parent: null, advice: 'standard', crisisSensitive: true },
  { id: 'relationship.commit', label: '婚恋推进', parent: 'relationship', advice: 'standard', crisisSensitive: true },
  { id: 'relationship.end', label: '关系结束', parent: 'relationship', advice: 'standard', crisisSensitive: true },
  { id: 'relationship.family', label: '家庭关系', parent: 'relationship', advice: 'standard', crisisSensitive: true },

  { id: 'education', label: '升学', parent: null, advice: 'standard' },
  { id: 'education.postgrad', label: '考研保研留学', parent: 'education', advice: 'standard' },
  { id: 'education.college', label: '志愿与专业', parent: 'education', advice: 'standard' },
  { id: 'education.adult', label: '在职进修', parent: 'education', advice: 'standard' },

  { id: 'life', label: '生活', parent: null, advice: 'standard' },
  { id: 'life.move', label: '城市与居住', parent: 'life', advice: 'standard' },
  { id: 'life.health', label: '健康就医', parent: 'life', advice: 'regulated', crisisSensitive: true },
  { id: 'life.money', label: '财务配置', parent: 'life', advice: 'regulated' },
  { id: 'life.legal', label: '法律纠纷', parent: 'life', advice: 'regulated' },
  { id: 'life.careerstudy', label: '工作生活平衡', parent: 'life', advice: 'standard' },
];

const BY_ID = new Map(TAGS.map((t) => [t.id, t]));

const AXE_LIBRARY = {
  money: { id: 'money', label: '现金收入', hint: '未来 2 年到手的钱' },
  stability: { id: 'stability', label: '稳定性', hint: '失业/变动风险' },
  growth: { id: 'growth', label: '成长速度', hint: '能力与履历增值' },
  wellbeing: { id: 'wellbeing', label: '健康与时薪', hint: '身体、可支配时间' },
  relation: { id: 'relation', label: '家庭与关系', hint: '亲密关系、父母、伴侣' },
  resale: { id: 'resale', label: '残值与退路', hint: '万一后悔的成本' },
  joy: { id: 'joy', label: '日常幸福感', hint: '每天体感' },
  risk: { id: 'risk', label: '不可逆风险', hint: '最坏情况的可恢复性' },
};

const EXPERIENCE_ATTRIBUTES = [
  { id: 'gender', label: '性别', options: ['女', '男', '其他', '不愿透露'] },
  { id: 'age_band', label: '年龄段', options: ['18-22', '23-28', '29-35', '36-45', '46+'] },
  { id: 'region', label: '所在大区', options: ['华东', '华北', '华南', '华中', '西南', '西北', '东北', '海外'] },
  { id: 'industry', label: '行业', options: ['互联网', '制造', '金融', '体制内', '教育', '医疗', '自由职业', '学生'] },
  { id: 'marital', label: '婚恋状态', options: ['单身', '恋爱中', '已婚', '离异'] },
  { id: 'had_choice', label: '经历过同一抉择', options: ['是', '否'] },
];

const EXPERIENCE_BY_ID = new Map(EXPERIENCE_ATTRIBUTES.map((a) => [a.id, a]));

function ancestry(tagId) {
  const chain = [];
  let cur = BY_ID.get(tagId);
  while (cur) {
    chain.push(cur.id);
    cur = cur.parent ? BY_ID.get(cur.parent) : null;
  }
  return chain;
}

function isLeaf(tagId) {
  return TAGS.every((t) => t.parent !== tagId);
}

function tracks() {
  return TAGS.filter((t) => t.parent === null).map((track) => ({
    ...track,
    children: TAGS.filter((t) => t.parent === track.id),
  }));
}

function advicePolicy(tagIds) {
  let policy = 'standard';
  for (const id of tagIds) {
    const tag = BY_ID.get(id);
    if (!tag) continue;
    if (tag.advice === 'regulated') policy = 'regulated';
  }
  return policy;
}

function crisisSensitive(tagIds) {
  return tagIds.some((id) => {
    const tag = BY_ID.get(id);
    return Boolean(tag && tag.crisisSensitive);
  });
}

module.exports = { TAGS, BY_ID, AXE_LIBRARY, EXPERIENCE_ATTRIBUTES, EXPERIENCE_BY_ID, ancestry, isLeaf, tracks, advicePolicy, crisisSensitive };
