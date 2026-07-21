# 订阅营收方向决策(2026-07-21)

> 目标:选 1 个"真有人用、市场够大、能形成订阅营收"的方向,给定价 + MVP + go/no-go。
> 方法:三路真实检索(付费意愿与 TAM / 竞对拆解 / 我们资产到首个付费客户的最快路径)。结论已交叉验证并调和分歧。

## 一句话结论(go)

**做"AI 商务可见性**监控**"订阅产品:把 AgentReady 从一次性扫描器,升级为"持续监控 + 回归告警"的订阅服务——盯住那些一改就让你的店对 AI 购物代理"隐形/不可买"的**确定性技术项**(feed 合规、schema 完整度含退货政策、robots/AI 爬虫访问、llms.txt、ACP/UCP 漂移)。** MCP Pulse 做同一套引擎的**第二个 SKU**(MCP 协议级监控 + 徽章)。**GEO/AEO 引用追踪不做独立产品**。

关键洞察(调和三路分歧):
- **一次性"agent readiness 打分"**已被 Cloudflare `isitagentready.com` 免费商品化 → 不可订阅。
- **"你被 ChatGPT 引用了吗"式 GEO 追踪**需要反复多模型查询 → 成本高、$1B 融资巨头(Profound)+ $29 地板价的红海 → 小团队必输。
- **可订阅的甜点 = "持续监控 + 回归告警"**,且监控项必须是**HTTP 抓取即可判定的确定性检查**(零 LLM 成本)。这落在巨大的 agentic-commerce TAM 之下、面向**有预算的商家**,而且**不是 Shopify 免费给的**(Shopify 只自动同步 feed,不为 SMB/非 Shopify 做跨平台技术回归监控告警)。

## 品类裁决(三路综合)

| 品类 | 付费意愿证据 | 竞争/运营成本 | 小团队可赢? | 裁决 |
|---|---|---|---|---|
| **AI 商务可见性监控(确定性层)** | 邻近品类已付费 $29–$99/mo;买家=有预算的电商 | 便宜(HTTP 抓取+解析,零 LLM);Shopify 不覆盖跨平台监控/非 Shopify | **是** | **主打(P0)** |
| **MCP 协议级监控** | 需求中(未验证),开发者买家便宜/易流失 | **最便宜**(cron 轮询+JSON-RPC 探测,零 LLM);协议级空档只有 2 个 indie 包 | **是,最防御** | **第二 SKU(P1)** |
| agentic-commerce feed 生成/同步 | TAM 最大(8–13x 增长) | **feed-sync 已被 Shopify 免费商品化 + $1.99 app** | 否(纯 feed) | 只做监控/诊断层,不做 feed 管道 |
| **GEO/AEO 引用追踪(独立)** | WTP 强($95–500/mo) | 多模型查询**成本高**;$1B 巨头 + $29 地板;红海 | **否** | **不做**(只作 P0 里的轻量"是否被推荐"功能) |
| MCP 网关/可观测(企业) | 企业 $499+/mo、定制 | 开源 + Datadog/Grafana 巨头;企业销售 | 否 | 不做 |
| agent-readiness 一次性打分 | 微弱 | Cloudflare 已免费 | 否 | 仅作免费获客漏斗(现状即对) |

## 为什么是它(而非其他)

- **有验证的付费意愿**:相邻的 AI 可见性品类已在 $29–$99/mo 稳定收费(Otterly $29、Geoptie $49、Profound 入门 $99),买家是掏 SEO/营销预算的电商与代运营——不用教育新预算。
- **告警价值高、天然低流失**:robots/llms.txt/schema 的沉默回归会让店在 AI 购物里悄悄消失,商家**自己发现不了**——这正是愿意为"持续监控告警"付费的核心。
- **运营成本极低**:全部确定性检查=`fetch()`+解析,**零 LLM 调用**,Cloudflare 上 ~$5/mo 跑得动 → 即使 $19 档也有高毛利(GEO 红海在 $29 档已亏本)。
- **护城河**:避开 Shopify 免费的 feed-sync 和巨头的多模型引用追踪,占"确定性技术回归监控 + 跨平台/非 Shopify + 便宜档"这个巨头不做、小团队能做的缝。
- **资本效率**:P0 和 P1 **共用同一套监控引擎**(账户+计划位+定时重扫+历史+回归告警+徽章),引擎写一次,两个 SKU 都用。

## 共用监控引擎架构(P0/P1 通吃)

```
账户(auth) → 每用户 plan 位(free/pro/team) → 保存的目标(域名 / MCP 端点)
   ↓ Cloudflare Cron Trigger(1 条 cron 唤醒,遍历到期队列;别一客户一 cron)
复用现有扫描逻辑(AgentReady /api/scan、MCP Pulse buildReport)——零 LLM
   ↓ 结果存 D1(SQLite,做时间序列/趋势;KV 免费档写限流,仅留 SUBSCRIBERS 邮件用)
对比上次 vs 本次 → 分数下降 / 某项翻转(llms.txt 没了、robots 拦 AI 爬虫、schema/sitemap 坏、feed 漂移)
   ↓ 触发邮件告警(Resend 或 MailChannels,100 封/天免费)+ 可分享报告/白标徽章
```
- 运营成本:Workers Paid **$5/mo**(免费档只有 5 条 cron,不够)+ D1 + 免费邮件额度,**无 LLM 成本**。

