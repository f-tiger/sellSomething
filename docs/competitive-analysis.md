> 本文档由 createjob 会话的 deep-research 工作流产出，2026-07-19 随 AgentFront 一并合并入本仓库。

# 竞对深度调研报告：AI 可见性检测赛道还能不能做？

日期：2026-07-19 ｜ 方法：deep-research 工作流（5 路并行搜索 → 15 来源抓取 → 对抗验证）
标注说明：✅ = 三票对抗验证全数确认；⚪ = 单源论断（验证轮次因会话限额中断，来源均为可信出版物/官方页面）

## 一、结论先行：**调整定位**（不是继续原样做，也不是放弃）

原方案「AgentLens 免费检测器 + $9-29/月 SMB 订阅监控」被调研证伪了两个核心假设：

1. **"免费检测器是获客蓝海"→ 错**：一次性扫描已被巨头免费商品化；
2. **"$9-29/月监控是空档"→ 基本错**：HubSpot 已占 ~$50/月低价档，且整个"监控"品类存在信任危机。

但调研同时发现了**真正的空档**（见第四节）。三站资产不废弃，漏斗重排。

## 二、六个问题的调研答案

### 1) 检测器已被免费巨头商品化（对原方案最致命）

- ✅ **Cloudflare 免费 Agent Readiness 检测器**（isitagentready.com）：六大类评分（Web Presence / Discoverability / Content Accessibility / Bot Access Control / Protocol Discovery / Commerce），与 AgentLens 检查项高度重叠；已内嵌进 Cloudflare 控制台（AI Crawl Control → Directives），**所有 Cloudflare 客户被直接导流到官方工具**；
- ✅ 2026-05-12 起 Agent Readiness 评分并入 **URL Scanner API 免费开放**——连"给 Agent 调用的扫描 API"这个细分也被官方覆盖；
- ⚪ Search Engine Land 提供免费 AI Agent Readiness Checker（robots.txt/AI 爬虫/llms.txt 检查 + ChatGPT 提及率）；
- ⚪ HubSpot AEO Grader：免费、无需注册，五维评分。

### 2) $9-29/月 SMB 订阅监控的空档比预想小得多

- ⚪ 市场领导者定价：Profound $99 起/$399 成长版（代理商实付高达 $1,000/月）、Ahrefs Brand Radar $129-449/月——上方确实是高价；
- ⚪ **但 HubSpot 已经以 ~$50/月占据低价持续监控档**，且自带巨大 SMB 存量客群；
- ⚪ 同类工具至少 8 家在挤这个"比免费更进一步"的位置（ZipTie、MaxAEO、Scrunch、Semrush AI Toolkit、Adobe LLM Optimizer、Conductor…）。

### 3) 监控品类本身存在结构性信任危机（比拥挤更严重）

- ⚪ 同样的 prompt 跑三个工具得到三个不同结果（Digiday 引用代理商 CEO），买家把这类工具当"方向参考"而非"事实来源"；
- ⚪ AI 可见性无法点击归因到销售——订阅续费缺乏 ROI 证据，churn 风险高；
- ⚪ LLM 回答是概率性的：一次性扫描和低频 prompt 追踪都不可靠，可信监控需要高频采样（成本高，$9-29 价位难覆盖）。

### 4) 更根本：技术体检分数与真实 AI 可见性相关性弱

- ⚪ Search Engine Land 实证分析：AI 可见性与**站外品牌提及**的相关性最强，站内技术信号（robots.txt/llms.txt/schema）作用次要；Google 首页排名品牌只有 62% 出现在 ChatGPT 回答中——**我们的检测器量的是"容易量的东西"，不是"最重要的东西"**。

### 5) llms.txt 工具：高度商品化 + 需求疲软双杀

- ✅ WordPress.org 官方目录已有 **10+ 个免费 llms.txt 生成插件**，头部插件与 Yoast/Rank Math/SEOPress/AIOSEO 全打通；
- ⚪ 且多数插件激活量极低（200+/100+/10+ 级别）——供给密、需求弱，不值得再投入。

