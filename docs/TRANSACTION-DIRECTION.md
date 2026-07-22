# 交易侧破局决策(2026-07-22)

> 目标:在真实交易/支付环节直接捕获营收(不是又一个等候名单),给单一破局推荐 + MVP + 合规红线 + go/no-go。
> 方法:三路真实检索(营收捕获机制 / 小团队可行性与合规 / 我们资产到首笔真实交易)。结论已交叉验证并调和分歧。

## 一句话结论(go)

**把我们已经建好的"服务端检查器"变成一个可付费的 API,用两条轨道卖同一样东西:**
- **主营收(真钱、免牌照、需求已验证)= Merchant-of-Record 卖 API 访问/额度**(fiat,Polar/Creem 代做税务与合规,我们是"卖自己软件的收款方",零牌照)。
- **前瞻布局(第一笔 agent 原生美元、极低成本)= 同一个端点挂 x402 收费**(agent 用 USDC 在 Base 上按次付,CDP facilitator 结算,列进 x402 Bazaar)。**当作抢跑的可选轨道 + 定位,不是营收支柱**——因为 x402 现在需求是"海市蜃楼"。

这既是"交易侧破局"(从等候名单→真实付费 API),又对齐了原始 /goal 的"提前布局未来 10 倍方向"(x402 抢跑)。

## 调和三路分歧(关键)

- 资产映射那路建议"先建 x402 paywall";但营收与可行性两路都强证据表明 **x402 当前需求极弱**:2026 年中约 **157M 累计笔但仅 ~$41M 总额、~$28k/天、约一半是自刷(wash)、集中在单一 provider**;Coinbase 自己的投资人都承认"需求还没来"。
- 所以正确解不是"x402 还是 MoR 二选一",而是:**同一个有用的东西(检查器 API)同时挂两条轨道**——fiat/MoR 收真钱,x402 抢位置。谁的需求先来就先收谁的钱。

## 钱到底在哪、谁能碰(综合)

| 机制 | 谁付 | 费率 | 结算 | 2026 真实性 | 小团队能碰? |
|---|---|---|---|---|---|
| ChatGPT Instant Checkout(ACP) | 商家 | **4%** + Stripe | 卡→银行 | 真有 GMV 但薄(~30 Shopify 商家),OpenAI 已在 3 月**弃用/转向** | ❌ 被 OpenAI/Shopify/Stripe 占,插不进费 |
| Perplexity Buy Now | 商家 | ~8–12% GMV(有争议) | 卡 | ~$2B 年化 GMV | ❌ 同上 |
| Visa/MC agent-pay | 商家 | 标准 interchange | 卡网 | 仅 pilot | ❌ |
| **MoR(Creem/Polar/LS)** | 终端买家(内含) | **3.9–5% + ~$0.4** | 平台→你银行 | **成熟、已验证** | ✅ **我们是卖方,零牌照** |
| **x402 按次付费 API** | 调用的 agent | **$0.005–0.25/次**(我们全拿,facilitator 收 $0.001) | USDC 到我们钱包 | 真有(CoinGecko/Apify)但美元额极小 | ✅ **收款到自己钱包=免牌照** |
| AI-工具 affiliate | 项目方(非商家) | 20–50% recurring(SaaS) | 标准返佣 | 可归因但**递延、有起付线**,且 AI 结账在**侵蚀 affiliate 归因** | ⚠️ 只当被动点缀 |

**合规红线(务必内化)**:一旦你**托管/转移别人的钱**就触发 money-transmitter(MTL)+ FinCEN MSB + KYC/AML,小团队做不了。安全区 = ①卖自己的产品/API(你是收款方)②MoR(它是法定卖方)③affiliate(不碰买家钱)④骑在持牌轨道上(Stripe/x402 facilitator)。**x402 收 USDC 到自己钱包卖自己服务 = 不算 transmitter**(合规在 facilitator)。

## 破局推荐(单一)

**"Agent-Ready Check API" —— 把 `/api/wellknown`(以及 AgentReady `/api/scan`、MCP Pulse 握手)打包成付费 API,双轨售卖。**

为什么是它:
- **复用已建资产**:服务端检查器是我们唯一"有后端、难克隆、agent 真的需要"的东西;把它从免费工具升级成可计费 API,是最短的"从工具到交易"路径。
- **需求已验证**:人们今天就为 API 付费(不是赌 agent 会付);fiat/MoR 路子 demand-real、免牌照。
- **抢跑未来**:同端点挂 x402 = 我们进入 agent 可自动付费的目录(Bazaar),赚"第一笔 agent 美元",并为 agent-commerce 成熟卡位。
- **子域已就位**:`x402.` / `pay.` / `wallets.agiscorecard.com` 早已 provision。

