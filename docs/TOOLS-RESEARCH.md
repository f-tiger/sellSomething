# 工具方向调研与决策(2026-07-21)

> 目标:找到适合我们(域名权威已在 AI/agent/GEO/MCP)**快速起量、能被工具目录站收录导流**的工具方向,给出"做/不做" + 优先级。
> 方法:三路并行真实网络检索(目录机制 / 高流量原型 / 与现有资产互补的空档)。下方结论已交叉验证。

## 一句话结论

**别再做"通用型"工具(schema/robots/sitemap/OG 生成器、llms.txt 校验器、agent-readiness 打分器)——这些在 2026 已被免费巨头商品化(Google Lighthouse 收了 llms.txt 检查;Cloudflare `isitagentready.com` 收了 agent-readiness 打分)。** 我们的空档在**"检测之下游"**:为**刚出现、巨头只打分不生产**的新规范做 **生成器 / 转换器 / 校验器**,并用一个**MCP 健康目录**吃目录/搜索流量,全部导回现有扫描器(AgentReady / MCP Pulse / AgentFront)。

## 关键竞争现实(先读)

1. **Cloudflare `isitagentready.com`**:免费 0–100 Agent Readiness 打分,16 项检查、5 层(可发现性/内容/爬虫访问/能力/商务),已内置进 URL Scanner。**直接覆盖了通用 agent-readiness 打分,还碰了 MCP 与 ACP/UCP/x402 商务。** → 别做通用打分器的免费克隆。
2. **Google 把 llms.txt 检查加进 Chrome Lighthouse "Agentic Browsing" 审计**(2026-05)→ llms.txt 校验被商品化。
3. **规律**:巨头**只"检测/打分"**这些新规范,**不给你"生成/修复"工具**。这就是我们的进入点。
4. **目录/GEO 规律**:2026 目录的真正价值是进入 ChatGPT/Perplexity/AI Overviews 的**被引语料**;精选 3–6 个匹配目录 > 群发 200 个;AI 引用收益(几天)远快于传统 SEO 反链收益(6–12 周)。MCP 生态是当前**最不饱和**的收录通道。

## 决策表(候选 × 优先级)

图例 — 需求:高/中/低。竞争:低=有空间 / 中 / 巨头=Google/Cloudflare/融资 SaaS 占据。纯前端:能否零后端浏览器端实现。

