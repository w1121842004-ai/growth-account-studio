# 成长号工坊 DESIGN.md

> 生成日期：2026-08-16 ｜ 设计师：颜好看 ｜ 基于：Spec v0.1.0（§7 页面清单 / §8 设计 Token / §10 约束 C-1..C-3）
> 三轴刻度：VARIANCE=5 / MOTION_INTENSITY=3 / VISUAL_DENSITY=4
> 设计语言：纸感编辑 Paper & Quiet —— 暖纸白背景 + 大量留白 + 衬线标题添人味 + 单一松绿强调 + 内容即主角

---

## 1. Visual Theme & Atmosphere（视觉主题与氛围）
- 关键词：轻量、留白、有人味、克制、书卷气
- 氛围：像在一张干净的大稿纸上写作——暖白底、墨黑字、一点松绿做呼吸；没有花哨装饰，没有冷蓝 SaaS 味。内容（选题、草稿、排版）始终是主角。
- 对标：Typora（沉浸式无干扰写作）/ Notion（模块化克制）/ 飞书文档（浮动工具栏·适时隐藏）/ 语雀（清爽）
- 寄存器：产品型（Product Register）—— 设计服务产品，中性色 + 单一强调色 ≤10%，着色克制。

## 2. Color Palette & Roles（色彩与角色）
- A1-identity：`--bg` 暖纸白 / `--surface` 纯白 / `--fg` 暖墨黑 / `--muted` 暖灰 / `--border` 浅暖灰
- A2-semantic：`--success` 生长绿 / `--warn` 暖琥珀 / `--danger` 克制红（均低饱和）
- B-slot：`--fg-2` 次级前景 / `--surface-warm` 三级表面 / `--meta` 元数据 / `--accent-hover` / `--accent-soft`
- C-extension：`--ai-line` 蓝→绿细线（AI 标识，非紫粉主视觉）；`--toutiao-*` 头条符号；`--wx-*` 微信内联预设
- 每屏强调色 ≤2 处；标题用 `--fg`，不用 `--accent`；CTA 与选中态才用 `--accent`。
- 配色来源：color-palettes.md #14 生产力青绿为基，背景暖化为纸白；语义色取低饱和绿/琥珀/红。

## 3. Typography（排版）
- 标题与阅读/写作内容：`--font-display` Noto Serif SC（书卷气·人味）
- UI 框架与标签：`--font-body` Noto Sans SC（克制清晰）
- 数据标签（字数/阅读时长）：`--font-mono` JetBrains Mono
- 字号阶梯：xs12 / sm14 / base16 / lg18 / xl20 / 2xl24 / 3xl30 / 4xl36
- 字重：400 正文 / 510 次标题 / 590 主标题
- 行高：正文 1.6 / 标题 1.2；正文 ≥16px
- 字距：ALL CAPS ≥ 0.06em；大标题负字距 -0.02em
- 配对来源：typography-pairings.md 中文简体思路（Noto Serif SC + Noto Sans SC 双语境）

## 4. Components（组件规范）
- 按钮：Primary(`--accent`+`--accent-on`) / Secondary(`--accent-soft`+`--accent`) / Ghost(transparent+`--fg`)；状态 default/hover/active/disabled 全覆盖。
- 输入框：default(`--surface`+`--border`) / focus(`--focus-ring`) / error(`--danger`) / disabled(`--surface-warm`+`--meta`)。
- 卡片：`--surface` + `--border` + `--radius-lg`；hover 仅边框转 `--accent`，不用阴影堆叠；禁圆角卡+彩色左边框（AI 模板味）。
- 导航：桌面左侧 Sidebar（全局框架），移动底部 TabBar（≤5 项）；选中态用 `--accent` 文字/细线。
- 图标：**lucide-react 唯一**，尺寸 行内16 / 按钮内20 / 独立24，全项目不混用（P0-1，ADR-010）；禁 emoji 功能图标。
- 双平台渲染组件：
  - 微信视图组件：消费 `--wx-*` 内联预设，输出全内联 style + `<section>`，支持颜色/背景/圆角/边框/封面。
  - 头条视图组件：消费 `--toutiao-*` 符号，输出零 inline style + 语义标签 + Unicode 层级，无颜色。
  - AI 标识组件：正文注入文字「本文含 AI 辅助创作」+ 顶部 `--ai-line` 细线；不可关闭（C-5）。

## 5. Layout & Spacing（布局与间距）
- 间距基准：4px 网格（4/8/12/16/20/24/32/40/48）。
- 圆角：sm4 / md8 / lg12 / xl16 / 2xl24 / full。
- 容器最大宽度：编辑/阅读 max-w-3xl(768px) 居中；列表 max-w-6xl(1152px)。
- 响应式：移动优先；断点 sm640 / md768 / lg1024 / xl1280。桌面左 Sidebar，移动底 TabBar。
- 网格：12 列（列表页）/ 单列书写（编辑页，留白优先）。

## 6. Depth & Elevation（深度与阴影）
- 阴影阶梯：`--shadow-xs/sm/md`，克制使用；纸感靠留白与边框，不靠重阴影。
- 层级 z：base0 / dropdown1000 / sticky1100 / modal1200 / toast1300。
- 毛玻璃：仅功能性半透明才用，不作装饰。

## 7. Do's & Don'ts（设计守则）
- ✅ 暖纸白底 + 大量留白；衬线标题添人味；单一松绿做呼吸；内容即主角。
- ✅ 图标全用 lucide-react；标题用 `--fg`；强调色每屏 ≤2 处。
- ✅ 微信稿做完整视觉层次；头条稿靠 ◆○▶【】「」+ 留白做节奏。
- ✅ 5 态全覆盖（Loading/Empty/Error/Populated/Edge）。
- ❌ 禁 emoji 作功能图标；禁紫粉渐变；禁裸 hex（走 Token）；禁占位文案；禁千篇一律 Hero。
- ❌ 头条稿不得出现任何 inline style / 颜色 / 边框 / 图标（C-3）。
- ❌ 微信稿正文不得插图（仅封面，域名 mmbiz.qpic.cn）（C-2）。
- ❌ 不依赖圆角卡+彩色左边框、不虚构指标、不用 "Welcome to / Lorem"。