## 定价梯度(对标 benchmark)

| 档 | 价格 | 对象 | 内容 |
|---|---|---|---|
| **Free** | $0 | 获客/漏斗 | 按需 1 次扫描、当前分+首要修复、可嵌入徽章、邮件名单。**无历史、无定时**。 |
| **Pro** | **$19/mo**(年付 $15) | 单店主/独立营销 | 至多 3 域、每周(或每日)自动重扫、分数下降/llms.txt/schema/sitemap/爬虫访问回归**邮件告警**、90 天趋势、可分享报告。 |
| **Team** | **$49/mo**(年付 $39) | 代运营/多品牌 | 至多 25 域、每日扫、Slack+邮件告警、1 年历史、3 席、白标徽章与报告、CSV/API。 |
| (later) Agency | $149+/mo | 规模代运营 | 100+ 域、每小时扫、无限席、优先支持。 |

$19 入门:低于信用卡摩擦阈值,落在 Seomator/Visualping 带,远低于 Otterly $29 与 Semrush $99——做"最便宜、专注电商"的那个。高意向窄受众 free→paid 取 2–5% 现实。

## 付费档 MVP(最小可收费集合)

1. 账户 + 保存的目标(auth;每用户→目标列表)。
2. **定时重扫**(Cron;Pro 每日 / Free 无)——复用现有扫描逻辑,不写新引擎。
3. **历史存储 + 趋势线**(D1 存最近 N 次)。
4. **回归告警邮件**(本次 vs 上次;分数降或某项翻转即发)——**单项最高价值付费功能**。
5. **可分享/白标报告 + 徽章**(留存 + 病毒传播钩子)。

其余(Slack、API、席位、每小时扫)是 Team/企业升级,非 MVP。

## 无流量 / 收款暂缓下的分阶段(把上线做成"配置开关")

1. **现在就加账户 + `plan` 位**(free/pro/team);所有功能门读这个位,今天全部门到 free,升级=改数据不改码。
2. **限额用 plan 位驱动**(域数、频率、历史保留、告警开关)——上线前**唯一必须存在**的东西。
3. **收款选 Merchant-of-Record 不选裸 Stripe**:全球卖不碰 VAT。费率:Creem **3.9%+$0.40**(最低、含税务/联盟,indie 友好)> Lemon Squeezy 5%+50¢(国际订阅可达 ~7.5%,且已被 Stripe 收购方向不明)。**推荐 Creem**。
4. **billing 抽象成薄接口 + webhook stub**:MoR 发 subscription-active/canceled webhook → handler 只改 `plan`。现在写成返回 200 的 no-op,以后接真 provider=填 API key + 映射 product id。
5. **现在就上定价页 + "加入等候/抢先体验" CTA**(复用 AgentFront 等候名单 KV),零收款集成即可验证价格与意向;上线=把 CTA 换成 MoR checkout 链接。

## 风险与反指(诚实)

- **需求验证仍缺**:当前零流量,付费意愿是"品类类比"而非我们自己的数据。→ 先用定价页+等候名单**验证价格与意向**,再接收款。别在没有一个等候邮件前就接 billing。
- **Shopify 窗口收窄**:feed 层已死,监控/诊断层 Shopify 与融资玩家在逼近。→ 主打**非 Shopify/WooCommerce + 跨平台 + 便宜档**这个它们最慢的缝。
- **不要滑向 GEO 红海**:一旦有人喊"加上'被 ChatGPT 引用了吗'",记住那是多模型查询、成本吞毛利、$1B 巨头的地盘——只做轻量确定性代理信号,不做全量引用追踪。
- **MCP SKU 需求最不确定**:开发者买家便宜易流失,通用 uptime 覆盖 80%。→ 只押"协议级(tool-list 漂移/握手健康/schema 回归)+ 免费徽章分发",当低成本第二 SKU,不当主赌注。

## go/no-go

- **GO**:AI 商务可见性**监控**(AgentReady 升级)为 P0;共用引擎;$0/$19/$49;plan 位 + 定价页/等候名单先行,Creem 收款后接。
- **GO(次)**:MCP Pulse 监控为 P1 第二 SKU,复用同引擎。
- **NO-GO**:独立 GEO/AEO 引用追踪;纯 feed 生成/同步;MCP 企业网关。

## 来源(要点)
Profound $96M/C 轮 $1B 估值(fortune/tryprofound);Peec €650K ARR/4 月(scalenut/nicklafferty);GEO 市场 $886M→$7.32B@34%CAGR;Otterly $29 / Geoptie $49 / Profound $99 起 / Writesonic $499;Shopify Agentic Storefronts 免费自动同步(shopify.com/news);MCP 监控仅 2 个 indie 包(stillonline/uptimesignal);Cloudflare Workers 定价/Cron 限制;Creem 3.9%+$0.40 vs LS 5%+50¢。完整链接见本轮三路调研原始输出。
