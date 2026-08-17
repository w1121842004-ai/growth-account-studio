# Spec - 成长号工坊（Toutiao Ops Studio）v0.1.0 (MVP)

> 生成日期：2026-08-16
> 基于：PRD v1（产品经理 许清楚）+ 架构文档 v1（架构师 高见远）+ UIUX v1（设计师 颜好看）
> 状态：已确认（用户于 2026-08-16 确认三文档 + 架构师 3 项强制修正）
> 锁定期望：开发阶段任何改动走变更流程，不得绕过本 Spec

---

## 1. 产品定义

- **一句话描述**：面向文科运营者的半自动内容工坊——从热榜挖选题、用国产大模型写带人味的草稿、一份内容经「Block AST + 双渲染器」输出头条与公众号兼容排版、人工审核（须实质编辑）后手动粘贴发布。
- **目标用户**：26–32 岁文科背景（中文/传媒/教育学）自由职业者或副业运营者（主画像「小林」，非技术、不会写 prompt/调 API）；次要画像「阿May」为小 MCN 运营助理（管 2–3 个同赛道号）。
- **核心问题**：非技术人想运营「个人成长 / 自我提升（用 AI 工具助力成长）」头条号 + 公众号，但选题枯竭、AI 稿「AI 味」重被限流、排版双平台不兼容、自动发布有封号风险。

---

## 2. MVP 范围（锁定——不在此列表的功能一律不做）

| 优先级 | 功能 | 验收标准摘要 | RICE |
|--------|------|-------------|------|
| P0 | F1 选题雷达（热榜+文章源聚合→高潜选题+热度/竞争度评分+重复度预警） | 输入赛道关键词返回≥10条带评分选题，高重复给预警 | 6.0 |
| P0 | F2 AI 图文草稿生成（国产模型+人味提示词+爆款风格 Few-shot） | 流式产出结构化图文初稿（标题/导语/分节/金句/结尾），标「AI 生成」 | 7.5 |
| P0 | F3 统一排版引擎（Block AST + 双渲染器） | 同一内容在微信视图（全内联 style）与头条视图（零 inline style+Unicode 层级）均合规呈现 | 5.0 |
| P0 | F4 草稿审核工作台（双平台预览+在线编辑+复制导出+发布清单） | 双平台预览一致；未实质编辑禁止导出；一键复制 text/html | 7.5 |
| P0 | F5 模型热切换适配层（通义/智谱/混元抽象，先接1个+熔断） | 主模型不可用自动切备选，输出格式一致 | 2.67 |

MVP 闭环：选题雷达→选选题→AI 生成带人味草稿→双渲染器排版→审核工作台（须实质编辑）→导出双平台 HTML→用户手动粘贴发布。

---

## 3. 明确不做（Out-of-Scope — 锁定）

| 不做的功能 | 原因 | 何时考虑 |
|------------|------|----------|
| 自动推草稿 / 自动发布 API | 微信 2026-03 新规禁「非真人自动化创作」，封号红线（R-2） | 永不（合规禁止） |
| 微博热搜自动采集 | 微博《开发者协议》明文禁采（R-3） | 改手动粘贴导入兜底 |
| 抓取文章正文计算竞争度 | 头条 robots 禁抓 /item/ /group/（R-3/B-3） | 改用共现+历史去重+LLM 判断 |
| 多账号矩阵 / 批量分发 | 正是被永久封禁的模式（R-2） | 永不 |
| 洗稿 / 改写他人文章入口 | 原创性约束 C-8，平台识别换词洗稿 | 永不 |
| pgvector / 向量检索 | 单用户日均百条量级过度设计（ADR-007） | 语料超万条再评估 |
| Redis / BullMQ 队列 | 低频幂等采集无需重试队列（ADR-005） | 出现高并发重试需求时 |
| Vercel 部署 | 需固定出口 IP，Serverless 出口动态导致 IP 白名单失效（R-9） | 永不 |
| 内容安全人工审核外的全自动合规 | 半自动本质即真人把关 | 永不 |

---

## 4. 技术架构（锁定——含版本锚定）

