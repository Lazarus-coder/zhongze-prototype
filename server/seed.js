const { mulberry32 } = require('./identity');

const DETAILS = [
  '我这两年踩过同样的坑',
  '身边十几个同事的情况都差不多',
  '坐标二线，供参考',
  '仅供同年龄段参考',
  '我家里的阻力比这还大',
  '我和对象算过这笔账',
  '我上次选错了，现在还在还债',
  '说点难听但真实的',
  '别忽略合同里的细节',
  '这件事我后悔的是没早问',
  '我自己的取舍是另一回事',
  '把这条当成风险提示就好',
];

const DILEMMAS = [
  {
    key: 'offer',
    title: '留北京接大厂 offer，还是回家乡接银行科技岗',
    situation: '27 岁后端，手上一个北京大厂 offer（总包 42w，公积金按最低交，995 节奏），老家省会城商行科技岗（总包 19w，公积金满额，几乎不加班，但五年内涨薪封顶）。父母身体一般，老家有一套自住毛坯。签哪边？',
    intent: 'conclusion',
    tags: ['career.offer', 'career.switch'],
    axes: ['money', 'stability', 'growth', 'wellbeing', 'relation', 'risk'],
    options: [
      { key: 'o1', label: '接北京大厂', desc: '42w 总包，995，两年后跳槽溢价' },
      { key: 'o2', label: '接家乡银行科技岗', desc: '19w 总包，稳定，公积金满额' },
    ],
    profile: { o1: { money: 9, stability: 3, growth: 9, wellbeing: 2, relation: 3, risk: 5 }, o2: { money: 4, stability: 9, growth: 3, wellbeing: 8, relation: 8, risk: 3 } },
    bias: [{ when: { industry: '互联网' }, shift: 0.22 }, { when: { industry: '体制内' }, shift: -0.3 }, { when: { age_band: '36-45' }, shift: -0.18 }],
    n: 54,
    hours_ago: 9,
    due_hours: 14,
    wanted_experience: { age_band: ['23-28', '29-35'], industry: ['互联网', '金融', '体制内'], had_choice: ['是'] },
    exp_tag: 'career.offer',
    script: {
      o1: [
        '两年大厂履历在简历上是硬通货，回来再降维求职容易，反过来很难',
        '35 岁以前攒现金比攒稳定重要，你现在攒的是抗风险的钱',
        '城商行科技岗五年不涨薪，通胀一算等于降薪',
        '北京公积金最低交这条要先问清，能谈就谈，谈不了再决定',
        '你才 27，加班扛得住，扛不住的时候你还有转岗余地',
        '42w 攒两年是 40w 现金，比老家那份工资的任何涨幅都实在',
        '先去大平台，把技术栈和视野抬上去，回来时你是候选人不是求职者',
      ],
      o2: [
        '995 三年换来的钱，很大一部分要给身体和情绪买单',
        '城商行满额公积金加食堂加各种补贴，实际购买力差距没有账面那么大',
        '父母身体一般这条权重应该拉到最高，你不是一个人决策',
        '老家有房意味着生活成本几乎归零，19w 在省会能过得很从容',
        '银行科技岗真正的风险不是涨薪慢，是你三十五岁后离开不了这个体系',
        '稳定不是不涨，是涨得慢但几乎不掉，你算的是最坏情况',
        '先签银行，两年后如果后悔，从省会跳一线比从一线跳省会难得多，要想清楚',
      ],
    },
  },
  {
    key: 'laptop',
    title: '写代码偶尔剪片子：MacBook Air 15 还是万元档 Windows 全能本',
    situation: '自由职业前端，主要跑 Node + Docker + Figma，剪片是每月两三次的自媒体短片，4K 素材。预算 9000-11000。家里已经有 4K 显示器和外接硬盘。倾向轻，但怕剪片卡到想砸电脑。',
    intent: 'conclusion',
    tags: ['shopping.digital'],
    axes: ['money', 'resale', 'joy', 'wellbeing', 'growth'],
    options: [
      { key: 'o1', label: 'MacBook Air 15（16G+512G）', desc: '轻、静音、续航长，剪片靠代理' },
      { key: 'o2', label: 'Windows 全能本（RTX4060/32G）', desc: '剪片渲染快，可折腾，重且吵' },
    ],
    profile: { o1: { money: 6, resale: 8, joy: 8, wellbeing: 9, growth: 6 }, o2: { money: 8, resale: 5, joy: 6, wellbeing: 4, growth: 7 } },
    bias: [{ when: { industry: '互联网' }, shift: 0.18 }],
    n: 47,
    hours_ago: 20,
    due_hours: 40,
    wanted_experience: { had_choice: ['是'] },
    exp_tag: 'shopping.digital',
    script: {
      o1: [
        '前端日常 90% 时间在浏览器和终端，Air 的静音和续航比性能更重要',
        '剪片走代理流程完全够，Final Cut 和达芬奇在 Apple Silicon 上很顺',
        '16G 内存是底线，别为了省钱买 8G，一年后一定后悔',
        '二手保值率高，一年后换机亏得少',
        '外接显示器场景多，笔记本的屏幕素质其实没那么关键',
      ],
      o2: [
        '4K 素材多轨＋调色，独显渲染差距是几分钟和几十分钟的区别',
        '32G 内存加可扩展，Air 焊死内存是最大坑',
        '同样预算 Windows 能买到更好的 CPU 和显卡，性能密度更高',
        '但你得有心理准备：风扇声、续航腰斩、出差插电砖头',
        'Docker 在 Windows 上跑大项目内存开销比 Mac 明显',
        '别忽略重量，1.8kg 和 1.2kg 每天通勤差别很大',
      ],
    },
  },
  {
    key: 'longdistance',
    title: '异地两年，她要我辞职搬去她的城市，要不要签',
    situation: '我在杭州做算法，她在北京做医疗器械销售，异地两年。她拿到晋升不会走，让我辞职去北京。我手上只有一个杭州的 offer，北京需要重新找。在一起五年，见家长了，但没谈婚房。我 30，她 29。',
    intent: 'conclusion',
    tags: ['relationship.commit', 'life.move'],
    axes: ['relation', 'money', 'growth', 'risk', 'joy'],
    options: [
      { key: 'o1', label: '去北京，重新开始找', desc: '把关系放进长期计划，职业承担风险' },
      { key: 'o2', label: '不去，再谈异地或折中', desc: '保住职业连续性，关系承压' },
    ],
    profile: { o1: { relation: 9, money: 4, growth: 4, risk: 3, joy: 7 }, o2: { relation: 3, money: 8, growth: 8, risk: 7, joy: 3 } },
    bias: [{ when: { marital: '恋爱中' }, shift: 0.2 }, { when: { gender: '女' }, shift: 0.12 }, { when: { industry: '互联网' }, shift: -0.15 }],
    n: 63,
    hours_ago: 5,
    due_hours: 30,
    wanted_experience: { age_band: ['29-35', '36-45'], had_choice: ['是'] },
    exp_tag: 'relationship.commit',
    script: {
      o1: [
        '五年不是五个月，异地再拖两年大概率自然消耗掉',
        '去北京的代价是半年空窗，不去的代价是你四十岁以后会一直想这件事',
        '关键是先谈清楚：房、婚、孩子、谁为谁搬，别只谈感情',
        '算法岗位北京机会比杭州多，搬过去职业上限反而抬高',
        '她晋升了不让你知道她的时间表，你就永远是被调整的那个',
      ],
      o2: [
        '为对方辞职是把关系押上赌桌，一旦吵起来这句话一定会被拿出来',
        '你先拿到北京的 offer 再谈搬，顺序不能反',
        '折中方案：你先面三个月，拿到书面 offer 再定，别裸辞去',
        '她为什么不试杭州？两个人总要有一个人被牺牲，这次不该默认是你',
        '没谈婚房就让你搬，这个决策的边界条件还没确定',
        '异地结束的正确方式是两个人一起搬，而不是一方迁就',
      ],
    },
  },
  {
    key: 'secondtry',
    title: '考研二战 vs 现在接一个普通开发岗',
    situation: '双非一本计算机，一战差 9 分进复试。家里能支持我再脱产一年，但我本科专业一般、没有实习。现在有个 8k 的中小公司开发 offer，业务是内部系统。二战目标是一所 211。',
    intent: 'conclusion',
    tags: ['education.postgrad', 'career.offer'],
    axes: ['money', 'growth', 'stability', 'risk', 'wellbeing'],
    options: [
      { key: 'o1', label: '先工作，边做边考或以后考', desc: '现金流入、履历不空' },
      { key: 'o2', label: '脱产二战 211', desc: '学历跃迁，多一年空窗' },
    ],
    profile: { o1: { money: 6, growth: 6, stability: 7, risk: 7, wellbeing: 6 }, o2: { money: 3, growth: 8, stability: 4, risk: 3, wellbeing: 3 } },
    bias: [{ when: { industry: '学生' }, shift: 0.25 }, { when: { age_band: '36-45' }, shift: -0.2 }],
    n: 51,
    hours_ago: 14,
    due_hours: 22,
    wanted_experience: { age_band: ['18-22', '23-28'], industry: ['学生', '互联网', '教育'] },
    exp_tag: 'education.postgrad',
    script: {
      o1: [
        '计算机行业里，一年工作经验在简历上比 211 硕士更值钱，尤其是双非本科',
        '边工作边考一年，考上了你有退路，考不上你不亏',
        '内部系统岗确实平淡，但先入行才能跳，别指望学历替你跳',
        '脱产二战最大的成本不是钱，是第二年的心态崩掉',
        '差 9 分说明基础不弱，边工作边考通过率不低',
      ],
      o2: [
        '你的瓶颈是简历筛选，不是能力，211 学历能直接解决被筛掉的问题',
        '没有实习的本科去中小公司做内部系统，三年后你会被同龄硕士压住',
        '家里能支持就脱产一次，这是很多人这辈子唯一一次能赌学历的机会',
        '但必须设死线：只考两次，第二次不过立刻工作',
        '目标院校选得太保守了，既然脱产就该冲一档 985',
        '考上了记得读研期间必须有实习，否则学历只是空壳',
      ],
    },
  },
  {
    key: 'car',
    title: '20 万家用：纯电 SUV 还是插混轿车（没有固定车位）',
    situation: '家里第一台车，无固定车位不能装家充，通勤单程 22 公里，一年两次 600 公里长途回婆家。预算落地 20 万。老婆晕车，担心 SUV 晃。',
    intent: 'conclusion',
    tags: ['shopping.durable'],
    axes: ['money', 'wellbeing', 'resale', 'joy', 'risk'],
    options: [
      { key: 'o1', label: '纯电 SUV', desc: '用车成本低，充电靠公共桩' },
      { key: 'o2', label: '插混轿车', desc: '可油可电，长途不焦虑' },
    ],
    profile: { o1: { money: 7, wellbeing: 6, resale: 5, joy: 7, risk: 3 }, o2: { money: 8, wellbeing: 8, resale: 7, joy: 6, risk: 8 } },
    bias: [{ when: { region: '华南' }, shift: 0.12 }, { when: { region: '华北' }, shift: -0.15 }, { when: { marital: '已婚' }, shift: -0.1 }],
    n: 43,
    hours_ago: 30,
    due_hours: 36,
    wanted_experience: { had_choice: ['是'] },
    exp_tag: 'shopping.durable',
    script: {
      o1: [
        '不能装家充的电车体验会一直打折，公共桩的时间成本要算进钱里',
        '一年两次长途就足以让纯电变成负担，回程排队充电是真的',
        'SUV 重心高，晕车的家人每天通勤都难受，这条比面子重要',
        '插混当电车开，短途用电长途用油，是唯一不纠结的方案',
      ],
      o2: [
        '22 公里通勤每天纯电，一年油钱几乎为零，家里没桩也能靠公司桩',
        '纯电的静谧和加速回不去，试驾完插混再试纯电你会立刻选纯电',
        '电池衰减在五年内不是问题，别用六年后的焦虑买今天的车',
        '轿车坐姿低，老人上下车不方便，你要先量一下家里谁坐',
        '插混保养两套系统，长期维修成本比纯电高，这点没人说',
      ],
    },
  },
  {
    key: 'movecity',
    title: '35 岁，要不要离开北京回成都',
    situation: '北京户口没有，孩子 4 岁要上小学，我在互联网做运营总监 60w，爱人编制内小学老师不能走。成都同类型岗位大概 25w，房价是北京的三分之一，父母能帮带孩子。',
    intent: 'conclusion',
    tags: ['life.move', 'career.timing'],
    axes: ['money', 'relation', 'wellbeing', 'growth', 'risk', 'joy'],
    options: [
      { key: 'o1', label: '回成都', desc: '生活成本下降，孩子上学有解' },
      { key: 'o2', label: '留北京再拼三年', desc: '收入和履历继续走高' },
    ],
    profile: { o1: { money: 4, relation: 9, wellbeing: 8, growth: 4, risk: 4, joy: 8 }, o2: { money: 9, relation: 3, wellbeing: 3, growth: 8, risk: 6, joy: 4 } },
    bias: [{ when: { age_band: '36-45' }, shift: 0.2 }, { when: { marital: '已婚' }, shift: 0.15 }, { when: { industry: '互联网' }, shift: -0.2 }],
    n: 49,
    hours_ago: 12,
    due_hours: 26,
    wanted_experience: { age_band: ['29-35', '36-45'], had_choice: ['是'] },
    exp_tag: 'life.move',
    script: {
      o1: [
        '孩子小学是硬时间线，回成都晚一年，代价由孩子承担',
        '60w 在北京扣除房租和通勤，实际可支配不如成都 25w',
        '编制内的爱人走不了，异地只会让婚姻继续变形',
        '父母能帮带孩子，这条隐形价值在北京你花钱都买不到',
      ],
      o2: [
        '35 岁离开一线城市，履历会很难再回来，这是单向门',
        '成都同岗位 25w 是招聘均价，谈判空间小，别按北京心理价算',
        '先把孩子北京上学的路径算清楚，非京籍入学政策不是没有解',
        '回成都最难的通常是：你以为逃离了内卷，其实只是换了个内卷',
        '你现在的现金流值得再攒两年，回家时手里有 80w 和空手完全不同',
      ],
    },
  },
  {
    key: 'health',
    title: '体检报告甲状腺结节 3 类，医生建议穿刺，现在做吗',
    situation: '34 岁女性，入职体检发现 1.1cm 结节 TI-RADS 3 类，无压迫症状。医生说可以三个月复查，也可以直接穿刺。我下个月要出国工作半年，怕中间没人管。家族里母亲有甲状腺病史。',
    intent: 'info',
    tags: ['life.health'],
    axes: ['risk', 'wellbeing', 'money', 'relation'],
    options: [
      { key: 'o1', label: '出国前做穿刺', desc: '一次明确，代价是有创检查' },
      { key: 'o2', label: '三个月后复查', desc: '先观察，风险是不确定感' },
    ],
    profile: { o1: { risk: 4, wellbeing: 6, money: 5, relation: 6 }, o2: { risk: 7, wellbeing: 4, money: 7, relation: 5 } },
    bias: [{ when: { gender: '女' }, shift: 0.15 }, { when: { age_band: '36-45' }, shift: 0.1 }],
    n: 38,
    hours_ago: 7,
    due_hours: 20,
    wanted_experience: { had_choice: ['是'] },
    exp_tag: 'life.health',
    script: {
      o1: [
        '3 类恶性概率很低，但你出国半年期间没人管，心理成本比检查本身高',
        '家族史这条要告诉医生，它会影响随访间隔',
        '与其在国外一直想着，不如做完再走，钱能解决的问题别拖',
      ],
      o2: [
        'TI-RADS 3 类的常规做法就是随访，穿刺不是越早越好',
        '1.1cm 已经接近穿刺指征，去三甲做第二次超声复核，别自己下结论',
        '出国前把国内检查和资料做完，回来时随访时间线还在',
      ],
    },
  },
  {
    key: 'history',
    title: '（已决定）去年这时候我纠结：接老家国企还是留深圳算法岗',
    situation: '留档给同样在纠结的人。去年 9 月我 28 岁，手上是老家国企信息化岗和深圳一家做广告的算法岗，当时问了 40 多个人，最后去了深圳。',
    intent: 'conclusion',
    tags: ['career.offer'],
    axes: ['money', 'stability', 'growth', 'relation', 'risk'],
    options: [
      { key: 'o1', label: '留深圳算法岗', desc: '已选择' },
      { key: 'o2', label: '回老家国企', desc: '未选择' },
    ],
    profile: { o1: { money: 8, stability: 4, growth: 9, relation: 3, risk: 4 }, o2: { money: 4, stability: 9, growth: 3, relation: 8, risk: 8 } },
    bias: [{ when: { industry: '互联网' }, shift: 0.2 }],
    n: 57,
    hours_ago: 400,
    due_hours: -100,
    wanted_experience: {},
    exp_tag: 'career.offer',
    status: 'decided',
    outcome: { chosen_option_key: 'o1', went_with_advice: true, reflection: '去了深圳，一年半后跳到另一家做推荐，总包涨了 55%。但我错过的父亲住院是唯一后悔的事，如果重来我会选同一份工作但把父母体检安排在自己手上。', months_after: 18 },
    script: {
      o1: [
        '28 岁是最后一次可以随便试错的年龄，别浪费',
        '国企信息化岗的技术栈五年后会让你找不到工作',
        '算法岗现在正是被验证的窗口期，跳一次就有溢价',
        '你现在多攒的钱，是父母将来住院时你能选的余地',
      ],
      o2: [
        '国企的稳定在你这个年龄看不懂，等三十五岁才懂',
        '广告算法的天花板不高，别把行业红利当成个人能力',
        '父母在老家的话，你以后每一次决定都会被这件事拖着走',
      ],
    },
  },
  {
    key: 'childmajor',
    title: '孩子想报考古，我想让他报计算机，谁该让步',
    situation: '我是家长，孩子高考省排 4200，喜欢历史、看过很多考古纪录片，想报考古学。我认为就业面太窄，希望他报计算机。他不肯说话，家里已经僵了两周。',
    intent: 'conclusion',
    tags: ['education.college', 'relationship.family'],
    axes: ['money', 'joy', 'relation', 'growth', 'risk'],
    options: [
      { key: 'o1', label: '支持他报考古', desc: '兴趣和内驱力优先' },
      { key: "o2", label: '要求报计算机', desc: '就业确定性优先' },
    ],
    profile: { o1: { money: 4, joy: 9, relation: 6, growth: 6, risk: 4 }, o2: { money: 8, joy: 3, relation: 3, growth: 5, risk: 7 } },
    bias: [{ when: { age_band: '36-45' }, shift: 0.25 }, { when: { age_band: '18-22' }, shift: -0.3 }, { when: { industry: '教育' }, shift: 0.15 }],
    n: 52,
    hours_ago: 3,
    due_hours: 44,
    wanted_experience: { age_band: ['36-45', '29-35'], had_choice: ['是'] },
    exp_tag: 'education.college',
    script: {
      o1: [
        '他是全省前 4200 名，说明他有学习能力，兴趣决定他能走多远',
        '被强行按在计算机上的人会花十年时间恨你',
        '考古学可以辅修数据、地理信息，路径不是你以为的死路',
        '你真正的诉求是不确定收入，这个可以用双学位解决，不必用专业解决',
      ],
      o2: [
        '先问清楚：他喜欢的是考古还是纪录片里的浪漫，去博物馆做三天志愿者就知道了',
        '计算机就业面宽不等于他能学好，硬塞的结果是两边都输',
        '折中方案：第一志愿历史类，第二志愿信息管理，双方都让一步',
        '这个排名报计算机专业可能刚好被调剂到最差的方向，你的方案没那么稳',
        '孩子不肯说话已经是答案了，继续压会让所有以后的沟通都关上门',
      ],
    },
  },
  {
    key: 'crisis',
    title: '分手三个月，每天醒来都觉得撑不下去，不想活了',
    situation: '在一起四年，对方提的分手，没有任何解释。我这三个月没上班，睡不好，今天站在阳台上想了很久。不知道发这里有没有用。',
    intent: 'vent',
    tags: ['relationship.end'],
    axes: ['wellbeing', 'risk', 'joy'],
    options: [
      { key: 'o1', label: '想让自己今天好过一点', desc: '' },
      { key: 'o2', label: '先不管决定，先撑住', desc: '' },
    ],
    profile: { o1: { wellbeing: 6, risk: 3, joy: 5 }, o2: { wellbeing: 5, risk: 6, joy: 4 } },
    bias: [],
    n: 26,
    hours_ago: 2,
    due_hours: 12,
    wanted_experience: {},
    exp_tag: 'relationship.end',
    script: {
      o1: ['先只把今天过完，不做任何长期决定', '把手机里他的东西全部移走，不用删，先换个地方'],
      o2: ['三个月睡不着很正常，去看一次精神科比硬扛快', '先恢复上班节奏，人是靠结构撑起来的'],
    },
  },
  {
    key: 'trial',
    title: '方案被同组的人改头换面交给老板，把她挂到网上让她丢工作行不行',
    situation: '我做的方案在周会被组里另一个人讲了，PPT 里我的名字被去掉。我想曝光她，把截图挂到社交平台让她在公司待不下去。',
    intent: 'conclusion',
    tags: ['career.timing', 'life.legal'],
    axes: ['relation', 'risk', 'growth', 'wellbeing'],
    options: [
      { key: 'o1', label: '公开曝光她', desc: '' },
      { key: 'o2', label: '走内部渠道留证据', desc: '' },
    ],
    profile: { o1: { relation: 3, risk: 2, growth: 3, wellbeing: 4 }, o2: { relation: 6, risk: 8, growth: 7, wellbeing: 6 } },
    bias: [],
    n: 31,
    hours_ago: 6,
    due_hours: 18,
    wanted_experience: { industry: ['互联网', '制造', '金融'] },
    exp_tag: 'career.timing',
    script: {
      o1: [
        '先把带时间戳的原稿、聊天记录、版本历史全部固定下来',
        '公开曝光可能构成名誉侵权，反而让你从有理变没理',
        '直接找老板要一个署名，比让全网审判更可能解决问题',
      ],
      o2: [
        '挂人的代价一定大于你这次的委屈，不要拿自己的前途换对方的难堪',
        '走 HR 和书面邮件，让公司留痕，比社交平台有效',
        '如果确实有著作权纠纷，先咨询律师再动，别先发声',
      ],
    },
  },
  {
    key: 'thin',
    title: 'A 还是 B？',
    situation: '就一句话，不知道选哪个。',
    intent: 'conclusion',
    tags: ['shopping.appliance'],
    axes: ['money', 'joy'],
    options: [{ key: 'o1', label: 'A', desc: '' }],
    profile: { o1: { money: 5, joy: 5 } },
    bias: [],
    n: 0,
    hours_ago: 1,
    due_hours: 30,
    wanted_experience: {},
    exp_tag: 'shopping.appliance',
    script: { o1: ['信息太少'], o2: ['无法判断'] },
  },
];

