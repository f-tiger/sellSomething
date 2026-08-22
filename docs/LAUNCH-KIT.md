# 发布物料包(Launch Kit)

> 说明:以下文案供**你本人以真实身份**发布。我不代发到任何社区/社媒——自动灌水违反社区规则也会砸品牌。
> 站群的"自动化营销"是在**自有网站**上持续运转的部分:每周自动更新的两个 Index(内容飞轮)、可嵌入徽章(增长回路)、GEO/SEO 结构化数据。对外冷启动靠你在开发者聚集地真实互动。

发布顺序建议:先发 MCP Pulse(开发者产品,冷启动最快),1-2 周后再发商家侧的 DTC Index。

---

## A. MCP Pulse —— 发到哪里

| 渠道 | 为什么 | 注意 |
|---|---|---|
| **r/mcp / r/modelcontextprotocol** | MCP 开发者聚集地 | 以"我做了个免费工具"口吻,先给价值(附几条真实扫描发现),别硬广 |
| **Hacker News (Show HN)** | dev 工具最佳冷启动 | 标题 `Show HN:`,正文第一人称讲动机,回帖要快 |
| **MCP 官方 Discord / GitHub Discussions** | 核心用户 | 在 #showcase 类频道分享 |
| **X / 打 #MCP #buildinpublic** | 持续曝光 | 用线程 + 徽章截图 + 榜单数据 |
| **Product Hunt** | 一次性流量峰值 | 排期到周中,备好 gallery 图 |
| **工具目录**:tooldirectory.ai、mcp.so、glama.ai/mcp、smithery | 长尾 + 反链 | 提交收录 |

### Show HN 文案
**标题**:`Show HN: MCP Pulse – health-check any MCP server with a real protocol handshake`

