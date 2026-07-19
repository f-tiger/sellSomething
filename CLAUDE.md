# 工作规则（用户指定，长期有效）

1. **先优化 Prompt，再执行任务**：接到任何任务，先把它改写为一个明确的、带验收标准的优化版 Prompt（目标、必须回答的问题、输出要求、约束），向用户展示后再开始执行。
2. **重大方向决策前先深度调研竞对**：评估赛道拥挤度、免费巨头覆盖、差异化空间，给出"继续/调整/放弃"的明确结论后再动手建设。

# 项目背景

sellSomething——AI 时代销售站群（每站独立 Cloudflare Worker，push 默认分支即 CI 自动部署，见 .github/workflows/deploy.yml）：

- AgentReady（agentready.agiscorecard.com）：免费 AI 销售可见性扫描器 `/api/scan`——获客入口
- SellToAgents（selltoagents.agiscorecard.com）：ACP/UCP/MCP/llms.txt 商家指南内容站
- CloseCalc（closecalc.agiscorecard.com）：销售计算器长尾工具站
- AgentFront（sites/agentfront，2026-07-19 从 createjob 会话合并入）：agentic-commerce 接入产品的等待名单站——**主力验证方向**（依据 docs/competitive-analysis.md：检测/监控已被免费巨头商品化，欧美 SMB 接入层是唯一空档）
- 域名注意：agentfront.agiscorecard.com 目前仍挂在 createjob Worker 上（内容相同）；从 createjob 摘除后在 sites/agentfront/wrangler.jsonc 启用 routes
- 邮箱名单统一存 KV `SUBSCRIBERS`（e981ec645ff54685a8139b0c26f6de82）；AgentFront 的键前缀为 `signup:agentfront:`
- 历史沿革：createjob 仓库（AgentLens/llms.txt Builder/AgentFront 三站）与本仓库高度重复，已决定以本仓库为主体合并；createjob 侧的 AgentLens≈AgentReady、Builder≈llms-txt-generator 页，均以本仓库版本为准
