# AI 时代全方向创业调研与新赛道决策(2026-07-20)

> 方法:deep-research 工作流 5 路检索(solo 营收证据 / 游戏经济学 / Agent 基建 / 内容坍塌 / 失败反证)。
> 诚实声明:对抗核验层因 API 限额未跑完,以下引用均有信源链接但未经三票核验;关键数字已在多信源间交叉印证。

## 一、六大方向机会矩阵(1-5 分,拥挤度为反向分:高=空间大)

| 方向 | 规模/增速 | 空间(不拥挤) | Solo 可行 | 营收自动化 | 10x 潜力 | 总分 |
|---|---|---|---|---|---|---|
| ① AI/浏览器游戏 | 3 | 3 | 2 | 4 | 2 | 14 |
| ② Agent 基建"轨道"(支付/身份) | 5 | 1 | 1 | — | — | 出局 |
| ②' Agent 基建"镐与铲"(工具/监测/就绪) | 4 | 4 | 4 | 4 | 4 | **20** |
| ③ AI 消费应用(陪伴/语音/教育) | 4 | 2 | 2 | 2 | 3 | 13 |
| ④ 内容站(广告变现) | 1 | 2 | 3 | 5 | 1 | 12 |
| ⑤ 垂直 AI 服务(法律/健康等) | 3 | 3 | 2 | 2 | 3 | 13 |
| ⑥ Boring 工具/微 SaaS | 4 | 3 | 5 | 4 | 3 | 19 |

## 二、各方向关键证据

**① AI 游戏 — 有流量无收入,单位经济残酷**
- Poki 月活 1 亿玩家、月 10 亿次游玩,首款网页游戏现实收入约 $500-3,000/月(indiegamebusiness);CrazyGames 独占期 +50% 分成
- 反证(一手开账本):某 solo 开发者 8 款游戏组合,WebGL 端 55.6 万次游玩仅赚约 €0.8-1/千次,**总计净亏损**(donislawdev);itch 生态 ~70% 独立开发者从未盈利,2025 年 Steam 独立游戏中位收入 $249
- "AI 生成游戏"目前是奖金赛规模(itch 2025 Ray Vibe Awards 总奖池 $2,500),非营收规模
- 结论:**不作为主赛道**;可作为流量实验(嵌入站群吃 Poki 类分发),不押注

**② Agent 基建 — 轨道被巨头锁死,镐与铲敞开**
- 支付/身份轨道全部巨头背书:x402=Coinbase 系(至 2026-04 累计 1.65 亿+交易、6.9 万活跃 agent,约一半疑似测试流量,Chainalysis)、AP2=Google+60 家、Visa TAP、Mastercard Agent Pay、Skyfire——solo 无位置
- **MCP 生态是本轮最快增长的开发者生态**:官方 registry 已收录 5,800+ 社区服务器且 Google/Microsoft 入场(registry 本身商品化);但**监测/一致性/评测/发现层仍是 solo 尺寸**(MintMCP 对比 15 家 registry 全部押注企业 SSO/审计,轻工具无人做)
- 变现证据:有收入的公共 MCP 服务器多在 $500-3,000/月,21st.dev Magic MCP 六周 $10K MRR(godberrystudios);瓶颈是发现与信任,不是计费
- 结论:**镐与铲位 = 最佳新赛道**,且与现有扫描器架构/站群 100% 同构

**③ 消费应用** — AI 套壳 90 天流失率 ~65%(SaaS 基线 ~35%,Growth Unhinged);2025 关停潮(Builder.ai $1.2B 估值破产等),API 转售型失败同比 2.5 倍。solo 不碰

