# 快速营收方案调研：网站 / 游戏 / App，哪条路最快到第一笔钱？（2026-08-21）

> 方法：三路并行联网调研（①最快变现形态实证 ②游戏/App 单位经济复核 ③零流量冷启动分发渠道），全部基于 2025–2026 年一手来源，来源清单见文末。基线：本仓库 7 站全部在线、CI 部署健康，但**连续 5 周漏斗全零**（waitlist:0 / preorder:0 / monitors:0），Creem/Resend 收款告警代码已就位但账号未配置（docs/BILLING-SETUP.md）。

## 一句话结论（先说最诚实的）

**2026 年不存在"AI 全自动、零人工、快速赚钱"的方案。** 三路调研的证据指向同一个结构：AI 能端到端自动化的环节（写代码、做内容、建站、提交目录）恰恰因为人人都能自动化而回报趋零；真正决定"第一笔钱"的两个环节——**收款账户 KYC（一次性 ~1 小时）和真人身份的分发（每天 30–60 分钟）**——AI 无法代劳。因此最快路径不是"再建一个新东西"，而是：**把已建成的站群接上收款（用户 1 小时）+ 由 AI 把分发弹药备到极致、用户每天花 30–60 分钟扣扳机**。新建游戏/App/内容站均被证据否决。

## 二、逐项结论：继续 / 调整 / 放弃

| # | 候选方案 | 第一笔钱时间（零受众实证） | 中位结局 | 结论 |
|---|---|---|---|---|
| 1 | **激活现有站群收款**（Creem 开户 + 已写好的付费档/徽章/审计产品） | **数天–2 周**（开户当天可收款） | 取决于分发 | ✅ **继续（主线）** |
| 2 | **数字产品**（审计报告 PDF、模板、清单，Gumroad/Notion 市场分发） | 2–8 周 | Gumroad 中位 $72/月；44% 产品终身 $0 | ⚠️ **调整**：只作为扫描器现有输出的低价包装 + 借市场平台流量，不做独立新品 |
| 3 | 浏览器扩展 | 1–6 个月（审核 1–3 周 + 冷启动） | 86% 扩展 <1,000 用户 | ⚠️ 仅作已验证产品的分发渠道，不作首美元路径 |
| 4 | 网页游戏（Poki/CrazyGames） | 1–4 个月；Poki 策展制多数投稿无回复；CrazyGames €100 起付 ≈ 需 ~10 万次游玩 | €1/千次游玩；多数永远到不了起付额 | ❌ **放弃**（7 月结论维持且恶化：vibe coding 供给洪水使策展收紧） |
| 5 | 移动 App（iOS/Android） | 6–10 周硬下限（证件验证 + Android 需 12 名真人测试 14 天 + 审核） | 57.7% 新 App 累计订阅收入到不了 $1,000；订阅中位 $492/月且同比 -22% | ❌ **放弃**（人工门槛最多、AI 套壳已被平台清理） |
| 6 | Steam 游戏 | ~6 周流程硬下限 + 月结，现实 2–3 个月 | 无营销 vibe-coded 游戏落在 2025 中位 $249 档 | ❌ **放弃**（最慢） |
| 7 | RapidAPI 卖 API | — | 平台估值跌 90% 被诺基亚收购转向 5G，活跃用户仅数千，佣金升至 25% | ❌ **放弃**（赛道实质死亡；卖 API 的正确形态 = 自托管 + MoR，即 #1） |
| 8 | 新内容站/程序化 SEO 吃广告 | 6–12 个月 | 美国搜索 68% 零点击（AI Overview 下 83%）；Google 2025–2026 连续核心更新定点打击 pSEO | ❌ **放弃**（维持 7 月结论；SEO 只作现有站的 6–12 个月背景任务） |
| 9 | 新建目录站卖 featured 位 | ≥3–6 个月（行业门槛 ~5,000 月访客后才卖得动） | 无差异化流量的新目录大多归零 | ❌ 暂缓（是"第 N 桶金"模式，不是首美元模式） |

