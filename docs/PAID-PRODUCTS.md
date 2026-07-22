# 交易付费产品短名单(2026-07-22,已验证形态)

> 承接 `TRANSACTION-DIRECTION.md`。这轮三路调研专找**具体的、已验证赚钱的付费产品**,把"卖付费 API"落到经过验证的原型。结论:**最好的交易付费产品,是把我们扫描器"已经产出的东西"变现——徽章、一次性审计、用量计费 API**——而不是赌 x402。

## 一句话结论

**做「Agent-Ready Verified 徽章」+「一次性 Agent-Readiness 审计报告」作为交易侧破局的头两个产品**——两者都是**一次付费=一笔真实交易、免牌照、MoR 代收、几天到第一笔钱**,且**复用 AgentReady 扫描器已有的分数/结论**。已建成的**监控订阅**($29–99 档)是复利层;**用量计费 API**是第三层。x402 留作可选的 agent 原生轨道。

## 已验证付费产品 × 契合度排序

评分:time-to-first-dollar × 契合(复用现有资产) × 可防御 × 免牌照。价格均为**调研到的真实对标**。

| 排名 | 产品 | 模式 | 真实价格对标 | 复用什么 | 到第一笔钱 | 免牌照 |
|---|---|---|---|---|---|---|
| **1** | **Agent-Ready Verified 徽章** | 一次性 or 月费"活验证" | Futurepedia Verified **$497 一次**;TrustedSite **$39/mo**;Norton/DigiCert $175–399/yr | AgentReady 分数/通过判定 | **几天** | ✅ |
| **2** | **一次性 Agent-Readiness 审计报告** | 固定价一次性 | Illucrum SEO 审计 **$197–597**;WE-DO **$1,997**(已含"AI-search citations");GEO 审计市场 $500–2,000 | 扫描器输出→PDF+修复路线 | **几天–2 周** | ✅ |
| **3** | **AI 可见性监控订阅**(已建成) | 订阅 $29–99 | Otterly **$29**、Trakkr(个人)**$79–399**、Peec **$95–495**;Peec **$10M ARR/16 月** | 已建的监控引擎/状态页 | 配 key 即通 | ✅ |
| **4** | **检查器/生成器 用量计费 API** | 预付 credits / metered | ScreenshotOne **$200K ARR**(个人 400 客户);Scrape Creators **$10K MRR**;Firecrawl credits/页;x402 金融 API 个人 **$1.5–2.4K/mo** | `/api/wellknown`、schema/feed 生成器 | 1–2 周 | ✅ |
| 5 | 工具目录 付费/featured 收录 | 一次性/月费 | SaaSHub **~$13.7k/mo**、OpenAlternative **~$80k/yr**、Nomad List **~$360k/yr**;featured $49–149/mo | tools 目录站 | 需先有流量 | ✅ |
| 6 | 赞助/featured 位 | flat/CPM | 利基 B2B CPM **$80–200**;小受众 $250–1,000/位 | 内容站流量 | 需先有受众 | ✅ |
| — | x402 按次付费 | agent 微支付 | $0.005–0.25/次;个人案例 $1.5–2.4K/mo | 检查器 API | 需 agent 需求(现薄) | ✅(收款方) |

## 头号产品详解:Agent-Ready Verified 徽章 ⭐

**为什么是它**:扫描器**已经算出通过/分数**——把"通过"包装成可嵌入的徽章 + 一个公开验证页,是**近零边际成本**的产品。这正是 Futurepedia-Verified($497)/ TrustedSite 的打法,套在一个**全新、无人占据的品类**(agentic-commerce readiness)上。

**怎么运作(全 Cloudflare 可落地,复用 AgentReady worker)**:
1. 商家扫描达标(如 ≥75/B)→ 付费($149–497 一次,或 $9–29/mo"活验证")。
2. 我们发一枚 **徽章 SVG**(`/badge/<id>.svg`,camo 缓存)+ 一个**公开验证页** `/verified/<id>`(显示域名、分数、验证日期、复验状态)。
3. **月费档的护城河 = 活验证**:每月自动复扫,站点回归到不达标→徽章自动"降级/失效"→这就把一次性变成**有理由续费的经常性收入**,且防伪(徽章链回我们验证页,数据实时)。
4. 收款走 **MoR(Creem/Polar)**,零牌照、代税;webhook→发徽章 id+token(复用已建的 billing webhook + token 机制)。

**定价测试**:一次性 $149 / 活验证 $19/mo(对标 TrustedSite $39、Futurepedia $497)。

**风险/前提**:徽章的价值取决于它对买家/agent"有意义"——需早期建立可信度(先给早期站免费发、写清评判标准、公开方法论)。这是唯一真正的软肋,但不涉及合规。

## 推荐落地顺序

1. **徽章(#1)+ 审计(#2)**:都变现扫描器**现有输出**,几天到第一笔钱,零牌照,互相强化(免费扫→不达标→买审计→修复→买徽章)。**先做这两个。**
2. **监控订阅(#3,已建成)**:配 Resend+Creem 即活;$29–99 档已被 Otterly/Trakkr 验证。
3. **用量计费 API(#4)**:把 `/api/wellknown`+生成器做成预付 credits 的 API(Polar credits / Stripe metered),free 档限流到"原型阈值"(~1000 次/月)逼真实用量付费。可叠加 x402 做 agent 轨道。
4. **目录付费收录(#5)/ 赞助位(#6)**:等 tools 站/内容站流量够了再做(winner-take-most,但先要流量)。

## 反指(与前一份一致)

- **别赌 x402 当支柱**:个人案例仅 $1.5–2.4K/mo,总量半数自刷;当可选轨道。
- **别做 feed/onboarding 收费**:Shopify 免费原生开通、ACP 已弃用,痛点被平台送了。
- **别碰**支付轨道/托管/escrow/GMV 分成/加密兑换——触发 MTL/MSB。
- **企业级 GEO(Profound $1B、Peec $10M)不在 solo 射程**:它们的护城河是企业数据管道 + 销售队伍,不是检查器。solo 的护城河永远是**内容分发 + 利基聚焦**(Trakkr 单人 $79–399 与独角兽同场竞争就是证明)。

## 关键洞察(为什么这次的答案比"卖 API"更硬)

调研反复指向同一件事:**真正赚钱的是"经常性 + 复用现有输出 + 免牌照",不是新技术**。我们手里最值钱的不是又一个生成器,而是**扫描器的"判定"**——它天然能变成①徽章(信任品)②审计(交付物)③监控(订阅)三种已被市场验证会付费的形态。x402 是未来期权,不是现在的现金。

## 来源(要点)
徽章:Futurepedia Verified $497、TrustedSite $39/mo+Growjo 营收、Norton/DigiCert(dailystory);审计:Illucrum $197–597、WE-DO $1,997 含 AI-citation、GEO 审计 $500–2,000(rankai/demandlocal);监控:Otterly $29 / Trakkr $79–399 / Peec $10M ARR(techcrunch、otterly、trakkr);API:ScreenshotOne $200K ARR(starterstory)、Scrape Creators $10K MRR(indiehackers)、Firecrawl credits、x402 金融 API $1.5–2.4K/mo(note.com);目录:SaaSHub/OpenAlternative/Nomad List(indiehackers)。完整链接见本轮三路调研原始输出。
