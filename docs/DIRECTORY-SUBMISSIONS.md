# 工具目录 / 外链收录清单（供你本人提交）

> 目的：让新工具与内容被工具目录站收录 → 反向链接 + 转介流量 + GEO 引用。
> 说明：大多数目录需要人工提交（有的免费、有的付费加速）。我不代提交表单；下面是清单和现成文案，由你逐个提交。标注【可自动化】的项可由 Claude 在会话里准备好 PR/文件，你只需从自己账号确认提交。

## 可提交的资产 URL（2026-08 更新）

| 资产 | URL | 一句话简介（提交时用） |
|---|---|---|
| **x402 APIs（新）** | https://x402.agiscorecard.com | Pay-per-call scan APIs for AI agents: $0.005/call in USDC on Base via x402 — no account, no API key, failed calls never charged. |
| **MCP Pulse remote MCP server（新）** | https://mcppulse.agiscorecard.com/mcp | Remote MCP server (streamable HTTP, no auth): scan websites for AI-agent visibility and health-check MCP servers from any MCP client. |
| **Gemini CLI extension（新，repo 内 integrations/gemini-cli/）** | https://github.com/f-tiger/sellSomething | "agentic-commerce-tools": Gemini CLI extension wrapping the remote MCP server above. |
| Agentic Tools（工具 hub） | https://tools.agiscorecard.com | Free browser tools for the AI-agent era: AI robots.txt, Product/FAQ schema, MCP config generators. |
| AI robots.txt generator | https://tools.agiscorecard.com/ai-robots-txt-generator | Allow or block GPTBot/ClaudeBot/PerplexityBot etc. and copy a ready robots.txt. |
| Product schema generator | https://tools.agiscorecard.com/product-schema-generator | Generate schema.org Product+Offer JSON-LD for AI shopping agents. |
| FAQ schema generator | https://tools.agiscorecard.com/faq-schema-generator | Generate FAQPage JSON-LD — most-cited structure in AI answers. |
| MCP config generator | https://tools.agiscorecard.com/mcp-config-generator | Generate Claude/Cursor config for a remote MCP server. |
| MCP Pulse（扫描器） | https://mcppulse.agiscorecard.com | Health-check any MCP server with a real protocol handshake. |
| AgentReady（扫描器） | https://agentready.agiscorecard.com | Free AI sales-visibility scanner for stores. |
| Agent Glossary | https://glossary.agiscorecard.com | Plain-English definitions for the AI-agent era. |
| AgentFront（等待名单） | https://agentfront.agiscorecard.com | Agent-native storefront template — early access. |
| Apify actors ×3 | （发布后补 Store URL） | 待发布：发布到 Apify Store 后本身就是目录曝光。 |
| VS Code / JetBrains 扩展 | （发布后补 Marketplace URL） | 待发布：Marketplace 本身即分发渠道。 |

---

## 新资产专项提交目标（2026-08，全部免费）

### 1. x402 生态（给 x402.agiscorecard.com）

- **x402 官方 ecosystem 页**（x402.org/ecosystem，源码在 github.com/coinbase/x402）——【可自动化：Claude 可备好 PR】
  步骤（来自 coinbase/x402 仓库 `typescript/site` README 的 "Adding your project to the ecosystem"）：
  1. Fork https://github.com/coinbase/x402
  2. 新建 `typescript/site/app/ecosystem/partners-data/agiscorecard-x402/metadata.json`，字段：`name`、`description`、`logoUrl`、`websiteUrl`（https://x402.agiscorecard.com）、`category`（选 "Services/Endpoints" 一类，须匹配官方类别列表）
  3. Logo 放 `typescript/site/public/logos/`
  4. 提 PR，官方约 5 个工作日内审核
- **x402 Bazaar（Coinbase CDP 的 x402 服务发现索引）**——【接入后自动】
  Bazaar 索引的是通过 **Coinbase CDP facilitator**（`https://api.cdp.coinbase.com/platform/v2/x402` 一族）结算且标记为可发现的资源。我们的 Worker 已支持自定义 `FACILITATOR_URL`：把 facilitator 配成 CDP 的并按其文档启用 discovery，即被自动收录，无需单独提交。文档：docs.cdp.coinbase.com/x402（本沙箱无法访问，提交前你在浏览器里核对最新流程）。
- **Agent.market 等 agent 服务市场**——【手动，先核实】
  https://agent.market （沙箱无法访问，无法核实其当前提交流程；打开后找 "list your API/agent" 入口）。同类可顺手检查：x402scan.com、fewsats 等 x402 索引站是否有免费收录入口。
- 我们自己的 `/.well-known/x402` 目录端点已上线——任何爬 x402 well-known 的索引器都能自动发现（零操作）。

### 2. MCP 目录（给 mcppulse.agiscorecard.com/mcp 远程服务器）