## MVP(全部 Cloudflare 可落地)

**产品**:`GET /api/wellknown?url=`(现成)+ AI-readiness 检查,结构化 JSON,分层计费。
1. **免费档**:限流的 teaser(给人和爬虫看,驱动发现,延续现有免费工具漏斗)。
2. **付费档 A — 人类/开发者(主营收,先做)**:MoR(**Polar** 4%+40¢ 或 **Creem** 3.9%+$0.40)卖"API key + 额度/credits"。买家刷卡 → MoR 发 webhook → 我们发/升级 API key(KV 存 key→额度)。**零牌照,MoR 代税。**
3. **付费档 B — agent(抢跑,后做)**:同端点在 `x402.agiscorecard.com` 用 `x402-hono` 中间件挂 402;agent 签 USDC 授权 → Worker 转 CDP facilitator `verify`+`settle`(Base 主网,gas 由 facilitator 赞助)→ USDC 落我们 Base 钱包;列进 **x402 Bazaar**。定价 **$0.005–0.01/次成功调用**。
4. **结算**:USDC 到专用 Base 收款地址(**别用交易所充值地址当 payTo**)→ 定期 sweep 到币安 off-ramp。

**代码 vs 需你配**:API key 计费、x402 中间件、MoR webhook→发 key 都是我能写到 turnkey 的代码;**你要提供**:MoR 账号+产品、CDP 免费 API key、一个 Base 收款钱包地址。照做即通,不需我再改码(同 BILLING-SETUP 模式)。

## 明确不做(坑)

- **当支付轨道 / 托管钱包 / P2P / 托管买家资金(escrow/stored value)** —— 全套 MTL+MSB,solo 不可能。
- **抽 retail checkout 的 GMV 分成** —— OpenAI(2–4%)/Shopify/Stripe 已占,插不进。
- **加密 on/off-ramp、USDC↔法币兑换即服务、FX/汇款** —— Coinbase/交易所的活,重牌照。
- **feed/onboarding 收费服务** —— Shopify 现已**免费**原生开通 ChatGPT 渠道、ACP 已弃用,你收费的痛点被平台免费送了。**塌方,别做。**
- **把 x402 当营收支柱** —— 现在需求 ~$28k/天、半数自刷;只当抢跑轨道。

## 现实反指 / 诚实

- **x402 现在赚不到什么钱**:别指望它带来营收;它的价值是**卡位 + 第一笔 agent 美元 + 学习曲线**。
- **加密税务摩擦真实**:USDC 收款=收到即计收入(+15.3% 自雇税),兑换=处置事件(Form 8949),微支付上千笔是记账噩梦 → 这是**主营收放 fiat/MoR、x402 放次位**的现实原因。
- **affiliate 归因在被 AI 结账侵蚀**:押 SaaS/工具类 affiliate(内容里放链接),别押会被 agent 绕过的零售商品 affiliate。
- **首笔"美元"来自谁不确定**:所以双轨并行,谁先来收谁。

## go/no-go

- **GO**:把服务端检查器做成**付费 API**;**MoR(fiat)为主营收先做**;**x402 为抢跑次轨后做**;affiliate 当被动点缀。
- **NO-GO**:支付轨道/托管/escrow;retail GMV 分成;加密兑换服务;feed onboarding 收费;把 x402 当支柱。

## 来源(要点)
x402:157M 笔/$41M/$28k 天/半数 wash(web3trackers、coindesk、bitget);CoinGecko $0.01/次、Apify 2万 Actors、中位 $0.028;CDP facilitator 免费 gas、收 $0.001/笔、收款免 KYC;`x402-hono` 在 Workers 可用(Cloudflare Agents docs)。ACP 4% 但 3 月弃用转 apps(CNBC、OpenAI)。Perplexity ~$2B GMV。MoR:Creem 3.9%+$0.40 / Polar 4%+40¢ / LS 5%+50¢。合规:MTL/MSB 触发于托管转移他人资金;卖自己 API 收款=免牌照(innreg、Cooley、Modern Treasury、Stripe SAQ-A)。affiliate:Jasper/Writesonic 25–40% recurring,但 AI 结账侵蚀归因(Affiverse)。完整链接见本轮三路调研原始输出。
