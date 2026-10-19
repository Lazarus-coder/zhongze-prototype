<div align="center">

# 众择

> 把两难问题丢给一群陌生人——不替你决定，给你一张带权重的意见地形图。

![Node](https://img.shields.io/badge/Node.js-%E2%89%A520-339933?style=flat-square&logo=node.js&logoColor=white)
![deps](https://img.shields.io/badge/third--party_deps-0-2ea44f?style=flat-square)
![tests](https://img.shields.io/badge/%E5%86%92%E7%83%9F%E6%96%AD%E8%A8%80-66%2F68-d29922?style=flat-square)
![status](https://img.shields.io/badge/status-prototype-blue?style=flat-square)

<p align="center">
  <a href="#这是什么">这是什么</a> ·
  <a href="#运行">运行</a> ·
  <a href="#它能做什么">能力</a> ·
  <a href="#api-快览">API</a> ·
  <a href="#测试与已知问题">测试</a> ·
  <a href="#仓库现状">现状</a>
</p>

<p align="center">匿名发帖 · 加权投票 · 观点聚类 · k-匿名切片 · 陪审团治理<br/>
零第三方依赖：服务端只用 Node 标准库</p>

</div>

---

## 这是什么

「众择」是一个**匿名群体决策社交 App 的可运行原型**：用户把两难问题匿名发出来，陌生人带着各自的经历与视角投票、追问、补上下文；系统按可信度给每票加权，做观点聚类、人群切片与统计提醒，最后把"决策备忘录"和真实结果回流成案例库。

本仓库是原型的**服务端与协议层**（API / 加权投票 / 统计 / 隐私 / 审核治理 / 模拟器 / 无头测试）。

<a id="仓库现状"></a>
## 仓库现状

- 前端（`web/`）**未包含**在本仓库中；`server/index.js` 已预留静态目录与 MIME 映射，接入前端即可跑通完整闭环。
- 冒烟测试 68 项，当前 **66 通过 / 2 已知未通过**（见文末）。

<a id="运行"></a>
## 运行

```bash
npm start        # node server/index.js → http://localhost:4321
npm run dev      # 重置数据后启动（QZ_RESET=1）
npm test         # 无头冒烟测试（临时数据目录，不碰真实数据）
```

| 环境变量 | 默认 | 作用 |
|---|---|---|
| `PORT` | 4321 | 端口 |
| `QZ_DATA_DIR` | `./.data` | 数据目录 |
| `QZ_RESET` | — | `1` 时启动即重置种子数据 |
| `SIM` | on | `0` 关闭模拟用户 |
| `SIM_MS` | 3800 | 模拟器节奏（毫秒） |
| `QZ_WINDOW_H` | 72 | 投票窗口（小时） |

<a id="它能做什么"></a>
## 它能做什么

- **伪匿名身份** —— 随机昵称 + 粗粒度属性带；密钥可轮换并写审计。
- **加权投票** —— 每票带 6 项可解释权重因子：`domain_expertise` / `calibration` / `experience_claim` / `confidence` / `moderation_factor` / `credibility`（相乘得票权）。人身攻击票被压制、低投入观点降权、发帖人不能自投。
- **聚合统计** —— 原始票 + 加权票、极化指数、Wilson 95% 置信区间、k-匿名人群切片（Laplace 噪声 + 小群合并）、效用矩阵与权重敏感性（结论翻转点）。
- **观点聚类** —— 中文分词聚合正反方观点簇，附代表原话与关键词。
- **隐私** —— 发帖与转述自动脱敏（手机号 / 身份证 / 邮箱…）；`/api/privacy/scan` 可发帖前预览。
- **审核治理** —— 分级审核：危机帖 → 热线卡片且不推流；医疗 / 法律 / 财务 → 免责标注。举报 → 5 人陪审团裁决 → 审计日志；治理台需 ops 权限。
- **推荐流** —— 兴趣排序 + `dissent`（异见）与 `explore`（防回音室）配额 + 单赛道上限。
- **实时** —— SSE 广播新票 / 状态 / 陪审变化（`/api/events`）。
- **模拟器** —— 种子随机（mulberry32）合成用户持续发帖投票，冷启动即可看到生态。

<a id="api-快览"></a>
## API 快览（节选）

```
POST /api/session/persona                  建会话（伪匿名身份）
POST /api/privacy/scan                     发帖前隐私扫描 / 脱敏预览
POST /api/dilemmas                         发帖（自动分级 / 脱敏 / 推流决策）
GET  /api/feed                             推荐流（含 dissent / explore 配额）
GET  /api/dilemmas/:id                     详情：统计 / 聚类 / 切片 / 效用 / 翻转点 / 相似历史
POST /api/dilemmas/:id/ballots             投票（加权 + 过滤）
POST /api/dilemmas/:id/question | /answer  匿名追问 / 发帖人回答
POST /api/dilemmas/:id/adopt | /helpful    采纳建议 / 标记有帮助
POST /api/dilemmas/:id/complete | /outcome 收票生成备忘录 / 结果回流案例库
POST /api/reports                          举报 → 生成判例（含陪审团规则引用）
GET  /api/governance                       治理台（需 ops 权限）
GET  /api/events                           SSE 实时事件流
```

<a id="测试与已知问题"></a>
## 测试与已知问题

`npm test` → **66 passed, 2 failed**：

- `攻击票不影响票数` —— 断言期望被压制（suppressed）的攻击票仍计入响应的 raw 计数（+1、保透明度），而当前实现把它从统计中整体排除。两种口径都成立，语义待定。
- `相似历史决策（含结果）被召回` —— `opinions` 相似度检索在测试语料下返回空，召回阈值需要调。

其余 66 项覆盖：推流配额（dissent / explore / 赛道上限）、加权与降权、追问闭环、采纳 / 结果回流、危机与医疗分级、k-匿名切片、陪审团流程、治理权限、密钥轮换审计等。

## 目录结构

```
server/
  index.js       HTTP 服务 + SSE + 静态文件
  api.js         路由与业务编排（发帖 / 投票 / 详情 / 治理 / 案例召回）
  store.js       JSON 存储（事件驱动）+ 票权计算
  identity.js    伪匿名身份与密钥轮换
  stats.js       加权统计 / 极化 / 置信区间 / k-匿名 / 效用 / 敏感性
  opinions.js    中文分词与观点聚类
  privacy.js     隐私探测与脱敏
  moderation.js  分级审核词库与规则
  matching.js    兴趣匹配与推送
  simulate.js    合成用户模拟器
  taxonomy.js    标签树与建议级别
  seed.js        种子语料
test/
  smoke.js       无头冒烟测试（68 断言）
```

## 免责

原型仅用于产品与技术验证，聚合输出不构成医疗 / 法律 / 财务专业建议。