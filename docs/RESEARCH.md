# 销售领域行业机会调研与方向决策(2026-07)

## 一、调研结论摘要

**核心判断:传统"AI 帮人卖货"赛道已经拥挤,而"帮商家把货卖给 AI(及 AI 背后的买家)"是刚刚打开、且随 AI 时代持续放大的空白地带。**

我们决策的组合方向:**Agentic Commerce Readiness(AI 代理销售就绪)工具 + 内容矩阵**,由 1 个核心工具站 + 2 个流量卫星站构成。

---

## 二、赛道排除:哪些不能做(太拥挤)

### 1. AI SDR / 冷邮件外呼自动化 ❌
- 2020 年不足 10 家,2024 年已超过 60 家专门的 AI SDR 平台;市场 2025-26 约 $4.3-5.2B,但**50-70% 的 AI SDR 工具在第一年内被退订**。
- 冷邮件平均回复率从 2023 年约 6.8% 跌至 2025-26 约 3.4-5%,Gmail/Microsoft 针对 AI 生成外呼模式持续加强过滤。
- 结论:红海 + 效果衰减 + 高流失,不适合自动化营收的独立开发者。

### 2. 横向 AI 写作/聊天机器人/会议纪要 ❌
- 写作助手类 1,200+ 家创业公司、中位数 MRR 仅 $7;2025.1-2026.3 之间超过 5,600 家 AI 创业公司关停。

### 3. 企业级对话智能(Gong/Chorus 领地)❌
- 企业市场被巨头锁定,销售周期长,不符合"容易落地执行并自动化营收"。

---

## 三、机会识别:为什么选 Agentic Commerce Readiness

### 宏观信号
- Morgan Stanley(2025.11):45% 美国消费者过去一月使用过 ChatGPT;IBM IBV(2026.1):45% 消费者已在购买流程中使用 AI。
- McKinsey 预测:到 2030 年 **$3-5 万亿**零售支出将由 AI 代理编排。
- Gartner 预测 2026 年传统搜索量下降 25%;Google AI Overviews 月触达 20 亿人,ChatGPT 周活 8 亿。
- Stripe+OpenAI 的 **ACP**(Agentic Commerce Protocol)、Google 的 **UCP**(Universal Commerce Protocol,NRF 2026 发布)、Anthropic 的 **MCP** 构成三大协议层;100 万+ Shopify 商家已被自动纳入 ChatGPT Shopping 与 Google AI Mode。

### 市场空隙
- 商家(尤其 SMB/中型电商)**已经"被动上架"到 AI 购物渠道,但完全不知道自己的产品数据是否能被 AI 选中**——结构化数据、robots.txt 对 AI 爬虫的许可、llms.txt、schema.org Product/Offer 标注,决定了 AI 是否推荐你。
- GEO(生成引擎优化)工具市场刚起步:Profound 等面向企业,**SMB 自助式、免费即时体检的工具位仍是空白**(对标当年 SEO 时代的 Woorank/Ahrefs 免费站点体检获客路径)。
- 这不是"又一个 AI 套壳",而是 AI 时代的"新 SEO"基础设施位:搜索时代的 SEO 工具养活了一个千亿产业,AI 代理购物时代的"AEO/GEO 工具"就是那个 10x-100x 的对位。

### 为什么符合三条目标
1. **容易落地执行**:核心扫描逻辑 = 抓取目标站的 robots.txt / llms.txt / HTML,静态分析规则打分,一个 Cloudflare Worker 即可实现,零成本运行。
2. **可自动化营收**:免费扫描获客 → 邮件捕获 → 付费深度报告/持续监控订阅(PLG 漏斗全自动);卫星站吃长尾搜索 + AI 引用流量,联盟与线索变现。
3. **随 AI 时代进化**:每当新协议(ACP/UCP/MCP)、新爬虫(GPTBot/ClaudeBot/PerplexityBot)、新购物入口出现,扫描器加一条规则、内容站加一篇指南,产品价值随 AI 生态膨胀而自然增长——生态越大,体检需求越大。

---

## 四、站群架构(本仓库)

| 站点 | 目录 | 定位 | 营收路径 |
|---|---|---|---|
| **AgentReady** | `sites/agentready` | 核心工具:输入网址 → AI 销售就绪度评分(0-100)+ 修复建议 | 免费扫描 → 邮件捕获 → 付费监控/深度报告 |
| **SellToAgents** | `sites/selltoagents` | 权威内容:ACP/UCP/MCP/llms.txt 商家指南与清单 | GEO/SEO 流量 → 导流主站 + 联盟/线索 |
| **CloseCalc** | `sites/closecalc` | 销售长尾工具:佣金/管道覆盖率/冷邮件 ROI/折扣计算器 | 长尾 SEO 流量 → 广告/联盟 + 导流主站 |

三站互链成矩阵:工具站建立品牌与转化,内容站建立权威与引用(反过来让 AI 引擎引用我们,自我验证),计算器站低成本收割长尾意图流量。

### 技术选型
- Cloudflare Workers + Static Assets(每站独立 `wrangler.jsonc`,零冷启动、零固定成本)。
- AgentReady 的 `/api/scan` 在 Worker 内直接 fetch 目标站点并分析,无需数据库即可 MVP;后续可加 D1 存历史评分 / KV 做缓存。

### 演进路线(10x 布局)
1. **现在**:免费体检工具 + 内容矩阵,积累邮件列表与"AI 可见性"数据。
2. **6 个月**:订阅制持续监控(每周重扫+告警)、竞品对比报告;接入 Stripe 收款。
3. **12 个月+**:成为"AI 渠道分发层"——帮商家生成/托管 llms.txt、产品 feed 转 ACP/UCP 格式、MCP storefront 服务器托管。即从"体检"进化为"代运营 AI 销售渠道",对位 2010 年代的 Shopify App 生态位。

## 五、来源
- Brilo AI: AI SDR & Outbound Automation Statistics & Trends 2026
- Digital Applied: AI SDR Agents 2026 Buyer's Guide
- BigIdeasDB: Best Niches for AI SaaS 2026 / Profitable Micro SaaS Ideas 2026
- eMarketer: FAQ on GEO and AEO 2026
- Search Engine Land: Mastering GEO in 2026
- JPMorgan Payments: Agentic Commerce
- commercetools / Google Cloud / Paz.ai: Agentic Commerce 2026 指南(ACP/UCP/MCP、Shopify 商家自动纳入 ChatGPT Shopping)
- MicroConf State of Independent SaaS 2025(90 天内上线者一年内盈利概率 2.4x)
