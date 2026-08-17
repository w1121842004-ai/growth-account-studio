# 头条号+公众号运营工具 · 架构总览（Phase 1 交付 + Phase 2 契约）

> 首席架构师「高见远」。本文是 Phase 1 调研的持久化归档与 Phase 2 实施契约入口。

## 技术栈（版本锚定）
| 层 | 选型 | 版本 |
|----|------|------|
| 前端框架 | Next.js (App Router) | 16.2.11 |
| UI 运行时 | React | 19.2.x |
| 语言 | TypeScript | 5.x |
| 样式 | Tailwind CSS | 4 |
| 组件库 | shadcn/ui | latest |
| 图标库（P0 锁定） | lucide-react | latest（禁止 emoji 图标） |
| 富文本编辑 | Tiptap | 3 |
| 后端 | Next.js Route Handlers（单体） | 16.2.11 |
| 数据库 | PostgreSQL + Drizzle ORM | 17 / 0.38.x |
| 调度 | node-cron（仅采集） | 3.x |
| LLM 适配 | Vercel AI SDK | 6 |
| 主力模型 | 腾讯混元 Hunyuan Hy3 | — |
| 部署 | 腾讯云 Lighthouse + Docker Compose | — |

## 目录与契约文件
```
api/openapi.yaml              前后端唯一契约（v1，统一包络 {code,data,message}）
schemas/block-ast.schema.json 统一排版中间表示（双渲染器消费）
db/schema.sql                 PostgreSQL 17 DDL（Drizzle 迁移基线）
docs/decisions/ADR-001..011.md 架构决策记录（MADR）
ARCHITECTURE.md               本文件
```

## 三层数据流
```
node-cron ──采集──> hotlist_entries (toutiao/baidu 自动; weibo 人工导入)
        │
        ▼
topics (热度×相关度×竞争度 评分) ──人工选──> articles (Block AST)
        │                                            │
        │                                        Vercel AI SDK 6
        │                                            │ (hunyuan/glm/qwen 热切换)
        ▼                                            ▼
                                       articles.block_ast (Tiptap 3 编辑/改写)
                                            │
                              ┌─────────────┴─────────────┐
                      微信渲染器(全内联style)        头条渲染器(零CSS/Unicode层级)
                              └─────────────┬─────────────┘
                                    导出 HTML（强制含 AI 标识页脚）→ 真人复制粘贴发布
                                              （无自动推草稿，合规红线 ADR-007）
```

## 选题评分公式（不引入向量检索/模型训练）
total_score = 0.45·heat_score + 0.40·relevance_score − 0.15·competition_score
（加权可在 topics 表 rationale 中说明，MVP 固定权重）

## 待 team-lead 裁决的 3 项（决定 PRD 是否放行 Phase 2）
1. **B-1 排版前提推翻**：原「一套内联 HTML 兼容双平台」不成立 → 已采用 Block AST + 双渲染器（ADR-004）。需 PM 将 PRD 排版模块改为「双端渲染」。
2. **B-2 自动推送合规红线**：微信 2026-03-27「非真人自动化」条款 + 头条无草稿 API → 已移除自动推送，改真人复制粘贴（ADR-007）。需 PM 新增 C-7「真人编辑审核留痕」验收项。
3. **B-3 微博采集被禁 + 头条正文 robots 禁**：微博不自动采集（改人工导入）、竞争度不爬正文（改元数据估算）（ADR-008）。需 PM 确认接受该能力缩减。

## 已落地为文件的 Phase 2 契约（含上述强制修正）
- `api/openapi.yaml`：无 draft-push/publish 端点；/export 双 target；/review 真人留痕；/features 灰度。
- `schemas/block-ast.schema.json`：双渲染器中间表示。
- `db/schema.sql`：含 review_logs（真人留痕）、llm_configs（热切换）、feature_flags（灰度）。
- `docs/decisions/ADR-001..011.md`：11 份决策，其中 ADR-004/007/008/009 为强制修正。

## 合规红线（不可妥协）
- 微信/头条导出 = 复制粘贴，绝不自动推送（封号风险）。
- 导出 HTML 恒含「AI 辅助创作」显式标识（标识办法 第四条，不可关闭）。
- 热榜采集遵守 robots 与频率限制；微博不自动采集。
