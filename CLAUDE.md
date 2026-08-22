# 工作规则（用户指定，长期有效）

1. **先优化 Prompt，再执行任务**：接到任何任务，先把它改写为一个明确的、带验收标准的优化版 Prompt（目标、必须回答的问题、输出要求、约束），向用户展示后再开始执行。
2. **重大方向决策前先深度调研竞对**：评估赛道拥挤度、免费巨头覆盖、差异化空间，给出"继续/调整/放弃"的明确结论后再动手建设。

# 项目背景

sellSomething——AI 时代销售站群（每站独立 Cloudflare Worker，push 默认分支即 CI 自动部署，见 .github/workflows/deploy.yml）：

- AgentReady（agentready.agiscorecard.com）：免费 AI 销售可见性扫描器 `/api/scan`——获客入口
- SellToAgents（selltoagents.agiscorecard.com）：ACP/UCP/MCP/llms.txt 商家指南内容站
- CloseCalc（closecalc.agiscorecard.com）：销售计算器长尾工具站
- AgentFront（sites/agentfront，2026-07-19 从 createjob 会话合并入）：agentic-commerce 接入产品的等待名单站——**主力验证方向**（依据 docs/competitive-analysis.md：检测/监控已被免费巨头商品化，欧美 SMB 接入层是唯一空档）
- 域名：agentfront.agiscorecard.com 已挂本仓库的 agentfront Worker（2026-07-19 迁移完成；lens.agiscorecard.com 已废除，createjob/llmstxt-builder Worker 已删除）
- 邮箱名单统一存 KV `SUBSCRIBERS`（e981ec645ff54685a8139b0c26f6de82）；AgentFront 的键前缀为 `signup:agentfront:`
- 历史沿革：createjob 仓库（AgentLens/llms.txt Builder/AgentFront 三站）与本仓库高度重复，已决定以本仓库为主体合并；createjob 侧的 AgentLens≈AgentReady、Builder≈llms-txt-generator 页，均以本仓库版本为准

# 舰队成员身份(2026-08-22,owner 指令并舰;由 agi 主会话写入)

本仓自本日起是 f-tiger 舰队正式成员(治理并舰:仓库与 CI 保持独立——公开仓
Actions 免费、七站部署健康,物理迁入 agi-site monorepo 被判定为纯翻炒,不做)。
随之生效的舰队义务与权利:
1. **周分发循环覆盖**:agi-site 的每周一分发暂存循环会扫描本仓当周资产,把最强
   素材起草为 owner 手发的 HN/Reddit/X 成品(机器绝不代发——烧号红线全舰队一致)。
2. **周一记分板**:本站群的真实转化(KV `SUBSCRIBERS` 名单增量、scan 使用量)纳入
   舰队对抗记分板口径;报数只报一手,CI 自测流量必须剔除(全舰队已踩过两次的坑)。
3. **互链**:伞域内与 agi 主站/ games / source 等兄弟站可在**对读者真实相关**处
   互链;禁止 link-scheme 式硬塞。agi 的 /ai-tools 双语表将收录本站群工具行
   (agi 侧队列执行)。
4. **红线继承**:零编造、GitHub Actions 账号级额度纪律(公开仓也要合并推送)、
   隐私红线(owner 档案永不入库)与本仓既有规则并行,冲突时以更严者为准。
