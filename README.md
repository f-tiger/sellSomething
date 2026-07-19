# sellSomething — AI 时代销售站群

围绕 **agentic commerce(AI 代理购物)** 的三站矩阵:调研结论与决策见 [docs/RESEARCH.md](docs/RESEARCH.md)。

| 站点 | 目录 | 定位 |
|---|---|---|
| **AgentReady** | [`sites/agentready`](sites/agentready) | 核心工具:免费扫描任意网站的"AI 销售可见性"(AI 爬虫许可、Product schema、llms.txt、sitemap、answer-readiness),0-100 评分 + 修复建议;Pro 等候名单捕获邮箱 |
| **SellToAgents** | [`sites/selltoagents`](sites/selltoagents) | 内容站:ACP / UCP / MCP / llms.txt 商家指南 + 10 步就绪清单,GEO 优化,向主站导流 |
| **CloseCalc** | [`sites/closecalc`](sites/closecalc) | 长尾工具站:佣金、pipeline 覆盖率、冷邮件 ROI、折扣保本 4 个计算器,向矩阵导流 |

## 技术

- Cloudflare Workers + Static Assets,零固定成本;AgentReady 含 `/api/scan`(Worker 内实时抓取与分析)与 `/api/subscribe`(可选绑定 KV `SUBSCRIBERS`)。
- 三站均自带 `llms.txt` + `robots.txt`(明确放行 AI 爬虫)+ JSON-LD——吃自己的狗粮。
- 无任何构建步骤、无外部依赖。

## 本地开发

```bash
cd sites/agentready   # 或 selltoagents / closecalc
npx wrangler dev
```

## 部署

每个站点独立部署:

```bash
cd sites/agentready && npx wrangler deploy
cd sites/selltoagents && npx wrangler deploy
cd sites/closecalc && npx wrangler deploy
```

CI 自动部署见 [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml):在仓库 Settings → Secrets 配置 `CLOUDFLARE_API_TOKEN`(权限:Workers Scripts:Edit)与 `CLOUDFLARE_ACCOUNT_ID` 后,push 到默认分支即自动部署三站。

## 营收路线(摘要)

1. **现在**:免费扫描获客 → Pro 等候名单(邮件);内容站吃早期 GEO/SEO 流量。
2. **6 个月**:订阅制持续监控 + 竞品对比(Stripe 收款);计算器站接联盟。
3. **12 个月+**:llms.txt 托管 / 产品 feed → ACP/UCP 转换 / MCP storefront 代运营,升级为"AI 渠道分发层"。
