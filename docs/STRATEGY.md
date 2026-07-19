# 深度调研与完善方案(v2,2026-07-19)

> 基于二轮调研:第一轮 WebSearch 宏观扫描(见 RESEARCH.md),第二轮 deep-research 工作流(5 路检索 → 一手信源抓取)。
> 诚实声明:第二轮的对抗性核验阶段因 API 限额未完成,下列"信号"均有一手来源链接但未经三票交叉核验,置信度标注为中。

## 一、被验证 / 被修正的假设

| 原假设 | 调研结果 | 结论 |
|---|---|---|
| SMB 自助"免费扫描"位是空白 | ❌ 部分推翻:免费 AI 可见性扫描器已存在(Blue Grid Media 等,43 项检查、0-100 分),但均为**垂直代理公司的获客磁铁**,变现走人工审计服务 | 修正:空白不在"扫描",在"**自助式付费监控**"——该步骤尚无人交付。壁垒低,速度是护城河 |
| llms.txt 是核心卖点 | ⚠️ 双重风险:Google 官方称 llms.txt "purely speculative";Shopify 已于 2026-05 原生支持 `/llms.txt` 与 `/agents.md` 路由 | 修正:llms.txt 降为辅助信号;生成器主要服务**非 Shopify 商家**(WooCommerce/自建站);扫描器价值转向"验证配置是否生效 + 持续监控" |
| 商家没有意识到 agentic commerce | ✅ 强化:Shopify 商家在官方论坛主动求教 llms.txt 配置;Shopify 设立 "Agentic Commerce" 一级开发者板块并由官方员工答疑 | 需求真实存在且平台在教育市场——我们顺风 |
| 企业级工具(Profound 等)不下沉 | 未能核验(限额),按风险处理 | 假定 12 个月内会下沉,倒逼我们 6 个月内建立数据资产 |

## 二、护城河修正:从"静态体检"到"结果追踪"

静态检查(robots/schema/llms.txt)**必然商品化**——竞品可在一周内复刻,平台会原生集成。真正难复制的是**结果层数据**:

1. **Citation share 追踪**(Pro 核心):定期向 ChatGPT/Perplexity/Gemini 提问品类购买问题,记录用户品牌是否出现在推荐中、排第几、和谁并列——这是 Profound 卖给企业的东西,SMB 版本 $29/mo 没人做。
2. **历史评分曲线 + 变更告警**:主题更新悄悄删掉 schema、CDN 预设悄悄屏蔽 GPTBot——监控告警是续费理由。
3. **横向数据资产**:扫描量积累 → "各行业 AI 就绪度基准报告" → 引用/外链/PR 飞轮,后来者无法瞬间复制。

## 三、AgentReady Pro 定价与功能(修订)

| 层级 | 价格 | 功能 |
|---|---|---|
| Free | $0 | 即时扫描 + llms.txt 生成器(获客,无需注册) |
| **Pro** | **$29/mo**(年付 $290) | 每周自动重扫 + 邮件告警;评分历史曲线;3 个竞品对比;citation-share 月度抽样(10 组品类查询);PDF 报告 |
| Agency | $99/mo | 20 个站点、白标报告、API |

理由:竞品免费扫描 → 人工服务($$$$,慢);企业工具 $300+/mo 起;$29 卡在"个体商家无痛、代理商觉得便宜"的空档。先 Stripe Payment Link 收款,不做复杂计费。

## 四、90 天 GTM 五步(按杠杆排序)

1. **Shopify App Store 上架**(最高杠杆):把"就绪度评分 + agents.md/llms.txt 验证 + 周报"做成 Shopify App。商家在哪,分发就在哪;官方论坛已证明需求。免费安装 → Pro 内购。
2. **"AI 可见性百强榜"内容飞轮**:每月扫描 100 个知名 DTC 品牌,发布排名与平均分("78% 的 DTC 站点对 Perplexity 不可见")。可引用数据 = 外链 + PR + AI 引擎引用我们(自证)。
3. **程序化 GEO 页**:`/scan/{platform}` 系列页(Shopify/WooCommerce/BigCommerce/Wix 的 AI 就绪指南 + 平台专属修复步骤),吃"is shopify store visible to chatgpt"类长尾。
4. **社区答题式获客**:在 Shopify Community / r/ecommerce / r/shopify 回答 llms.txt、AI 可见性问题,附免费扫描链接(已验证这些帖子有真实流量)。
5. **Product Hunt + 工具目录**:免费扫描器 + 生成器双工具上架 PH、AI 工具目录(tooldirectory.ai 等已在收录同类)。

## 五、产品层已落地的修订(本次提交)

- 扫描器新增 **`/agents.md` 检查**(Shopify 新原生信号,竞品尚未覆盖)。
- llms.txt 检查文案改为"新兴/存争议"定位并降低权重(10→7),不再暗示它是排名硬信号。
- 生成器页面明示:Shopify 商家可用原生功能,本工具主要面向自建站/WooCommerce 等。

## 六、风险登记簿

| 风险 | 概率 | 缓解 |
|---|---|---|
| 平台原生化(Shopify/Google 出官方仪表盘) | 高(已部分发生) | 转向跨平台聚合视图 + 结果追踪;做平台的补充而非替代 |
| llms.txt 标准死亡 | 中 | 已降权;扫描框架信号可插拔,标准变了加新检查即可 |
| 企业工具下沉 | 中 | 6 个月内积累扫描数据资产与邮件列表;打价格与"5 分钟自助"体验差 |
| 免费扫描被复刻 | 高 | 免费层只是获客;价值锚移到监控 + citation 数据 |

## 附:本轮一手信源
- bluegridmedia.com/ai-visibility-scanner(竞品免费扫描器形态与变现)
- community.shopify.dev/t/adding-llms-txt-file-to-shopify-store/19276(需求信号 + Shopify 官方态度 + 原生 llms.txt/agents.md)
- searchenginejournal.com(Google:llms.txt "purely speculative")
- apps.shopify.com/llm-rank(Shopify 生态已出现同类 App)
- 第一轮来源见 docs/RESEARCH.md