**正文**:
> I kept finding MCP servers that "worked" but silently lost agent usage — slow handshakes, undocumented tools, missing serverInfo. So I built MCP Pulse: paste a streamable-HTTP MCP endpoint and it runs a real JSON-RPC `initialize` + `tools/list` handshake, then scores conformance, tool-description coverage, latency, TLS and auth posture 0–100 with concrete fixes.
>
> It's not a ping — it speaks the protocol. Cloudflare's public docs server scores A/94 at 27ms; plenty of others fail on missing tool descriptions (agents pick tools by description, so that's real lost usage).
>
> Free, no signup, runs on Cloudflare Workers. There's also an embeddable README badge and a weekly Public MCP Server Index. Would love feedback on the scoring rubric — what conformance signals am I missing?
>
> https://mcppulse.agiscorecard.com

### r/mcp 帖(带真实数据,直接可发)
**标题**：`I scanned 32 popular MCP servers with a real handshake — 72% require auth, and the public ones all cap at the same score`

**正文**：
> I built a scanner that does a real JSON-RPC `initialize` + `tools/list` handshake (not a ping) and ran it against 32 popular MCP servers. Findings this week:
>
> • **23 of 32 (72%) require auth** — Notion, Linear, Sentry, Stripe, GitHub etc. sit behind OAuth. The openly-introspectable surface is way smaller than registry counts suggest.
> • **The 6 public ones all score 94/100** — every one docked the same 5 points for answering `initialize` without auth. Cloudflare Docs, Hugging Face, Context7, Microsoft Learn, DeepWiki, AWS Knowledge.
> • **Handshake latency spread is ~40×** — 16ms (Cloudflare) to 639ms (AWS Knowledge). Agents chain calls, so that compounds.
> • The thing that actually varies and predicts whether agents call your tools: **tool description coverage.**
>
> Live data (updates weekly, free JSON): https://mcppulse.agiscorecard.com/mcp-ecosystem-report
> Scan your own server: https://mcppulse.agiscorecard.com
>
> What conformance signals should I be scoring that I'm not? Genuinely want feedback on the rubric.

(给价值优先,提问结尾邀请讨论——比硬广转化高得多。附徽章 markdown 邀请大家扫自己的服务器回帖比分,UGC 自然滚动。)

### X 线程(5 条)
1. Most MCP servers I test "work" — but agents quietly skip them. Undocumented tools, slow handshakes, no serverInfo. So I built a scanner that speaks the protocol. 🧵
2. MCP Pulse runs a real JSON-RPC `initialize` + `tools/list` handshake and scores your server 0–100: conformance, tool docs, latency, TLS, auth. Not a ping — an actual MCP client. [截图]
3. Why tool descriptions matter: agents choose tools by their descriptions, not their code. An undocumented tool is invisible in an agent workflow. MCP Pulse flags the exact % missing.
4. Drop a live badge in your README — it re-scans and updates itself: `[![MCP Pulse](.../api/badge?url=YOUR_ENDPOINT)]` [徽章截图]
5. Weekly Public MCP Server Index (who's healthiest) + free scanner, no signup, on Cloudflare Workers 👉 https://mcppulse.agiscorecard.com

---

## B. DTC AI Visibility Index —— 商家侧内容飞轮

**角度**:数据故事,不是广告。"我们扫了 40 个头部 DTC 品牌能否被 AI 购物代理看见"。

**渠道**:r/ecommerce、r/shopify、Indie Hackers、X 打 #ecommerce #AIsearch、电商 newsletter 投稿。

**X 线程开头**:
> We scanned 40 leading DTC brands (Casper, Away, Glossier…) to see if AI shopping agents can actually recommend them. Average score: 74/100. The #1 thing even top brands get wrong: missing Product/Offer schema. 🧵
> Full ranking (updated weekly, free data): https://selltoagents.agiscorecard.com/ai-visibility-index

---

## C. 站上已运转的自动化(无需你操作)

- **每周一 06:00 UTC**:DTC Index + MCP Server Index 自动重扫、更新、部署(两个可引用数据飞轮)
- **每周一 07:00**:ops 健康与漏斗周报入库 `docs/ops/`
- **每周一 09:00**:优化 Routine 读数据 → 执行优化 → 给你中文周报
- **徽章增长回路**:每个采用徽章的开发者 = 一条指向 mcppulse 的反链 + 品牌曝光
- **GEO**:全站 llms.txt / agents.md / 结构化数据 / 开放数据集 → 被 AI 引擎引用

## D. 冷启动纪律(来自本项目的调研)
- 100+ 独立开发者失败复盘的共识:**失败主因是分发弱,不是产品差**。工具建好只是 20%,80% 是持续在开发者聚集地真实出现
- 不要买流量、不要水军、不要精确关键词堆域名——AI 时代这些都不吃了,品牌实体 + 真实价值 + 可引用数据才复利
- 一周至少 1 次真实社区互动(答一个 MCP 问题、发一条榜单发现),坚持 8-12 周看拐点

---

# x402 / agent-economy launch pack (2026-08)

> 供你本人手动发布;不代发。所有事实以今日为准:x402.agiscorecard.com 已上线($0.005/call、USDC on Base、x402 v2+v1、无账号、扫描失败不扣费);免费版扫描器 agentready / mcppulse 一直免费。**不要编造任何数字**(收入、调用量、用户数一律不提)。

## E1. Show HN 草稿

**标题**:`Show HN: Our scanner APIs now accept payment from AI agents (x402, $0.005/call, no signup)`

**正文**:
> I run two free scanners: one scores any website 0–100 on visibility to AI shopping agents (robots.txt AI-crawler access, llms.txt, JSON-LD…), the other health-checks remote MCP servers with a real `initialize` + `tools/list` handshake.
>
> The free browser versions stay free. What's new: I wrapped both as pay-per-call APIs that an AI agent can pay for autonomously — no account, no API key, no card form. Each call is $0.005 in USDC on Base via the x402 protocol (the revived HTTP 402 "Payment Required" flow originated by Coinbase).
>
> How it works: call `GET https://x402.agiscorecard.com/api/scan?url=…` with no payment → you get a 402 whose header/body carry machine-readable payment requirements (x402 v2 and v1 emitted simultaneously for client compat). The client signs an EIP-3009 USDC `transferWithAuthorization` and retries; settlement happens only after a successful scan — failed scans are never charged. `@x402/fetch` automates the whole loop. There's also a free machine-readable catalog at `/.well-known/x402`.
>
> Implementation notes: it's a single Cloudflare Worker, no SDK dependencies — the 402 challenge/verify/settle flow is implemented directly against the x402 spec.
>
> I have no idea yet whether autonomous agents will actually spend money here; that's the experiment. Curious what HN thinks about per-call stablecoin pricing vs API keys + monthly billing for machine customers.

**作者首条评论(发帖后立刻自己回一条)**:
> Author here. A few honest caveats up front: (1) the underlying scans are also available free in a browser — the paid endpoints exist for *unattended* agents that can't sign up for anything; (2) pricing is $0.005/call, chosen to be roughly "not worth the friction of an account"; (3) x402 v2 and v1 are both supported because client libraries are split right now. Happy to answer anything about implementing the 402 flow on Cloudflare Workers without the official SDKs.

## E2. r/mcp 草稿(r/modelcontextprotocol 通用)

**标题**:`We put our MCP health checker behind a remote MCP server + an x402 pay-per-call API`

**正文**:
> MCP Pulse (free browser scanner that runs a real JSON-RPC `initialize` + `tools/list` handshake against any streamable-HTTP MCP endpoint and scores conformance/latency/tool-doc quality 0–100) now has two machine-facing frontends:
>
> 1. **A remote MCP server** at `https://mcppulse.agiscorecard.com/mcp` (streamable HTTP, no auth) — add it to Claude/Cursor/Gemini CLI and ask "health-check my MCP server at <url>". There's also a Gemini CLI extension wrapping it.
> 2. **An x402 pay-per-call endpoint** at `https://x402.agiscorecard.com/api/mcp-check?url=…` — for autonomous agents with a wallet: $0.005 in USDC on Base per call, no account or API key, never charged on failed scans. Free discovery catalog at `/.well-known/x402`.
>
> The browser version stays free: https://mcppulse.agiscorecard.com — happy to run a scan on your server in the comments and share what it flags.

**r/ClaudeAI 变体标题**:`Added our MCP server health checker as a remote MCP server you can plug into Claude` —— 正文同上,把第 1 点放最前并加一句 Claude 配置示例(`claude mcp add --transport http mcppulse https://mcppulse.agiscorecard.com/mcp`),x402 部分压缩为一句。

## E3. X/Twitter 英文线程(每条 ≤280 字符)

1/ Our APIs now accept payment from AI agents. No signup, no API key, no card form — an agent pays $0.005 in USDC per call via the x402 protocol and gets its result in the same request-response.

2/ Two endpoints, both live: a website agent-readiness scan (robots.txt AI-crawler access, llms.txt, JSON-LD, 0–100 score) and an MCP server health check (real initialize + tools/list handshake). https://x402.agiscorecard.com

3/ How x402 works: call the API with no payment → HTTP 402 with machine-readable requirements → client signs a USDC transferWithAuthorization → retry → result + on-chain settlement receipt. The official "x402/fetch" npm client does the whole loop automatically.

4/ Fairness rule we think every machine-payable API should adopt: settle only after success. A failed scan is never charged. The whole catalog is machine-discoverable at /.well-known/x402 — an agent can find, price, and buy the API without a human.

5/ The human versions stay free, no signup: https://agentready.agiscorecard.com (websites) and https://mcppulse.agiscorecard.com (MCP servers). The experiment: will autonomous agents spend money when the price is below account-creation friction? We'll share what happens.

## E4. dev.to 文章大纲

**标题**:`Selling an API to a customer that can't sign up: x402 pay-per-call on Cloudflare Workers`

1. **The problem** — autonomous agents can't do OAuth, card forms, or "verify your email"; API keys assume a human in the loop. What a machine-native checkout has to look like.
2. **x402 in one page** — the revived HTTP 402 flow: challenge (payment requirements) → signed EIP-3009 USDC authorization → verify/settle via a facilitator; v1 vs v2 wire differences (headers vs body, `base` vs `eip155:8453`) and why we emit both at once.
3. **Implementation walkthrough** — a single Cloudflare Worker, zero npm dependencies: constructing the dual-version 402, reading `PAYMENT-SIGNATURE` / `X-PAYMENT`, settling *after* the upstream scan succeeds so failures are never charged, returning the receipt in `PAYMENT-RESPONSE`.
4. **Discovery for machine buyers** — `/.well-known/x402` catalog, llms.txt/agents.md, and listing in agent-facing indexes; why "can an agent find and pay you" is the new SEO.
5. **Pricing thoughts** — $0.005/call: below the friction cost of an account; per-call stablecoin vs subscription for machine customers.
6. **Try it** — curl the 402 yourself, `?demo=1` note if applicable, links to the free browser versions; honest closing: this is an experiment, no traction numbers to report yet.


---

## Viral game assets（2026-08-22 新增，owner 手发；两页均已上线且 CI 冒烟覆盖）

分享型互动资产，适合社交/社区分发（发帖时直接玩给人看，别硬广）：

- **⚔️ Brand Battle** — https://selltoagents.agiscorecard.com/brand-battle
  真实周更数据驱动的品牌 AI 可见性对战；深链格式 `?a=nike.com&b=adidas.com` 可预设任意对局。
  X 发帖角度：挑一场当日有话题性的对局（如两家正在打广告战的品牌），配一句结果 + 链接；
  r/ecommerce 角度："We scanned 122 DTC brands weekly for AI-agent visibility — here's a head-to-head tool"（附方法论页链接，先给数据再给玩具）。
- **🧦 AI Shopper Simulator** — https://agentready.agiscorecard.com/ai-shopper
  喜剧文字冒险：AI 买家 Percival 在你的店里因缺 llms.txt/schema 连环受挫；6 个评级结局各带专属分享文案。
  X 发帖角度：直接发自己玩出的 F 结局分享卡（自嘲式最有效）；
  HN 角度：不适合单发（游戏帖难过审），可作为 x402/agent-readiness 主帖的附注链接。
- **📊 Brand reports hub** — https://selltoagents.agiscorecard.com/brands/
  122 个品牌各自的程序化报告页；社区答题时可直接引用具体品牌页（比引用首页更可信）。
