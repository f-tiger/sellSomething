# 全线产品上线手册（turnkey，2026-08-21）

> **2026-08-21 用户决定：§1（Paddle 法币收款）不做。** 后果：站群的订阅/深度审计/DevKit/徽章保持等待名单模式（代码保留，随时可激活）；VS Code 扩展只发免费档当分发渠道（Pro 无销售通道）。仍可产生收入的线：**§2 JetBrains（平台代收，无需自建收款）、§4 Apify（平台代收）、§5 x402（0 KYC 钱包直收）、§6 联盟、§7 EV 资助**。优先级顺序改为 §5 → §2 → §4 → §6 → §7。

代码已全部就位（Paddle 双轨收款、深度审计、DevKit license、VS Code/JetBrains 扩展、Apify Actors、x402 付费 API、联盟挂载）。本文是你唯一需要照做的清单——全部是"控制台点几下 + 填密钥"，不需要再改任何代码。按顺序做，每节独立，做完一节该产品线即上线。

---

## 1. Paddle（主收款通道，大陆个人可过审）≈ 40 分钟 + 审核数天

前置材料：护照、你自己的域名站点（agentready.agiscorecard.com 已有，需确认页脚有 Terms/Privacy 页——没有就告诉 Claude 补）、域名邮箱（如 hi@agiscorecard.com）。

