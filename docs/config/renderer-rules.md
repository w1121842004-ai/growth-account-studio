# 双渲染器规则表（Spec C-1/C-2/C-3）

> 机器可读配置见同目录 `renderer-rules.ts`（渲染器唯一来源，禁止散落硬编码）。本表供人工评审。

## 微信渲染器（全内联 style）

| 维度 | 规则 |
|------|------|
| 外层包裹 | `<section>`，横向 padding `6px` |
| 标题层级 | h1–h6 转 `<p>`，层级用内联样式模拟（headingStyle：22/19/16px，松绿#0d9488 仅强调不用） |
| block 默认样式 | blockStyle 映射（段落 16px/行高1.6、引用左侧 3px 松绿边框、分割线 1px 浅暖灰） |
| inline mark | inlineStyle：bold→700、italic→italic、code→JetBrains Mono 浅底、link→松绿下划线 |
| 代码块 | **禁 `<pre>`+white-space**（换行丢）；改 `<p><code>` + `&nbsp;`（codeBlock.whiteSpace=false） |
| 图片 | 域名仅 `mmbiz.qpic.cn`；**MVP 正文默认不插图**，封面人工上传（image.defaultInsert=false） |
| 允许标签 | section, p, br, strong, em, blockquote, code, ul, ol, li, img, span, hr |
| 禁止标签 | pre, style, link |
| AI 标识 | 页脚强制注入「本文含 AI 辅助创作」，不可关闭（C-5） |

## 头条渲染器（零 inline style）

| 维度 | 规则 |
|------|------|
| 内联样式 | **全量剥离**（stripInlineStyle=true） |
| 外层包裹 | `<article>`；**禁 `<section>` 嵌套**（sectionNesting=false） |
| 语义标签 | paragraph→p、heading→h2、quote→blockquote、code→pre、divider→hr、image→img |
| 层级符号 | h1 前缀 `◆ `、h2 前缀 `▶ `、标题用 `【】` 包裹（unicodeHierarchy） |
| 列表 | list/orderedList 每项独立 `<p>`，前缀 `◆ `/`▶ ` 或 `1. 2.`；**不用 `<ul>/<ol>` 行号占位**（noEmptyOlPlaceholder） |
| 代码块 | **保留 `<pre>`**（preservePre=true） |
| 换行 | **禁 `<br>` 承担换行**，每行独立 `<p>`（noBrForNewline） |
| 允许标签 | p, h2, strong, em, blockquote, pre, img, hr |
| 禁止标签 | section, style, ul, ol, br |
| 内容 emoji | 最多 2 种且不连续（emojiMaxTypes=2，emojiNotConsecutive）；与 P0 禁功能图标 emoji 是两回事 |
| AI 标识 | 页脚强制注入「本文含 AI 辅助创作」，不可关闭（C-5） |

## 共用约束
- 两版内容主体一致，仅适配项差异化（AC-04/AC-07）。
- AI 标识文案统一：`本文含 AI 辅助创作`（AI_DISCLOSURE_TEXT）。
- 每个渲染器配快照测试，输出变化须显式 review（R-7）。
