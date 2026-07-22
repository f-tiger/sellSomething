# AgentReady 监控:告警 + 收款上线清单(turnkey)

代码已全部就位。要让**告警邮件**和**订阅收款**真正生效,只差下面这些"你在控制台点几下 + 配几个密钥"的动作。全程不需要我再改代码。

---

## 1. 告警邮件(Resend)—— 让回归告警真正发出去

现状:监控引擎会检测回归并**已把告警落到 KV 不丢**,但在配置发信前不会发邮件。

步骤:
1. 注册 [resend.com](https://resend.com),验证发信域名(建议 `agiscorecard.com`,加它给的 DNS 记录)。
2. 拿到 API key(`re_...`)。
3. 给 agentready Worker 设两个密钥(Cloudflare 控制台 → Workers → agentready → Settings → Variables and Secrets,或用 wrangler):
   ```
   npx wrangler secret put RESEND_API_KEY --name agentready       # 粘贴 re_...
   npx wrangler secret put ALERT_FROM     --name agentready       # 例:AgentReady <alerts@agiscorecard.com>(可选,有默认)
   npx wrangler secret put CRON_SECRET    --name agentready       # 任意长随机串,用于保护测试/扫描端点
   ```
4. **端到端验证**(设完就能测):
   ```
   curl "https://agentready.agiscorecard.com/api/monitor/test?key=<CRON_SECRET>&to=you@example.com"
   ```
   返回 `{"ok":true,...}` 且你收到「AgentReady monitoring — test alert」邮件 = 告警链路通了。
   返回 `{"ok":false,"delivery":{...}}` 里会带 Resend 的报错原因(通常是域名没验证)。

> 定时扫描已由 GitHub Actions `monitor-sweep.yml` 每日调用 `/api/cron/run` 驱动(Cloudflare 免费版不支持 Cron Trigger,故走 HTTP)。设了 `CRON_SECRET` 后,把同名值也加到 GitHub 仓库 Secrets,workflow 会自动带上。

---

## 2. 收款(Creem,Merchant-of-Record)—— 让付费档真正能买

选 Creem 的原因见 `docs/SAAS-DIRECTION.md`:MoR 代扣全球税、费率最低(3.9%+$0.40)。

步骤:
1. 注册 [creem.io](https://creem.io),建两个产品:**Pro $19/mo**、**Team $49/mo**,拿到各自的 **checkout URL** 和 **product id**。
2. **前端**:把两个 checkout URL 填进 `sites/agentready/public/pricing.html` 顶部脚本的：
   ```js
   const CHECKOUT={pro:"https://checkout.creem.io/...", team:"https://checkout.creem.io/..."};
   ```
   填了之后,定价页的「Get early access」按钮自动变成「Subscribe →」直连 Creem(邮箱会带过去);留空则保持等候名单模式。改完 push,CI 自动部署。
3. **Webhook**(自动把付费用户升到对应 plan):在 Creem 后台把 webhook 指向
   `https://agentready.agiscorecard.com/api/billing/webhook`,拿到 webhook secret(`whsec_...`),给 Worker 设:
   ```
   npx wrangler secret put CREEM_WEBHOOK_SECRET  --name agentready   # whsec_...
   npx wrangler secret put CREEM_PRO_PRODUCT_ID  --name agentready   # Pro 产品 id
   npx wrangler secret put CREEM_TEAM_PRODUCT_ID --name agentready   # Team 产品 id
   ```
   Worker 会用 HMAC-SHA256 验签(默认读 `creem-signature` 头;若 Creem 文档用别的头名,设 `CREEM_SIGNATURE_HEADER`),验签通过后按 product id 把该邮箱的监控升到 pro/team,取消/退款则降回 free。
4. **手动验证**(不等真实付款):
   ```
   curl -X POST "https://agentready.agiscorecard.com/api/billing/webhook?key=<CRON_SECRET>" \
     -H "Content-Type: application/json" -d '{"email":"you@example.com","plan":"pro"}'
   ```
   返回 `{"ok":true,"updated":N}` = plan 写入成功(N=该邮箱名下被升级的监控数)。

> ⚠️ 需你确认的一点:Creem 的**签名头名称/方案**以它的官方 webhook 文档为准。代码默认按「`creem-signature` 头 = HMAC-SHA256(原始 body, whsec)」实现;若文档不同,改 `CREEM_SIGNATURE_HEADER` 或告诉我,我按文档调。

---

## 分阶段建议(与 SAAS-DIRECTION 一致)

1. **先只做 #1(告警)+ 定价页等候名单**:零收款风险,验证有没有人愿意留邮箱监控。
2. **拿到第一批等候邮件后再做 #2(Creem)**:别在没有意向信号前就接收款。
3. plan 位、限额门、webhook、checkout 都已就位,接通就是配置,不需要再改代码。
