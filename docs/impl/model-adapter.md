# 模型适配层实现要点（Spec F5 / AC-08 / ADR-004）

## 协议层（Vercel AI SDK 6.x）
- 三家均 OpenAI 兼容：用 `createOpenAI({ baseURL, apiKey })` 构造 provider，或 `languageModel(modelId, { baseURL, apiKey })`。
- 配置来自 `model_configs` 表（base_url/api_key/model/role/enabled），**热切换不改代码**（PUT /api/v1/models/:id）。
- 流式生成用 `streamText()`，SSE 透传（`/drafts/generate` 返回 text/event-stream）。

## 分档（tiering）
| 档位 | 模型 | role | 用途 |
|------|------|------|------|
| 主力 | Hunyuan Hy3 | primary | 草稿生成（F2） |
| 省钱档 | hunyuan-lite（免费） | fallback | 选题批量打分（/topics/score，低难度） |
| 备选 | GLM-4.6 / Qwen Plus | fallback | 主模型不可用熔断切换 |

- 选路：`primary(enabled)` → 失败切 `fallback(enabled)` 按配置优先级；lite 仅用于打分路径（不入生成主链路）。

## 熔断（circuit breaker，AC-08）
```ts
interface BreakerState { failures: number; openUntil: number; }
const breakers = new Map<string, BreakerState>(); // key = provider+model
const THRESHOLD = 5;        // 连续失败开路
const OPEN_MS = 5 * 60_000; // 半开探测前冷却
```
- 连续失败达 THRESHOLD → 开路，请求直接抛 429（映射 openapi 429），不击穿下游。
- 冷却后放行 1 次探测（半开），成功则重置 failures=0。
- 主模型开路时适配层自动选下一 enabled fallback，输出格式一致（Block AST schema 不变）。

## Prompt Cache（混元 0.25 命中，禁写日期）
- 混元支持缓存前缀，命中计费 0.25。稳定的系统提示（人设/语调/排版规则/「禁改写现有文章」C-8）作为**可缓存前缀**一次性发送。
- **禁写日期进缓存前缀**：当前日期、实时热点等易变值必须放入**用户消息（非缓存部分）**，否则每日缓存失效、且可能把旧日期注入生成（误导）。
  ```
  system (cacheable): 你是个人成长号编辑，语调温暖有共鸣，输出 Block AST，禁改写他人文章…
  user   (non-cache): 今日 2026-08-16，选题「…」，请生成草稿。
  ```
- 适配层构造消息时显式分离 `cacheControl: { type:'ephemeral' }`（或厂商等价字段）标记系统前缀。

## 成本与审计
- 每次调用写 `usages`（user_id, model, tokens_in, tokens_out, cost）；cost 按厂商单价换算人民币分（Hy3 输入1/输出4/缓存0.25 元每百万 token）。
- `/usage` 聚合返回 token/成本/导出数（Spec §5）。
- 成本上限（Spec §8 Edge 态）：单请求估算超阈值时降级到 a13b 或拒生成。

## 单元测试清单（必过）
1. 主模型 200 → 输出符合 Block AST schema（ajv 校验 block-ast.schema.json）。
2. 主模型连续 5 次 5xx → 第 6 次直接 429，且熔断开路。
3. 熔断半开：冷却后 1 次成功 → failures 重置，恢复 primary。
4. fallback 接管：primary 开路时自动选 enabled fallback，输出格式不变。
5. Prompt Cache：断言 system 消息带 cacheControl，user 消息含当日日期、不含于 system 前缀（禁写日期）。
6. 成本：mock token 计数 → usages 行 cost 与厂商单价一致。
7. 热切换：PUT /models 改 baseURL 后，下一次生成用新端点（不改代码）。
