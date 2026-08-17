/**
 * 渲染器 B：今日头条（零 inline style + 语义标签 + Unicode 层级，Spec C-3/AC-04/AC-10）。
 * 规则只来自 rules.ts 的 TOUTIAO_RULES；输出中不得出现任何 style= / section / ul / ol / br。
 *
 * 关键约束：
 * - 层级只由 Unicode 符号承载：level1 【】、level2 ◆、level3 ○、列表 ▶、引用 「」（design-token 对齐）。
 * - 列表不用 <ul>/<ol>（禁行号占位），每项独立 <p>。
 * - 换行不用 <br>，一行一个 <p>（noBrForNewline）。
 * - <pre> 保留（preservePre）。
 * - 内容层 emoji ≤2 种且不连续（emojiMaxTypes/emojiNotConsecutive）。
 * - 页脚强制注入 AI 标识，不可关闭（C-5/ADR-009）。
 */
import type { Block, BlockAst, Inline } from '../block-ast/types';
import { applyEmojiPolicy, escapeHtml, splitLines } from './escape';
import { AI_DISCLOSURE_TEXT, TOUTIAO_RULES as R } from './rules';

const POLICY = { maxTypes: R.emojiMaxTypes, notConsecutive: R.emojiNotConsecutive };

interface Ctx {
  /** 全篇 emoji 种类共享集合（跨块累计，保证「最多 2 种」是全文口径） */
  emoji: Set<string>;
}

function text(raw: string, ctx: Ctx): string {
  return escapeHtml(applyEmojiPolicy(raw, POLICY, ctx.emoji));
}

/**
 * 行内渲染：允许标签仅 strong/em，其余 mark 降级为纯文本。
 * 链接同样无 <a>（allowedTags 不含），降级为「文本（链接：URL）」与微信版保持内容一致（AC-04）。
 */
function renderInline(node: Inline, ctx: Ctx): string {
  const marks = node.marks ?? [];
  let html = text(node.text, ctx);
  if (marks.includes('italic')) html = `<em>${html}</em>`;
  if (marks.includes('bold')) html = `<strong>${html}</strong>`;
  if (marks.includes('link') && node.href) html += `（链接：${escapeHtml(node.href)}）`;
  return html;
}

function inlineHtml(nodes: Inline[], ctx: Ctx): string {
  return nodes.map((n) => renderInline(n, ctx)).join('');
}

/** 换行拆段（禁 br）：把含 \n 的 inline 序列切成多组 */
function paragraphs(nodes: Inline[], ctx: Ctx): string[] {
  const groups: Inline[][] = [[]];
  for (const node of nodes) {
    const parts = splitLines(node.text);
    parts.forEach((part, i) => {
      if (i > 0) groups.push([]);
      if (part.length > 0) groups[groups.length - 1].push({ ...node, text: part });
    });
  }
  return groups.filter((g) => g.length > 0).map((g) => `<p>${inlineHtml(g, ctx)}</p>`);
}

function headingPrefix(level: 1 | 2 | 3): [string, string] {
  const u = R.unicodeHierarchy;
  if (level === 1) return [u.titleWrap[0], u.titleWrap[1]];
  if (level === 2) return [u.h2, ''];
  return [u.h3, ''];
}

function heading(level: 1 | 2 | 3, children: Inline[], ctx: Ctx): string {
  const [open, close] = headingPrefix(level);
  const tag = R.semanticTagMap.heading;
  return `<${tag}>${escapeHtml(open)}${inlineHtml(children, ctx)}${escapeHtml(close)}</${tag}>`;
}

function quote(children: Inline[], ctx: Ctx): string {
  const [open, close] = R.unicodeHierarchy.quoteWrap;
  return `<blockquote><p>${escapeHtml(open)}${inlineHtml(children, ctx)}${escapeHtml(close)}</p></blockquote>`;
}

/** 列表：每项独立 <p>，无序用 ▶ 前缀，有序用 orderedPrefix（禁 ul/ol） */
function list(items: Inline[][], ordered: boolean, ctx: Ctx): string {
  return items
    .map((item, i) => {
      const prefix = ordered ? R.orderedPrefix(i + 1) : R.unicodeHierarchy.bullet;
      return `<p>${escapeHtml(prefix)}${inlineHtml(item, ctx)}</p>`;
    })
    .join('');
}

function code(raw: string): string {
  // <pre> 保留（C-3）；内容仅转义，不做 emoji 治理（代码原样）
  return `<pre>${escapeHtml(raw)}</pre>`;
}

function image(src: string, alt: string, caption: string | undefined, ctx: Ctx): string {
  const img = `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" />`;
  return caption ? `${img}<p>${text(caption, ctx)}</p>` : img;
}

function renderBlock(block: Block, ctx: Ctx): string {
  switch (block.type) {
    case 'heading':
      return heading(block.level, block.children, ctx);
    case 'paragraph':
      return paragraphs(block.children, ctx).join('');
    case 'quote':
      return quote(block.children, ctx);
    case 'list':
      return list(block.items, false, ctx);
    case 'orderedList':
      return list(block.items, true, ctx);
    case 'code':
      return code(block.text);
    case 'image':
      return image(block.src, block.alt, block.caption, ctx);
    case 'divider':
      return `<${R.semanticTagMap.divider} />`;
  }
}

/** AI 标识（C-5/ADR-009）：语义 <p>，无样式、不缩小、不可关闭 */
function disclosure(): string {
  return `<p>${escapeHtml(AI_DISCLOSURE_TEXT)}</p>`;
}

/** 渲染头条版 HTML（可直接粘贴进头条编辑器）。 */
export function renderToutiao(ast: BlockAst): string {
  const ctx: Ctx = { emoji: new Set<string>() };
  const body = ast.blocks.map((b) => renderBlock(b, ctx)).join('');
  return `<${R.wrapper.tag}>${body}${disclosure()}</${R.wrapper.tag}>`;
}