### 6) Agentic commerce 工具层：唯一仍然开着的窗口

- ⚪ 日本 Stellagent 2026-05 发布 Agentic Commerce Studio（商家 feed/库存/结算/webhook 对 Agent 流程的验证工具）——证明"商务就绪度工具层"有人做且可做；
- ⚪ 其市场聚焦日本/亚洲，**欧美 SMB 商家的 agent-commerce 就绪度工具在 2026-07 仍无明显占位者**；
- Stripe ACP、Shopify、Google AP2/UCP、Coinbase x402 都在做协议/基础设施层，未下场做"帮长尾商家接入"的工具层——巨头协议越多，长尾适配工具的空间越大（类比：Shopify 生态里的 app 开发者）。

## 三、决策矩阵（更新版）

| 方向 | 调研前判断 | 调研后判断 | 决策 |
|---|---|---|---|
| 免费 AI 检测器 | 获客蓝海 | 已被 Cloudflare/SEL/HubSpot 免费商品化 | 降级为引流资产，不作为产品 |
| $9-29/月监控订阅 | SMB 空档 | HubSpot $50/月压顶 + 品类信任危机 + 测量成本高 | **放弃**作为营收主线 |
| llms.txt 工具 | 早期红利 | 商品化+需求弱 | 维持现状，零投入 |
| **Agentic commerce 就绪度工具（欧美 SMB）** | 远期期权 | **唯一验证到的空档**，且有 Stellagent 先例证明可行 | **升级为主力方向** |

## 四、调整后的路线：从"评分"转向"接入"

核心洞察：**检测（告诉你缺什么）已免费商品化，但"帮你装上"没有。** 巨头做协议和评分，没人帮长尾商家真正变成 agent-ready。

1. **AgentFront 升级为主产品**（原"百倍期权"提前兑现）：面向欧美 SMB 商家的 agent-commerce 接入工具——机器可读目录生成、Product/Offer schema 一键生成、ACP/x402 就绪度校验、（后续）agent 可用的下单端点。对标 Stellagent 但吃欧美长尾市场；
2. **AgentLens 降级为获客漏斗**：免费扫描继续引流（已建成、零成本），扫描结果页把 CTA 从"订阅监控"改为"一键修复/接入"（导向 AgentFront 与 Builder）——从卖"分数"改为卖"修复"；
3. **不再投入**任何纯监控/纯 llms.txt 功能；
4. **验证指标**：AgentFront 等待名单（KV 中 `signup:agentfront:*`）是下一步投入的开关——名单增长才加码开发付费功能。
5. **内部重叠提醒**：本账号已有并行会话产物 agentready（同类检测器）、selltoagents 等——检测器赛道内部也在互卷，进一步支持把重心移到 AgentFront。

## 五、来源

- Cloudflare Agent Readiness（官方）：https://blog.cloudflare.com/agent-readiness/ 、https://developers.cloudflare.com/changelog/post/2026-04-17-tools-for-agentic-internet/ 、https://developers.cloudflare.com/changelog/post/2026-05-12-url-scanner-report-agent-readiness/
- Digiday（工具信任危机与定价）：https://digiday.com/marketing/marketers-question-expensive-ai-visibility-tools-as-inconsistent-results-fuel-skepticism/
- Search Engine Land（测量难点与站外相关性）：https://searchengineland.com/measuring-ai-visibility-geo-performance-hard-truths-467197 、https://searchengineland.com/tools/ai-agent-readiness-checker
- HubSpot 免费 Grader 与低价档分析：https://maxaeo.ai/blog/hubspot-free-ai-search-grader-aeo-tools/
- WordPress llms.txt 插件生态：https://wordpress.org/plugins/website-llms-txt/
- Stellagent Agentic Commerce Studio：https://www.prnewswire.com/news-releases/stellagent-launches-agentic-commerce-studio-for-ai-agent-shopping-readiness-302772393.html