## 8. Responsive & Accessibility（响应式与无障碍）
- 移动优先；触摸目标 ≥44×44px；导航移动底 TabBar。
- 对比度 ≥4.5:1（正文 `--fg` on `--bg`、白 on `--accent` 均达标）。
- 键盘可达：`:focus-visible` 用 `--focus-ring`；图标按钮带 `aria-label`。
- `prefers-reduced-motion` 下关闭微光与过渡（MOTION_INTENSITY=3，仅 hover/active + AI 骨架微光）。
- 5 态：Loading（思考中+骨架+预计时间）/ Empty（引导+示例+快速开始）/ Error（分类+重试+降级）/ Populated / Edge（超长截断+成本上限+内容安全过滤）。

## 9. Agent Implementation Guide（实现指南）
- Tailwind 4：在 `theme` 中 extend 颜色为语义名（`bg/surface/fg/muted/border/accent/...`），字体 `font-display/body/mono`，间距 `space-*`，圆角 `radius-*`；全部引用 design-tokens，禁止裸 hex（仅 #fff/#000 例外）。
- 图标：`import { ... } from 'lucide-react'`，统一 16/20/24。
- 双渲染器：微信渲染器读 `wechat` 组预设写 `style=""`；头条渲染器读 `toutiao` 组符号输出语义标签。两版共用 Block AST，不共用 HTML。
- 已知坑：微信 h1-6→p（标题靠 `--wx-h2/h3` 内联模拟）；头条禁 inline style/section/`<br>`（每行独立 `<p>`）；AI 标识强制注入不可关。

---

## 10. 双平台能力差异（强制，渲染器契约 C-1）

> 同一内容主体在双平台合规呈现，但能力互斥，必须两个独立视图，不可一个预览适配两尺寸。

| 能力 | 微信公众号视图 | 今日头条视图 |
|------|----------------|----------------|
| 渲染机制 | 全内联 `style=""` + `<section>` 嵌套 | 零 inline style + 语义标签 + Unicode 层级 |
| 颜色 / 背景 | ✅ 支持（标题色、引用块浅底） | ❌ 全剥离，纯黑字 |
| 圆角 / 边框 / 阴影 | ✅ 支持（引用左线、卡片） | ❌ 全不支持 |
| 标题层级 | 靠内联字号/字重/颜色模拟（h1-6→p） | 靠 `◆`/`○` 符号前缀 + `<h2>`/`<strong>` |
| 列表 / 引用 | `<ul>`/`<blockquote>` + 样式 | `<ol>`/`<blockquote>` + `▶`/`「」` 符号 |
| 分割线 | 1px `--border` 实线 | 空行留白 + `· · ·` |
| 图片 | 仅封面（域名 mmbiz.qpic.cn）；正文不插图 | 无图 |
| 代码块 | `<p>+<code>+&nbsp;` 模拟换行 | `<pre>` 可保留 |
| emoji | 不限（UI 层另计） | ≤2 种且不连续（内容层算法敏感） |
| AI 标识 | 文字「本文含 AI 辅助创作」+ 细线 | 同文字标识（无细线，纯文本） |

## 11. 3 套排版模板 Token 参数（仅作用于微信视图；头条视图恒为统一极简符号稿）

> 模板改变微信视觉丰富度；头条视图始终零 CSS，不受模板影响（保持可读节奏）。

### 极简 Minimal
- 标题：`--wx-h2`（18px/600/teal）；子标题 `--wx-h3`。
- 引用：`--wx-quote` 细左线；无卡片背景。
- 段距：`--space-5`(20px)；圆角 `--radius-md`；强调色仅标题+CTA。
- 气质：大留白、无多余装饰，最干净。

### 书卷 Editorial
- 标题：`--font-display` 20px/600/`--fg`（墨黑非 teal）+ 首段导语下 `--ai-line` 风格细线分隔。
- 引用块：`--accent-soft` 浅底；金句用 `【】` 视觉 + `--accent` 文字。
- 段距：`--space-6`(24px)；封面大图 + 一句题记（衬线）。
- 气质：书卷气、衬线、浅底引用、题记。

### 分栏 Column
- 标题：`--accent` 双色 + 领域 chip（`--accent-soft` 底）。
- 要点：桌面 2 列网格；金句高亮卡片 `--accent-soft`；引用左线。
- 段距：`--space-4`(16px)；视觉密度略升（DENSITY 上浮）。
- 气质：清单/方法类首选，信息密度高。

## 12. 页面清单与设计 Token 主题映射（Spec §7）
| 页面 | 路由 | Token 主题 |
|------|------|-----------|
| 工作台 Home | / | 暖纸白/松绿 |
| 选题池 | /topics | 同上 |
| 选题详情 | /topics/:id | 同上 |
| 生成工作台 | /drafts/new | 同上 |
| 审核编辑器 | /drafts/:id | 同上 |
| 双平台预览导出 | /drafts/:id/preview | 同上（双独立视图） |
| 模板管理 | /templates | 同上 |
| 设置/模型 | /settings | 同上 |
| 采集源与合规 | /sources | 同上 |
| 用量统计 | /usage | 同上 |

> 各页面提示词见 `design-system/pages/*.md`（选题池 / 生成工作台 / 审核编辑器 / 双平台预览导出 / 设置）。