## 三、关键证据摘要

### 为什么"再建新东西"不解决问题
- Gumroad 官方级数据（14.6 万产品，2026）：创作者收入**中位数 $72/月，44% 的产品终身收入 $0**，前 1% 拿走 ~99.5%。
- 明星案例全靠既有受众：ShipFast 从 $141K MRR 跌至 ~$20K（作者自认 boilerplate 被 AI 写码贬值）；Thomas Frank $2.1M 背后是百万级 YouTube。
- vibe coding 使半年新增手游 18.1 万款（iOS +118%），App Store 被"AI slop"淹没、Poki 人工策展实质收紧——**AI 降低的生产成本，全部转化为分发端更高的门槛**。
- 54% 的 indie 产品收入为零（2023→2026 持平）。失败是基线，不是意外。

### 为什么瓶颈在分发，以及什么分发还有效（2026）
- **失效/通胀渠道**：Product Hunt 非前 10 名 <500 访客、<20 注册（有案例：400 注册仅 1 付费）；Show HN 中位数 2 分；目录提交仅 15% 免费可用、单目录常 <10 访问（价值只剩反链/GEO 信号）；X build in public 零粉丝≈0；小预算 Google/Meta 广告（B2B CPC $5.34、Meta 学习期需周 50 转化）≈捐款。
- **仍有效的三条**（按到第一个付费用户排序）：
  1. **创始人署名精准冷触达**（2–6 周，方差最小）：B2B 回复率 3–8%，创始人署名比 SDR 高 30–50%；YC/Lenny 数据：首批 10 个客户第一来源是人脉与直接触达。**AgentReady 扫描结果是天然钩子**（"你的店在 AI 购物代理眼里长这样：[个性化报告]"）。
  2. **垂直社区人肉运营**（2–8 周）：r/shopify、r/ecommerce、Shopify Community、agentic-commerce Discord；2025 年有单帖 112 注册实证；50% micro-SaaS 创始人首要渠道。**必须真人老账号，自动发帖=封号烧渠道**。
  3. **去已有买家的市场平台**（3–12 周）：Shopify App Store 70% 安装来自站内搜索；GitHub 是 dev 工具的买家市场（扫描器可开源为 CLI/Action 引流）；Gumroad Discover 自带品类流量（抽 30%）。平台流量 > 自建站流量，代价是抽成与规则。

### 收款通道现实（MoR 对比，2026）
- **Creem**：3.9%+$0.40 最便宜，onboarding 最快 8–10 分钟过审（偶有 waitlist/KYC 卡人）——与 docs/BILLING-SETUP.md 既有选型一致，维持。
- Polar：2026-05 涨至 5%+$0.50，首提现人工核验 24–72h。备胎。
- Lemon Squeezy：被 Stripe 收购后 KYC 拒审不给理由、扣款 30 天投诉多——**避开**。

## 四、推荐路线（两条，并行）

### 路线 A（主线，本周）：把已建成的资产接上钱
逻辑：站群 + 付费档代码 + 徽章/审计产品设计（docs/PAID-PRODUCTS.md）全部现成，距离"能收钱"只差用户侧 ~1 小时配置。这是全局最短路径，没有之一。

### 路线 B（分发引擎，AI 全自动部分）：把"扣扳机前的一切"自动化
逻辑：调研明确第一付费用户来自冷触达+社区，AI 的正确角色是弹药厂——信号监听（哪些欧美 SMB 店刚上线但无 agent 接入）、名单构建、个性化扫描报告生成、触达/回帖草稿、开源 CLI 引流、目录一次性批量提交。用户每天只出 30–60 分钟真实身份。

## 五、第一周行动清单