function attributeCohorts() {
  const cohorts = [
    { n: 12, attrs: { age_band: '23-28', industry: '互联网', gender: '男', marital: '单身' }, tags: ['career.offer', 'career.switch', 'shopping.digital'], exp: ['career.offer', 'shopping.digital'] },
    { n: 10, attrs: { age_band: '29-35', industry: '体制内', gender: '女', marital: '已婚' }, tags: ['career.offer', 'life.move', 'education.college'], exp: ['career.offer', 'life.move'] },
    { n: 9, attrs: { age_band: '18-22', industry: '学生', gender: '男', marital: '单身' }, tags: ['education.postgrad', 'shopping.digital'], exp: ['education.postgrad'] },
    { n: 8, attrs: { age_band: '29-35', industry: '金融', gender: '女', marital: '恋爱中' }, tags: ['career.offer', 'relationship.commit', 'life.money'], exp: ['career.offer', 'relationship.commit'] },
    { n: 8, attrs: { age_band: '36-45', industry: '制造', gender: '男', marital: '已婚' }, tags: ['shopping.durable', 'life.move', 'education.college'], exp: ['shopping.durable', 'life.move', 'education.college'] },
    { n: 8, attrs: { age_band: '23-28', industry: '互联网', gender: '女', marital: '恋爱中' }, tags: ['relationship.commit', 'shopping.digital', 'life.move'], exp: ['relationship.commit', 'shopping.digital'] },
    { n: 7, attrs: { age_band: '29-35', industry: '医疗', gender: '女', marital: '已婚' }, tags: ['life.health', 'career.timing'], exp: ['life.health'] },
    { n: 6, attrs: { age_band: '36-45', industry: '教育', gender: '男', marital: '已婚' }, tags: ['education.college', 'education.adult', 'relationship.family'], exp: ['education.college', 'relationship.family'] },
    { n: 6, attrs: { age_band: '23-28', industry: '自由职业', gender: '其他', marital: '单身' }, tags: ['shopping.digital', 'life.careerstudy'], exp: ['shopping.digital'] },
    { n: 6, attrs: { age_band: '46+', industry: '自由职业', gender: '男', marital: '已婚' }, tags: ['relationship.family', 'life.money'], exp: ['relationship.family'] },
  ];
  return cohorts;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function biasFor(persona, rules) {
  let b = 0;
  for (const rule of rules) {
    for (const [k, v] of Object.entries(rule.when)) {
      if (persona.attributes[k] === v) b += rule.shift;
    }
  }
  return b;
}

function axisScoresFor(spec, rnd, stanceKey, jitter) {
  const out = {};
  for (const [key, profile] of Object.entries(spec.profile)) {
    const row = {};
    for (const [axe, base] of Object.entries(profile)) {
      const bias = key === stanceKey ? jitter : -jitter * 0.35;
      row[axe] = Math.round(clamp(base + bias + (rnd() - 0.5) * 2, 1, 10));
    }
    out[key] = row;
  }
  return out;
}

function build(store) {
  const rnd = mulberry32(20261014);
  const pool = [];
  let idx = 0;
  for (const cohort of attributeCohorts()) {
    for (let i = 0; i < cohort.n; i += 1) {
      const region = ['华东', '华北', '华南', '华中', '西南', '西北', '东北', '海外'][Math.floor(rnd() * 8)];
      const p = store.createPersona({
        seed: 'seed-' + idx,
        rnd_seed: 90001 + idx,
        attributes: { ...cohort.attrs, region },
        declared_tags: cohort.tags,
        declared_experience: cohort.exp,
      });
      p.device = 'd_' + Math.floor(idx / 3);
      p.karma = Math.floor(rnd() * 40);
      pool.push(p);
      idx += 1;
    }
  }

  const authorFor = (specIndex) => pool[(specIndex * 7 + 3) % pool.length];

  for (let di = 0; di < DILEMMAS.length; di += 1) {
    const spec = DILEMMAS[di];
    const author = authorFor(di);
    const created = Date.now() - spec.hours_ago * 3600000;
    const due = created + Math.max(1, spec.hours_ago + spec.due_hours) * 3600000;
    const d = store.addDilemma(
      {
        title: spec.title,
        situation: spec.situation,
        intent: spec.intent,
        tags: spec.tags,
        axes: spec.axes.map((a) => ({ id: a })),
        options: spec.options,
        wanted_experience: spec.wanted_experience,
        decision_due_at: due,
        created_at: created,
        privacy: { masked_types: [], region_granularity: '大区' },
      },
      author,
    );
    d.created_at = created;
    d.decision_due_at = due;
    d.expires_at = due + 3600000;
    if (spec.status) d.status = spec.status;
    if (spec.outcome) {
      d.outcome = { dilemma_id: d.id, ...spec.outcome, created_at: created + spec.hours_ago * 3600000 };
      store.db.outcomes[d.id] = d.outcome;
    }
    d.spec = undefined;

    const target = Math.round(spec.n * clamp(spec.hours_ago / (spec.hours_ago + 14), 0.7, 1));
    let reasonCursor = { o1: 0, o2: 0 };
    for (let i = 0; i < target; i += 1) {
      const voter = pool[Math.floor(rnd() * pool.length)];
      if (voter.pid === d.author_pid) continue;
      if (d.status !== 'open' && d.status !== 'needs_context' && d.status !== 'decided') continue;
      const pO1 = clamp(spec.options.length === 1 ? 1 : 0.5 + biasFor(voter, spec.bias) + (rnd() - 0.5) * 0.24, 0.06, 0.94);
      const stanceKey = rnd() < pO1 ? 'o1' : spec.options.length > 1 ? 'o2' : 'o1';
      const pool2 = spec.script[stanceKey] || spec.script.o1;
      const reason = pool2[reasonCursor[stanceKey] % pool2.length] + '。' + DETAILS[Math.floor(rnd() * DETAILS.length)];
      reasonCursor[stanceKey] += 1;
      const ts = created + Math.floor(rnd() * (Date.now() - created));
      const ballot = store.addBallot(d, {
        voter_pid: voter.pid,
        option_key: stanceKey,
        reason,
        confidence: 40 + Math.floor(rnd() * 55),
        axis_scores: axisScoresFor(spec, rnd, stanceKey, (rnd() - 0.5) * 3 + 1.2),
        experience_claim: rnd() < 0.34 ? [spec.exp_tag] : [],
      });
      ballot.created_at = ts;
      ballot.helpful_votes = Math.floor(rnd() * rnd() * 9);
      if (rnd() < 0.06) ballot.adopted = true;
    }
  }

  const decided = Object.values(store.db.dilemmas).find((d) => d.status === 'decided');
  if (decided) {
    const adopted = store.db.ballots.filter((b) => b.dilemma_id === decided.id && b.option_key === decided.outcome.chosen_option_key).slice(0, 4);
    for (const b of adopted) {
      b.adopted = true;
      if (!decided.accepted_ballot_ids.includes(b.id)) decided.accepted_ballot_ids.push(b.id);
    }
  }
  store.expertiseCache.clear();
  store.db.audit = [];
  store.audit('seed', { actor: 'system', personas: Object.keys(store.db.personas).length, dilemmas: Object.keys(store.db.dilemmas).length, ballots: store.db.ballots.length });
  store.save();
  return { pool, dilemmas: DILEMMAS };
}

function reset(store) {
  store.db = {
    keyRing: store.db.keyRing,
    personas: {},
    dilemmas: {},
    ballots: [],
    questions: [],
    reports: [],
    jury: [],
    audit: [],
    outcomes: {},
    meta: { created_at: Date.now(), key_rotations: 0 },
  };
  return build(store);
}

module.exports = { build, reset, DILEMMAS, DETAILS };
