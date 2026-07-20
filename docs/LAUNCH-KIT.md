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

### r/mcp 帖
**标题**：`I scanned popular public MCP servers for conformance — here's what most get wrong`

**正文**：先甩榜单里的真实发现(如"X% 的服务器 tools/list 里工具没有描述""平均握手延迟 N ms"),再引出工具。给价值优先,链接放最后。附徽章 markdown,邀请大家扫自己的服务器回帖比分数——UGC 会自然滚动。

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
