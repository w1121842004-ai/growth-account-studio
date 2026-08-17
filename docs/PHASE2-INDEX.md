# Phase 2 详细设计交付索引（成长号工坊 MVP）

> 基于锁定 Spec（/docs/Spec.md，2026-08-16）产出。架构师「高见远」。
> 对应 Spec 附录 ADR-001~011。本目录为 Phase 2 权威来源；`mvp-toutiao-ops/`（Phase 1 草稿，pre-Spec）已作废。

## 交付物清单

| # | 交付物 | 路径 | 对应 Spec |
|---|--------|------|-----------|
| 1 | API 契约 openapi.yaml（§5 全端点 + 认证 + 错误码含 409 未实质编辑） | `api/openapi.yaml` | §5、§12 |
| 2 | DB Schema（Drizzle，7 表，JSONB，topics 唯一索引） | `db/schema.ts` | §6 |
| 3 | Block AST Schema（JSON + TS 类型，type 枚举 + marks） | `schemas/block-ast.schema.json`、`schemas/block-ast.types.ts` | §6 |
| 4 | 双渲染器规则表（config 化） | `config/renderer-rules.ts`、`config/renderer-rules.md` | C-1/C-2/C-3 |
| 5 | ADR-001~011（MADR，按 Spec 附录索引） | `decisions/ADR-001..011.md` | 附录 |
| 6a | 采集 Worker 实现要点 | `impl/collection-worker.md` | AC-02/C-4/ADR-005/008 |
| 6b | 模型适配层实现要点 | `impl/model-adapter.md` | F5/AC-08/ADR-004 |

## 端点覆盖（Spec §5，15 个 + 认证 4 个）
auth: register/login/refresh/me
topics: GET /topics、POST /topics/score、GET /topics/:id
drafts: POST /drafts/generate(SSE)、GET /drafts/:id、PUT /drafts/:id、GET /drafts/:id/render、POST /drafts/:id/export(409 未实质编辑)
models: GET /models、PUT /models/:id
sources: GET /sources、PUT /sources/:id
usage: GET /usage
settings: GET /settings、PUT /settings

## 关键约定
- 统一响应 `{code,data,message}`；分页 `{items,total,page,limit,hasMore}`；前缀 `/api/v1`。
- 错误码：400 参数 / 401 未认证 / 404 不存在 / 409 **未实质编辑禁止导出** / 422 语义校验 / 429 限流熔断 / 500 内部。
- Block AST：无 CSS，type ∈ paragraph/heading/quote/list/orderedList/code/image/divider，marks 在 inline 节点。
- 双渲染器：微信全内联 style + section；头条零 style + 语义标签 + Unicode 层级（◆▶【】）+ 保留 pre。规则 config 化于 renderer-rules.ts。
- AI 标识：渲染期强制注入「本文含 AI 辅助创作」，不可关闭（C-5）。

## P0 自检结果
- 文档禁 emoji：通过。后端文档（openapi/db/ADR/impl）零 emoji 图标；头条层级用 Unicode 符号 ◆▶【】（内容层，Spec C-3 允许，非功能图标 emoji）。
- 图标不出现在后端文档：通过。lucide-react 仅前端 UI 层；ADR-010 明确后端文档零图标。
- 版本按 Spec §4 锚定：通过。openapi.yaml info、db/schema.ts 注释、各 ADR 均锚定 Next.js 16.2.11 / React 19.2.x / TS 5.x / Drizzle 最新稳定 / PG17 / AI SDK 6.x / node-cron 最新稳定 / Hunyuan Hy3 端点。

## 与前端/产品协同
- 前端：依 openapi.yaml 生成 TS 类型 + MSW Mock；双预览框读 /render 双平台 HTML；复制由前端剪贴板完成。
- 产品：确认 §6 七表与 §5 端点即验收依据（QA 以 Spec §9 EARS 为准）。
- 设计：渲染规则与「暖纸白/松绿」Token 在前端实现；图标锁 lucide-react（ADR-010）。