| 优先级 | 工具 | 需求 | 竞争 | 纯前端 | 与主线协同(导流到) | 结论 |
|---|---|---|---|---|---|---|
| **P0** | **商品 feed → ACP/UCP JSONL 转换器+校验器**(上传 GMC CSV/XML → 合规 gzip JSONL,补齐 ChatGPT feed 缺的字段) | 中↑ | **低**(有校验器,**没有转换器**) | 是(纯文件变换) | **AgentReady / AgentFront**(主力验证方向) | **做** |
| **P0** | **MCP Server Card 生成器+校验器**(`/.well-known/mcp/server-card.json`) | 中↑ | **低**(巨头只检查、不生成) | 是 | **MCP Pulse**(生成后→握手验证+徽章) | **做** |
| **P0** | **ARD `ai-catalog.json` 生成器+校验器**(Agentic Resource Discovery 清单) | 中(新) | 低(2026-06-17 才发布;少量 indie) | 是(实时抓取用 Worker) | **MCP Pulse**(清单列出 MCP 端点→健康检查) | **做,趁早** |
| **P1** | **Agentic-commerce Schema 包**(一次性 6 类:Product/Offer/AggregateRating/Review/FAQPage/**MerchantReturnPolicy**) | 中 | 中(单类型饱和,**打包无人做**) | 是 | AgentReady;扩现有 Product/FAQ 生成器 | 做(扩现有) |
| **P1** | **A2A Agent Card 生成器+校验器**(`/.well-known/agent-card.json`) | 中 | 中(已有多个 indie) | 是 | 补齐"well-known 三件套",互链 MCP Pulse | 可做 |
| **P1** | **统一 well-known 发现检查器**(一次查 ai-catalog + server-card + agent-card + llms.txt) | 中 | 有 Cloudflare 重叠风险 | 是 | 聚合器,把每个失败项路由到对应生成器 | 可做(做完 P0 后) |
| **P2** | **MCP 健康目录/榜单**(公开、可提交、实时健康徽章,按 MCP Pulse 握手数据排名) | 中↑ | **无**(注册表只记"存在",不排"健康") | 否(需后端,我们有 Workers+KV) | **最大流量引擎**:内容飞轮 + 提交收录反链,由 MCP Pulse 数据驱动 | 做(更大工程) |

## 明确不做(巨头占据 / 已商品化)

- 通用 schema/JSON-LD 生成器(head 类型)、sitemap、robots.txt、OG/meta 生成器 —— 十几个免费克隆 + Google 官方。已做的当"标配功能"留着,别当引流主打。
- **llms.txt 校验器 / 生成器** —— Google Lighthouse + 10+ 工具。
- **AI 爬虫 / robots 访问检查器** —— Cloudflare + 一堆。
- **通用 agent-readiness 扫描器** —— Cloudflare `isitagentready.com`(注意:这和我们 AgentReady 的 `/api/scan` 重叠,AgentReady 是已拥有的防御资产,但**别再出免费克隆**去和巨头正面撞)。
- **"被 ChatGPT/Perplexity 引用没"/品牌提及追踪** —— 后端+多 LLM 成本重、且饱和(Profound/Otterly/LLM Pulse)。最多做成邮箱换取的 lead magnet,别做免费工具。
- **通用 MCP inspector / config 校验器** —— 官方 Inspector + MCPJam + DevTk 已占。(我们的 MCP config **生成器**仍有位置,但别再做通用校验器。)
- FAQ schema 生成器 —— 2026-05 富结果下线后需求下滑;只做"废弃感知"的校验角度。

## 目录收录清单(按相关度,配合导流)

- **MCP 专项(最不饱和,先上)**:官方 Registry(权威上游)→ mcp.so、smithery.ai、glama.ai/mcp、给 punkpeye/awesome-mcp-servers 提 PR。多为自动爬取/认领,门槛低。
- **AI 工具综合**:There's An AI For That(dofollow,人工审)、Futurepedia、Toolify、SaaSHub、AlternativeTo("alternative to X" 长尾 dofollow,常青)。
- **开发者**:DevHunt(dofollow,GitHub 登录过滤)、Show HN(nofollow 但高质量转介)、dev.to。
- **节奏**:精选 3–6 个匹配目录、完整资料 > 群发;每周 3–5 个,持续 6–8 周。

## 推荐执行顺序(全部纯前端、零 LLM 成本、可静态 Worker 部署)

1. **P0 三件**(feed 转换器 / MCP Server Card / ARD 清单)—— 空档最干净,每个都以"现在去扫描/健康检查"CTA 收口到 AgentReady 或 MCP Pulse。
2. **P1** Schema 包(扩现有生成器)+ A2A Card,凑成"让 agent 发现你"套件;再加统一 well-known 检查器做聚合入口。
3. **P2** MCP 健康目录 —— 唯一真正吃"目录/搜索流量"的大工程,把 MCP Pulse 输出变成常青内容,留到 P0/P1 跑出数据后。

## 来源与可信度注记

- 目录 DR/dofollow/流量数字多来自提交指南类站点(有推广动机),硬核数字(MCP 官方 Registry 计数、glama Semrush 流量、GitHub star)已交叉核对;对外物料引用前需再核。
- Cloudflare 博客对 sandbox 返回 403,其 16 项/5 层/`isitagentready.com` 事实由搜索摘要 + 第三方(nohacks.co、tryvizup)一致佐证。
- 主要来源:developers.googleblog.com(ARD 规范)、blog.cloudflare.com(Agent Readiness)、agenticcommerce.pro(ACP feed 规范)、modelcontextprotocol.io + registry、context.dev(llms.txt 工具评测)、glama/smithery/mcp.so、theresanaiforthat/futurepedia/toolify 提交页。完整链接见本轮三路调研原始输出。