| 层 | 技术 | 实际版本 | 锁定原因 |
|----|------|----------|----------|
| 前端框架 | Next.js (App Router) | 16.2.11 | 月度安全发布修 9 CVE；双渲染器需 Node 侧 unified/rehype 生态 |
| UI 框架 | React | 19.2.x | 与 Next 16 配套 |
| 语言 | TypeScript | 5.x | 前后端类型直通 |
| UI 样式 | Tailwind CSS | 4.x | token 驱动，文科生友好成熟组件 |
| UI 组件 | shadcn/ui (Radix 无头原语) | 最新稳定 | 可访问性/键盘交互开箱即得 |
| 图标库 | lucide-react | 1.x 主版本线（lockfile 实际解析） | **全项目唯一图标源**，禁 emoji/禁混用（P0-1/ADR-010） |
| 审核编辑器 | Tiptap 3 (ProseMirror) | 3.x | 头条编辑器即 ProseMirror，所见即所得压低落地偏差 |
| 状态 | TanStack Query + Zustand | v5 / v5 | 服务端态/编辑器本地态分离 |
| 后端 | Next.js Route Handlers | 同仓 | 单体，/api/v1/*，openapi.yaml 为契约 |
| ORM | Drizzle | 最新稳定 | 轻量，JSONB 友好 |
| 数据库 | PostgreSQL | 17 | Block AST 存 JSONB |
| 调度 | node-cron（独立 worker） | 最新稳定 | 仅定时采集，低频幂等 |
| 模型适配 | Vercel AI SDK (`ai`) | 6.0.256 | OpenAI 兼容统一协议 |
| 模型适配 provider | `@ai-sdk/openai` | **精确 3.0.97（禁 caret）** | 必须与 `ai` 同 provider spec；4.x 只配 `ai@7`，详见 ADR-004 修订 |
| 主力模型 | 腾讯混元 Hy3 | tokenhub.tencentmaas.com/v1 | 中文创作性价比+缓存命中 0.25 |
| 省钱档 | 混元 hunyuan-lite（免费） | 同上 | 选题批量打分低难度任务 |
| 备选模型 | 智谱 GLM-4.7-Flash / 通义 Qwen Plus | OpenAI 兼容 | 配置热切换不改代码 |
| 部署 | 腾讯云 Lighthouse + Docker Compose + Caddy | - | 固定出口 IP，国内访问质量 |
| 认证 | JWT（访问 15min + 刷新 7d） | - | MVP 单用户，本地账号起步 |

---

## 5. API 端点清单（锁定——开发时以此为唯一依据；architect 在 Phase 2 产出 openapi.yaml）

统一响应 `{code, data, message}`；分页 `{items, total, page, limit, hasMore}`；路径前缀 `/api/v1`。

| Method | Path | 功能 | 认证 | 请求体 | 响应体 |
|--------|------|------|------|--------|--------|
| GET | /topics | 选题池列表（按 score 排序，支持领域/情绪/平台筛选） | 是 | query: domain, platform, page | 选题列表+评分 |
| POST | /topics/score | 触发一次选题打分（LLM 批量） | 是 | 无 | 更新后的选题评分 |
| GET | /topics/:id | 选题详情 | 是 | - | 选题+来源+历史采纳 |
| POST | /drafts/generate | 依选题生成草稿（流式） | 是 | {topicId, tone, length} | SSE 流式 Block AST |
| GET | /drafts/:id | 草稿详情（Block AST + 编辑历史） | 是 | - | 草稿 |
| PUT | /drafts/:id | 保存人工编辑（记录编辑距离） | 是 | {blocks} | 草稿+editTrail |
| GET | /drafts/:id/render?platform=wechat\|toutiao | 渲染指定平台 HTML | 是 | - | 平台 HTML（含 AI 标识） |
| POST | /drafts/:id/export | 标记导出（复制 text/html 到剪贴板由前端完成） | 是 | {platform} | 导出 HTML + 发布 checklist |
| GET | /models | 模型配置列表 | 是 | - | 模型配置 |
| PUT | /models/:id | 切换/配置模型（baseURL/apiKey/model 来自配置） | 是 | {config} | 更新后配置 |
| GET | /sources | 采集源配置 | 是 | - | 源列表（含白名单） |
| PUT | /sources/:id | 启停采集源 | 是 | {enabled} | 更新 |
| GET | /usage | 用量统计（token/成本/导出数） | 是 | - | 统计 |
| GET | /settings | 品牌人设/语调/默认排版偏好 | 是 | - | 设置 |
| PUT | /settings | 保存设置 | 是 | {profile, layout} | 更新 |

---

## 6. 数据库表清单（锁定）

| 表名 | 核心字段 | 索引 | 关联 |
|------|----------|------|------|
| users | id, email, password_hash, created_at | pk id | - |
| topics | id, platform, source_item_key, bucket_date, title, heat, relevance, competition, score, domain, adopted | 唯一(platform,source_item_key,bucket_date)；idx(score) | - |
| drafts | id, user_id, topic_id, blocks(JSONB), status, created_at | pk id；idx(user_id,status) | topic_id |
| edit_trails | id, draft_id, distance, actions, created_at | idx(draft_id) | draft_id |
| model_configs | id, name, base_url, api_key(加密), model, role(primary/fallback), enabled | idx(role) | - |
| source_configs | id, name, endpoint, enabled, last_fetch | idx(enabled) | - |
| usages | id, user_id, model, tokens_in, tokens_out, cost, created_at | idx(user_id,created_at) | user_id |

Block AST 结构（JSONB，无 CSS）：`{blocks:[{type, level?, children?, marks?}]}`，type ∈ paragraph/heading/quote/list/orderedList/code/image/divider。

---

## 7. 页面清单（锁定）

| 页面 | 路由 | 核心组件 | 对应 API | 设计 Token 主题 |
|------|------|----------|----------|-----------------|
| 工作台 Home | / | 最近草稿、今日灵感卡、三入口 | /drafts, /topics | 暖纸白 / 松绿 |
| 选题池 | /topics | 选题卡（标题/来源标签/平台/热度/采纳）、筛选栏、智能挖掘 | /topics | 同上 |
| 选题详情 | /topics/:id | 选题信息 + 生成入口 | /topics/:id | 同上 |
| 生成工作台 | /drafts/new | Tiptap 编辑器 + 大纲 + AI 侧栏（生成/续写/扩写/润色） | /drafts/generate | 同上 |
| 审核编辑器 | /drafts/:id | Tiptap + 编辑留痕 + AI 建议卡片 | /drafts/:id(PUT) | 同上 |
| 双平台预览导出 | /drafts/:id/preview | 微信手机框 + 头条手机框 + 复制/导出 + 发布 checklist | /drafts/:id/render, /export | 同上 |
| 模板管理 | /templates | 3 套排版模板（极简/书卷/分栏） | - | 同上 |
| 设置/模型配置 | /settings | 人设语调、模型切换、默认排版 | /models, /settings | 同上 |
| 采集源与合规设置 | /sources | 源白名单启停、合规提示 | /sources | 同上 |
| 用量统计 | /usage | token/成本/导出看板 | /usage | 同上 |

---

## 8. 设计 Token（锁定）

> 设计师在 Phase 2 产出 `design-tokens.json` + `design-tokens.css`，前端 import 引用。

- **设计语言**：纸感编辑（Paper & Quiet）——暖纸白背景 + 大量留白 + 衬线标题添人味 + 单一松绿强调 + 「内容即主角」。
- **背景**：暖纸白（warm off-white，stone-50 区间）；表面：纯白卡片。
- **文字**：暖墨黑（stone-900 区间）/ 暖灰（次要）/ 浅暖灰（边框，绝不用纯黑）。
- **强调色**：松绿（teal，唯一，仅 CTA/选中态/关键数据），每屏 ≤2 处。
- **语义色**：生长绿（success）/ 暖琥珀（warn）/ 克制红（danger），均低饱和。
- **字体**：UI 与标签 Noto Sans SC；阅读/写作内容与标题 Noto Serif SC（书卷气）；等宽仅字数/时长 JetBrains Mono。正文 ≥16px，行高 1.6。
- **图标库**：lucide-react 锁定，尺寸 行内16 / 按钮内20 / 独立24，全项目不混用（P0-1）。
- **AI 生成标识**：蓝→绿细线（仅视觉标识，非紫粉主视觉），正文注入文字标识「本文含 AI 辅助创作」。
- **5 态覆盖**：Loading（思考中+骨架屏+预计时间）/ Empty（引导+示例+快速开始）/ Error（错误分类+重试+降级）/ Populated / Edge（超长截断+成本上限+内容安全过滤）。
- **三轴刻度**：DESIGN_VARIANCE=5 / MOTION_INTENSITY=3（仅 hover/active + AI 生成骨架微光）/ VISUAL_DENSITY=4（留白优先）。

---

## 9. 验收标准（锁定——QA 测试时以此为唯一依据，EARS 格式）

| 编号 | 功能 | EARS 格式验收标准 | 优先级 |
|------|------|-------------------|--------|
| AC-01 | 选题雷达 | When 用户输入赛道关键词「个人成长/AI 提效」，系统必须返回≥10条带热度/竞争度评分的选题，并对与现有爆款高重复的选题给出「重复度预警」 | P0 |
| AC-02 | 选题采集 | While 采集 worker 运行，系统必须仅对白名单源（头条/hot-event、百度、知乎、B站）单并发、间隔≥30min、失败指数退避地采集，且只存标题/热度元数据 | P0 |
| AC-03 | 草稿生成 | When 用户选定选题点击「生成草稿」，系统必须通过流式输出产出结构化图文初稿（标题/导语/分节/金句/结尾）并标注「AI 生成」 | P0 |
| AC-04 | 双渲染器 | When 用户进入排版预览，系统必须在「微信视图」输出全内联 style + section 嵌套、在「头条视图」输出零 inline style + 语义标签 + Unicode 层级，两版内容主体一致 | P0 |
| AC-05 | AI 标识 | While 系统渲染任平台导出 HTML，系统必须在正文适当位置自动注入显式标识「本文含 AI 辅助创作」，且 If 用户尝试在导出前关闭该标识，系统必须拒绝并保留 | P0 |
| AC-06 | 真人留痕 | If 用户未对草稿做实质编辑（编辑距离低于阈值），系统必须禁止其进入导出态 | P0 |
| AC-07 | 导出 | When 用户在审核工作台点击「导出」并选平台，系统必须输出该平台可粘贴的 text/html（微信版/头条版），且两版内容主体一致、仅适配项差异化 | P0 |
| AC-08 | 模型熔断 | When 当前主模型不可用，系统必须自动切换到备用国产模型并保持输出格式一致 | P0 |
| AC-09 | 竞争度 | While 计算竞争度，系统必须不抓取任何文章正文，仅用跨平台共现数 + 用户历史去重 + LLM 批量判断 | P0 |
| AC-10 | 排版预览差异 | When 展示头条视图，系统必须不渲染任何 inline style、图标、色块，仅以语义标签 + Unicode 符号承载层级 | P0 |

---

## 10. 边界与约束

- **双渲染器契约（C-1）**：微信=全内联 style + section；头条=零 inline style + 语义标签 + Unicode 层级。共用 Block AST，不共用 HTML。每个渲染器配快照测试，输出变化须显式 review。
- **微信渲染器（C-2）**：正文图片域名仅 mmbiz.qpic.cn（须先走素材接口换址）→ MVP 正文默认不插图，封面人工上传；禁 `<pre>+white-space`（换行丢），代码块用 `<p>+<code>+&nbsp;`；section 横向 padding 6px；h1–h6 转 p，标题层级靠内联样式模拟。
- **头条渲染器（C-3）**：禁 inline style、禁 section 嵌套、禁 `<br>` 承担换行（改每行独立 `<p>`）、禁空 `<ul>` 行号占位；`<pre>` 可保留；emoji 最多 2 种且不连续（内容层，与 P0 禁 emoji 功能图标是两件事）。
- **采集合规（C-4）**：robots 白名单硬编码 + 单元测试；微博不采集；不抓正文；单并发 + ≥30min 间隔 + 指数退避；只存标题/热度/榜位元数据。
- **AI 标识（C-5）**：导出正文自动注入且不可关闭（标识办法第四条第二款）。
- **平台侧标识（C-6）**：导出前 checklist 强制提示用户在头条勾选「AI 生成/辅助创作」、在公众号保留标识。
- **真人参与留痕（C-7）**：审核界面记录人工编辑行为，未经实质编辑不准导出。
- **原创性（C-8）**：头条相似度超 65%–75% 预警；引用 ≤30% 且注明来源；生成 prompt 禁改写现有文章。
- **API 与组织（C-9）**：端点 `/api/v1/*`；统一响应；单文件 ≤300 行；入口只装配；openapi.yaml 为唯一契约。
- **依赖核验（C-10）**：版本以 lockfile 实际解析为准，禁凭印象写版本；构建/类型/lint 为必过门禁。
- 不支持 IE；响应式断点移动优先；首屏 <3s，API p95 <500ms（流式除外）；Chrome/Safari/Firefox 最新 2 版。

---

## 11. 内嵌已知坑（来自架构师 R-1..R-9，Phase 3 开发前注入前端/后端 prompt）

| 坑 | 技术栈指纹 | 根因 | 修法 |
|----|------------|------|------|
| R-1 一套 HTML 兼容双平台不成立 | next.js-16 / prose-mirror | 微信认内联、头条剥内联 | Block AST + 双渲染器，禁伪兼容 |
| R-2 自动发布封号 | wechat-mp | 非真人自动化创作红线 | 仅人工粘贴导出，移除 API 发布 |
| R-3 采集合规 | toutiao-robots / weibo-tof | robots 禁抓正文、微博禁采 | 白名单硬编码+单测，不抓正文 |
| R-4 未注入 AI 标识即导出违规 | ai-label-law | 标识办法第四条第二款 | 渲染器强制注入且不可关 |
| R-5 平台规则移动靶 | wechat/toutiao | 2026 多次更新 | 固定「平台规则复核」运维项，Spec 标快照日 2026-08-16 |
| R-6 个人号 AppID 来源冲突 | wechat-mp | 二手资料矛盾 | B-2 已弃 API，MVP 无影响 |
| R-7 平台 schema 未公开且变动 | wechat/toutiao | 白名单实测结论 | 规则表配置化+快照测试 |
| R-8 机审误伤真人 | platform-ai-detect | 准确率非 100% | 保留原始 AST 与编辑历史便于申诉 |
| R-9 NAT 动态 IP 致 40164 | vercel / wechat-ip | 出口动态 | 固定 IP 云主机（Lighthouse） |

---

## 12. 端到端验证步骤（Spec 锁定的最后一项）

```bash
# 1. 构建
npm run build

# 2. 启动（含 worker）
docker compose up --build   # 等待 "Ready on http://localhost:3000"

# 3. 核心成功流：采集→选题→生成→双渲染→审核→导出
curl -X GET http://localhost:3000/api/v1/topics?domain=个人成长
# 断言：返回≥10条带 score 的选题
curl -N -X POST http://localhost:3000/api/v1/drafts/generate -H "Content-Type: application/json" -d '{"topicId":"<id>","tone":"温暖","length":"中"}'
# 断言：SSE 流式返回 Block AST，含「AI 生成」标记
curl -X GET "http://localhost:3000/api/v1/drafts/<id>/render?platform=wechat"
# 断言：HTML 含 style="" 与 <section>，且含「本文含 AI 辅助创作」
curl -X GET "http://localhost:3000/api/v1/drafts/<id>/render?platform=toutiao"
# 断言：HTML 无 inline style，仅 <p>/<h2>/<strong>/<blockquote>，含 Unicode 层级与 AI 标识

# 4. 关键错误流：未实质编辑禁止导出
curl -X POST http://localhost:3000/api/v1/drafts/<id>/export -H "Content-Type: application/json" -d '{"platform":"wechat"}'  # 未编辑
# 断言：返回 409 + 「请先对草稿做实质编辑」
```

---

## 13. 变更记录

| 日期 | 变更内容 | 原因 | 影响范围 |
|------|----------|------|----------|
| 2026-08-16 | 初版 Spec 锁定（含架构师 B-1/B-2/B-3 强制修正） | Phase 1 三文档确认 | 全局 |
| 2026-08-17 | 混元端点纠错：`api.hunyuan.cloud.tencent.com` → `tokenhub.tencentmaas.com`（TokenHub 新站，旧端点对 TokenHub Key 返回 401）；省钱档统一 `hunyuan-lite` | 真实 API Key 联调实证 | .env / registry / pricing / 文档 |
| 2026-08-17 | 部署包落地：Dockerfile + docker-compose（web/worker/pg/caddy）+ Caddyfile + deploy.sh + docs/deploy.md，本地容器全链路验证通过 | Phase 4 DevOps 交付 | 新增部署交付物 |

---

## 附：ADR 索引（架构师 Phase 2 产出 docs/decisions/ADR-001..011）

ADR-001 Next.js 16.2.11 单体全栈（排除 Vercel）｜ADR-002 Block AST + 双渲染器（核心决策）｜ADR-003 人工剪贴板粘贴放弃 draft API｜ADR-004 AI SDK 6 + 混元 Hy3 分档热切换｜ADR-005 定时仅采集、生成发布由人触发｜ADR-006 可配置加权选题筛选，不引向量检索｜ADR-007 PG17+Drizzle+JSONB，不引 pgvector｜ADR-008 采集源白名单与 robots 边界｜ADR-009 AI 标识注入不可关闭｜ADR-010 lucide-react 单一图标源｜ADR-011 Tiptap3/ProseMirror 对齐头条落地。