1. 到 [paddle.com](https://www.paddle.com) 注册（选 Paddle Billing），KYC 用护照，网站填 `https://agentready.agiscorecard.com`。初审一般 1 个工作日内邮件通知；期间可先用 Sandbox 测试。
2. 审核通过后，在 Catalog → Products 建 4 个产品并各建一个 Price（记下每个 **price id**，形如 `pri_...`）：
   - Pro Monitoring — $19/month（recurring）
   - Team Monitoring — $49/month（recurring）
   - Deep Audit — $149（one-time）
   - DevKit License — $29（one-time）
   - （可选）Verified Badge — $149 one-time 或 $19/month
3. Checkout → 为每个产品拿 **hosted checkout 链接**，分别填进：
   - `sites/agentready/public/pricing.html` 顶部 `const CHECKOUT={pro:"",team:"",audit:"",devkit:""}`
   - `sites/agentready/public/get-verified.html` 的 `BADGE_CHECKOUT=""`
   - 改完 push，CI 自动部署；按钮自动从"等待名单"变为真结账。
4. Developer Tools → Notifications → 新建 destination，URL 填
   `https://agentready.agiscorecard.com/api/billing/paddle`，事件勾 `transaction.completed`、`subscription.activated`、`subscription.created`、`subscription.canceled`、`subscription.paused`、`transaction.revoked`、`adjustment.created`。记下 **secret key**（`pdl_ntf..._` 开头或类似）。
5. 给 Worker 填密钥（Cloudflare 控制台或 wrangler）：
   ```
   npx wrangler secret put PADDLE_WEBHOOK_SECRET --name agentready   # 通知 secret
   npx wrangler secret put PADDLE_API_KEY        --name agentready   # Developer Tools → Authentication 里建一个 API key（用于按 customer_id 反查邮箱）
   npx wrangler secret put PADDLE_PRO_PRICE_ID    --name agentready
   npx wrangler secret put PADDLE_TEAM_PRICE_ID   --name agentready
   npx wrangler secret put PADDLE_AUDIT_PRICE_ID  --name agentready
   npx wrangler secret put PADDLE_DEVKIT_PRICE_ID --name agentready
   npx wrangler secret put PADDLE_BADGE_PRICE_ID  --name agentready  # 若建了徽章产品
   ```
   Sandbox 测试期另设 `PADDLE_API_BASE=https://sandbox-api.paddle.com`。
6. 验证（不花真钱）：
   ```
   # 手动签发一个 DevKit license（走管理端点，CRON_SECRET 见 BILLING-SETUP.md）
   curl -X POST "https://agentready.agiscorecard.com/api/license/admin?key=<CRON_SECRET>" \
     -H "Content-Type: application/json" -d '{"email":"you@example.com","product":"devkit"}'
   # 返回 {"ok":true,"license":{"key":"ARDK-...","emailed":...}} → 拿 key 验证：
   curl "https://agentready.agiscorecard.com/api/license/validate?key=ARDK-..."
   # 手动签发审计 token 并打开报告：
   curl -X POST "https://agentready.agiscorecard.com/api/license/admin?key=<CRON_SECRET>" \
     -H "Content-Type: application/json" -d '{"email":"you@example.com","product":"audit"}'
   # 浏览器打开 https://agentready.agiscorecard.com/api/report?token=ARAU-...&url=https://allbirds.com
   ```
7. 买家找不到 key/token 时（未配 Resend 前）：
   `GET /api/license/admin?key=<CRON_SECRET>&email=<买家邮箱>` 可查到，手动发给对方。配好 Resend（见 BILLING-SETUP.md 第 1 节）后自动发信，无需人工。
8. 提现：Paddle → Payoneer。到 [payoneer.com](https://www.payoneer.com) 用身份证注册个人账户（数天审核），在 Paddle Payouts 里绑 Payoneer 的 USD receiving account；Payoneer 提现人民币约 1.2%、分钟级到账。

> Creem 通道（docs/BILLING-SETUP.md）保留可用，两轨并存；先跑通 Paddle 即可。

## 2. JetBrains 付费插件 ≈ 30 分钟 + JetBrains 审核

代码在 `plugins/jetbrains-llmstxt/`，CI（`.github/workflows/plugin-jetbrains.yml`）会自动构建出插件 zip。

1. 到 [plugins.jetbrains.com](https://plugins.jetbrains.com) 登录，建 Vendor（个人即可，名称 AGIScorecard）。
2. Marketplace → 申请 **paid plugin**：注册 product code `PLLMSTXT`（与 plugin.xml 一致），定价建议 $19/年（个人档，30 天免费试用，JetBrains 代收代税，抽 15%——**平台代收，无需你再配收款**，绑定你的收款信息即可）。
3. 从 GitHub Actions 的构建产物下载 zip → Upload plugin。首次人工审核约数个工作日。
4. 之后每次 push 插件目录，CI 出新 zip，手动传或配 Marketplace token 自动发布（README 有细节）。

## 3. VS Code 扩展（freemium）≈ 30 分钟

代码在 `plugins/vscode-llmstxt/`，Pro 档由第 1 节的 DevKit license 解锁（license 服务已在线）。

1. 到 [marketplace.visualstudio.com/manage](https://marketplace.visualstudio.com/manage) 用 Microsoft 账号建 publisher `agiscorecard`；Azure DevOps 建 PAT（Marketplace → Manage 权限）。
2. 从 CI（`.github/workflows/plugin-vscode.yml`）下载 .vsix，或本地 `npx @vscode/vsce publish -p <PAT>`。
3. 顺手发 Open VSX（Cursor/VSCodium 用户）：`npx ovsx publish <vsix> -p <openvsx token>`。
4. 免费档直接可用；用户买 DevKit（$29，走 Paddle）→ 邮件收 key → 扩展里 Enter license key 解锁 Pro。

## 4. Apify Actors ≈ 30 分钟

代码在 `apify/`（三个 Actor：agent-readiness-auditor / mcp-server-health-checker / llms-txt-extractor），发布 runbook 在 `apify/README.md`。

1. 注册 [apify.com](https://apify.com)，过 KYC（payout 前置），Settings → Payouts 绑收款（建议 Wise 美元账户收 SWIFT 电汇，攒到 $100+ 再提；PayPal $20 起付但提现费高）。
2. 本地或 GitHub Codespace：`npm i -g apify-cli && apify login`，然后对每个目录 `apify push`。
3. Console 里给每个 Actor 开 **pay-per-event** 计费（价格建议已写在各 README；⚠️ 别用 rental——2026-10 退役）。
4. 预期管理：这是幂律市场（见 docs/quick-revenue-options.md 第十节）——现金首元 2–4 个月、中位为零；README 已按"销售页"写好 SEO 字段，上架后 Claude 会在周任务里迭代选品。

## 5. x402 付费 API（0 KYC）≈ 10 分钟

代码在 `sites/x402/`（部署由 CI 自动完成），详细 runbook 在 `sites/x402/README.md`。

1. 生成一个 Base 链钱包地址（Coinbase Wallet App 或 `cast wallet new`；**私钥自己保存，绝不上服务器**）。
2. `npx wrangler secret put PAYTO_ADDRESS --name x402`（填 0x 地址）。
3. 完成——agent 用 USDC 按次付费调用 `x402.agiscorecard.com/api/scan`，钱直接到你钱包。可选：到 x402 Bazaar / Agent.market 免费挂牌（README 有步骤）。
4. ⚠️ 合规：若你身处中国大陆，注意 2026-02 关于个人加密活动的新规（docs/quick-revenue-options.md 第十二节），自行评估后再启用本节。

## 6. 联盟挂载 ≈ 20 分钟

代码在 `sites/closecalc/public/aff.js`（四个计算器页已内嵌推荐位，链接为空时整块隐藏）。

1. 申请 [Pipedrive 联盟](https://www.pipedrive.com/en/partners/affiliate-program)（~33% recurring）和 [HubSpot 联盟](https://www.hubspot.com/partners/affiliates)（30% recurring、180 天 cookie），个人可申请。
2. 拿到专属链接后填进 `aff.js` 顶部的 `pipedrive:""` / `hubspot:""`，push 即生效。
3. 预期管理：纯长尾，不指望首元（依据第三轮调研）。

## 7. Emergent Ventures 微资助 ≈ 1 小时

申请草稿在 `docs/ev-application.md`——替换个人信息后到 [mercatus.org 的 Emergent Ventures 页面](https://www.mercatus.org/emergent-ventures) 提交。10% 通过率、2–3 周答复、$1K–50K。

---

## 完成后的状态

| 产品线 | 你做完第 N 节后 | 持续人工 |
|---|---|---|
| 站群订阅/审计/DevKit/徽章 | §1 | 0（webhook 全自动发货） |
| JetBrains 插件 | §2 | 0（平台代收代税） |
| VS Code 扩展 Pro | §1+§3 | 0 |
| Apify Actors | §4 | 0（Claude 周任务迭代） |
| x402 API | §5 | 0 |
| 联盟长尾 | §6 | 0 |

全部六线的后续开发、内容、监控、迭代已纳入 Claude 的自动化范围。