**用户人工（总计 ~2 小时一次性 + 每天 30–60 分钟）：**
1. 注册 creem.io，建 Pro $19/mo、Team $49/mo 两个产品 + Agent-Readiness 审计 $149 一次性产品，按 docs/BILLING-SETUP.md 填 3 个密钥（~40 分钟）；
2. 注册 resend.com 验证 agiscorecard.com 发信域名，填 RESEND_API_KEY（~15 分钟）——同一域名后续也用于冷触达发信（需 2–3 周域名预热，越早开越好）；
3. （可选）注册 Gumroad 填 W-8BEN，作为数字产品第二分发面（~20 分钟）；
4. 每天 30–60 分钟：用 Claude 备好的草稿在 r/shopify / Shopify Community 真人答题、给名单上的 SMB 发创始人署名邮件、回复对话。

**Claude 自动化（可立即排期，无需用户）：**
1. 把"Agent-Readiness 审计报告"产品化：扫描器输出 → 自动生成付费 PDF（含修复路线图），挂到 AgentReady 定价页与 Gumroad 素材包；
2. 徽章产品落地（/badge/<id>.svg + /verified/<id> 公开验证页，复用现有 webhook/token 机制）；
3. 冷触达弹药流水线：抓取"新上线但无 llms.txt/feed/schema 的欧美 Shopify 店"名单 → 逐店跑扫描 → 生成个性化摘要 + 邮件草稿，落盘供用户每天取用；
4. 把 AgentReady 扫描器打包为开源 CLI / GitHub Action（agent-readiness check），发布到 GitHub 引流；
5. 一次性批量提交 10–30 个仍免费可用的优质目录（只为反链与 GEO 信号，不指望流量）；
6. 每周继续 Index/内容自动化（6–12 个月 SEO/GEO 背景任务，不占决策）。

**明确不做**：游戏（任何形态）、移动 App、Steam、RapidAPI、新内容广告站、新目录站、Product Hunt（等有 50+ 支持者再打）、Google/Meta 小预算广告（转化路径验证前不投）。

## 六、验证指标与止损

- **2 周检查点**：冷触达回复率 <2% 且社区帖零转化 → 说明痛点假设（欧美 SMB agent-commerce 就绪需求）不成熟，触达渠道会最快告诉我们答案——届时降级 AgentFront 假设，转投审计/徽章的"AI 可见性"更宽人群，或重开赛道调研；
- **4–6 周检查点**：第一笔真实收款是否发生。发生 → 加码该产品线；未发生但有对话/名单增长 → 迭代 offer；两者皆无 → 承认当前站群方向证伪，重新选题（届时游戏/App 也不会是答案，证据见上表）。

## 七、来源（精选）

变现形态：insightraider.com（Gumroad 2026 统计）· trustmrr 公开面板/starterstory（ShipFast）· debugbear.com（扩展基准）· techcrunch.com 2024-11（RapidAPI 被收购）· fungies.io / dodopayments.com / trustpilot（Creem/Polar/LS 2026 对比）· awesome-directories.com（73%/6 个月基线）。
游戏/App：Poki 官方/SDK FAQ · EU-Startups 2026-04（Poki 策展）· CrazyGames docs（分成/€100 起付）· Digital Trends 2026（vibe coding 供给洪水）· RevenueCat State of Subscription Apps 2026（57.7%/$492/-22%）· Google Play 官方（12 测试者 14 天）· Forbes 2026-03-24（AI slop）· steampageanalyzer/games-stats（Steam 2026）。
分发：hub.causo.ai（PH 2026 分档流量）· sturdystatistics/danfking（Show HN 18.8 万帖研究）· belkins/hunter.io（冷邮件 2025–2026）· YC 2025-12（首批客户来源）· freemius State of Micro-SaaS 2025 · craftberry（Shopify App Store 70% 站内搜索）· omnibound/1clickreport（零点击 68% 与 pSEO 打击）· stackmatix（Reddit Ads $5/天）· solooperatorstack（54% 零收入基线）。
完整 URL 见本轮三路调研原始输出（会话记录）。