- **MCP 官方 Registry**（registry.modelcontextprotocol.io）——【可自动化：CLI 发布】
  用官方 `mcp-publisher` CLI + GitHub 身份验证发布 server.json（remote/streamable-http 类型，url 填 https://mcppulse.agiscorecard.com/mcp）。**发布到官方 registry 后，Glama、PulseMCP、mcpmarket 等聚合站会自动镜像收录**——一次发布，多站曝光,优先做这个。
- **mcp.so**——【手动】站内 "Submit" 入口（或其 GitHub chatmcp/mcp-directory 提 issue/PR）。
- **glama.ai/mcp**——【基本自动】自动索引官方 registry 与 GitHub；发布 registry 后到 glama.ai/mcp/servers 认领即可。
- **mcpmarket.com**——【基本自动】同样镜像官方 registry；有独立 submit 表单可加速。
- **awesome-mcp-servers**（github.com/punkpeye/awesome-mcp-servers）——【可自动化：Claude 可备好 PR】
  按字母序在对应分类加一行：`- [MCP Pulse](https://mcppulse.agiscorecard.com/mcp) - Scan websites for AI-agent visibility and health-check MCP servers.`，遵守其 CONTRIBUTING 格式。
- 已在旧清单中的：smithery.ai、mcpservers.org、pulsemcp.com、cursor.directory —— pulsemcp 会从官方 registry 自动拉取；其余手动。

### 3. Gemini CLI 扩展发现（给 integrations/gemini-cli/）

- **GitHub topic `gemini-extension`**——【可自动化（需先拆库）】
  Gemini CLI 扩展按"仓库根目录含 gemini-extension.json"安装、按 GitHub topic 被发现。需要先把 `integrations/gemini-cli/` 拆成独立公开仓库（建议名 `agentic-commerce-tools`），然后在仓库设置里加 topic `gemini-extension`。拆库 + 打 topic 都可由 Claude 用 GitHub 工具完成，你确认即可。
- **geminicli.com/extensions 官方 gallery**——【手动，先核实】拆库后查看 gallery 的收录说明（google-gemini/gemini-cli 仓库 docs/extensions/ 有 Extension releasing 文档）。

### 4. 待发布资产（发布本身就是最大的目录动作）

- **Apify Store**：3 个 actor 从 Apify 控制台点 Publish——【手动，需你的 Apify 账号】发布后自动获得 Store 页面 + 搜索流量。
- **VS Code Marketplace / Open VSX**：`vsce publish`（需你的 publisher token）——【半自动】。
- **JetBrains Marketplace**：控制台上传——【手动】。

---

## 通用目录站清单（按相关度，沿用）

### AI / 工具综合目录
- theresanaiforthat.com（There's An AI For That）— 最大 AI 工具目录，提交你的三个工具/扫描器
- futurepedia.io / futuretools.io
- aitools.fyi、toolify.ai、aitoolhunt.com、tinystartups、saashub.com、alternativeto.net
- Product Hunt（发布日集中流量，单独排期）
- BetaList、uneed.best、toolpilot.ai

### 电商 / GEO 相关（给 AgentReady + schema 工具）
- Shopify App Store（如后续做成 App）、GEO/AEO 工具合集类文章（联系作者补录）

### 开发者
- GitHub topics/awesome-lists、Hacker News（Show HN，见 LAUNCH-KIT.md E1）、dev.to（见 LAUNCH-KIT.md E4 大纲）、Indie Hackers Products

## 提交模板（英文，直接粘）

**Name**: Agentic Tools — free tools for the AI-agent era
**Tagline**: Generate AI robots.txt, Product/FAQ schema JSON-LD, and MCP client config — free, no signup, in your browser.
**Category**: Developer Tools / SEO / AI
**Description**: A set of free browser-based utilities for teams preparing for AI agents and AI search: an AI robots.txt generator (control GPTBot/ClaudeBot/PerplexityBot access), schema.org Product and FAQ JSON-LD generators, and an MCP client config generator. Pairs with free scanners for stores (AgentReady) and MCP servers (MCP Pulse).

**Name**: x402 APIs by agiscorecard
**Tagline**: Pay-per-call scan APIs that AI agents can pay autonomously — $0.005/call in USDC, no account.
**Category**: APIs / AI Agents / Payments
**Description**: Two scan APIs (website agent-readiness, MCP server health) exposed via the x402 payment-required protocol: an agent calls the endpoint, receives machine-readable payment requirements over HTTP 402, pays $0.005 in USDC on Base, and gets the result in the same flow. No signup, no API key; failed scans are never charged. Machine-discoverable catalog at /.well-known/x402.

## 节奏
每周提交 3-5 个目录（避免一次性触发反垃圾），优先级：MCP 官方 Registry（一次发布多站镜像）→ x402 ecosystem PR → awesome-mcp-servers PR → 其余手动目录。配合 LAUNCH-KIT.md 的社区发帖，持续 6-8 周。收录带来的反链会同时提升 SEO 域名权威与 GEO 引用概率。