**④ 内容广告站 — 结构性死亡,只留"被引用"价值**
- 零点击搜索 56%→69%(2024→2025),2026 预计 >75%;出版商流量/收入普跌 20-90%(Stereogum -70% 广告、Digital Trends -97%、HouseFresh 被引量 -80%)
- 幸存路径:newsletter/邮件收入占比升至 18-35%、数字产品/会员、以及**成为 AI 引用源**(域名权威是 AI 引用第一预测因子,被引品牌每展示点击 +120%)
- 结论:内容只做**产品的分发与引用层**(我们已在做),不做独立广告生意

**⑥ Boring 工具 — solo 成功率基线最高**
- 实证:solo 组合 $28K MRR(Indie Hackers)、Zigpoll solo $125K MRR、AI 设计工具 6 周 $10K MRR、**"Mentions"(追踪品牌在 AI 回答中的出现)solo $20K MRR** ——最后者直接验证我们现有 AI 可见性赛道的 SMB 端可变现
- 基线分布:~30% 微 SaaS 到不了 $1K MRR,~15% 达到 $10-100K,~5% 超 $100K;美国客户付费意愿 2-3 倍
- 警示:我们的检测/监控细分企业端已 VC 锁定(Profound $96M C 轮 $1B 估值、Peec €21M A 轮、15+ 竞品)→ 坚守 SMB 自助 + 向新生态平移

## 三、Top 3 候选与终选

1. **MCP 服务器体检/监测(选定 ✅)** — 详见下
2. AI 游戏门户/vibe-game 聚合 — 否决:单位经济(€1/千次游玩)+ 70% 不盈利基线
3. Agent 经济 newsletter/数据产品 — 不独立成站,并入现有内容层(周度 Index 已是雏形)

## 四、最终决策:MCP Pulse —— "MCP 服务器的 AgentReady"

**一句话**:输入任意远程 MCP 服务器 URL → 实时体检(协议握手、工具清单、延迟、TLS/认证/CORS、元数据完备度)→ 0-100 分 + 修复建议;免费扫描获客 → Pro 监控($19/mo,uptime/延迟/schema 漂移告警)→ 公共 MCP 服务器周度指数(数据飞轮,同 DTC Index 打法)。

**为什么是它**:
- 骑在 AI 时代增长最快的开发者生态上(5,800+ 服务器且指数增长),而该生态的"体检/监控层"验证为空白且 solo 尺寸
- 与现有资产完全同构:扫描器架构复用、站群互链、周度自动化直接套用、目标人群(开发者)自带传播
- 营收自动化:开发者自助订阅,无销售;付费意愿已被 MCP 服务器自身变现($500-3K/mo)托底——赚钱的服务器需要 uptime 监控
- 10x 路径:体检 → 监控 → MCP 服务器目录+评分(信任层)→ agent 流量分发层。生态越大,体检与信任需求越大

**MVP 规格**(sites/mcppulse,mcppulse.agiscorecard.com):
- `/api/scan?url=` :JSON-RPC initialize + tools/list(streamable HTTP,SSE 兼容),测延迟/TLS/认证方式/CORS/工具描述完备度 → 评分
- 首页扫描器 + FAQ/方法论(GEO 化)+ Pro waitlist(intent 复用 KV)
- llms.txt / agents.md / robots / sitemap / GA4 全套标配
- 周度"Public MCP Server Index":扫描知名公共 MCP 服务器出榜单(第二数据飞轮)

## 五、来源
indiegamebusiness.com(网页游戏收入基准)· developers.poki.com · docs.crazygames.com · itch.io 2025 finances · donislawdev.com(8 游戏开账本)· godberrystudios.com(MCP 变现)· mintmcp.com(15 registry 对比)· chainalysis.com(x402 数据)· appliedtechnologyindex.com(支付协议对比)· everything-pr.com / thedigitalbloom.com / housefresh.com / adexchanger.com(内容坍塌)· searchenginejournal.com(引用经济)· indiehackers.com ×4(solo MRR 实证)· cloro.dev(可见性赛道 15 竞品与融资)· techstartups.com / morningstar.com / growthunhinged.com / andrewchen.substack.com(失败与流失基线)
