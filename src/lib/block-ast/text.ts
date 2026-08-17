/**
 * Block AST → 纯文本。两个用途：
 * 1. 编辑距离计算（C-7/AC-06 真人留痕门禁）——只比较可见文字，忽略样式。
 * 2. 导出 text 版（openapi ExportResult.text，前端写剪贴板）。
 */
import type { Block, BlockAst, Inline } from './types';

function inlineText(children: Inline[]): string {
  return children.map((c) => c.text).join('');
}

function blockText(block: Block, orderedIndexBase = 1): string {
  switch (block.type) {
    case 'heading':
      return inlineText(block.children);
    case 'paragraph':
      return inlineText(block.children);
    case 'quote':
      return inlineText(block.children);
    case 'list':
      return block.items.map((item) => `· ${inlineText(item)}`).join('\n');
    case 'orderedList':
      return block.items.map((item, i) => `${orderedIndexBase + i}. ${inlineText(item)}`).join('\n');
    case 'code':
      return block.text;
    case 'image':
      return block.caption ? `[图片] ${block.alt}｜${block.caption}` : `[图片] ${block.alt}`;
    case 'divider':
      return '——';
  }
}

/** 段落间以空行分隔的纯文本（用于导出与人眼阅读）。 */
export function blockAstToText(ast: BlockAst): string {
  return ast.blocks.map((b) => blockText(b)).join('\n\n');
}

/** 紧凑文本：无分隔装饰，仅可见文字，用于编辑距离比较（避免结构噪声放大距离）。 */
export function blockAstToCompactText(ast: BlockAst): string {
  return ast.blocks
    .map((b) => {
      switch (b.type) {
        case 'divider':
          return '';
        case 'list':
        case 'orderedList':
          return b.items.map((item) => inlineText(item)).join('\n');
        case 'code':
          return b.text;
        case 'image':
          return `${b.alt}${b.caption ?? ''}`;
        default:
          return inlineText(b.children);
      }
    })
    .filter((s) => s.length > 0)
    .join('\n');
}

/** 首个 heading 或首段的前 40 字，作为草稿标题。 */
export function deriveTitle(ast: BlockAst): string {
  const heading = ast.blocks.find((b) => b.type === 'heading');
  if (heading && heading.type === 'heading') return inlineText(heading.children).slice(0, 60);
  const para = ast.blocks.find((b) => b.type === 'paragraph');
  if (para && para.type === 'paragraph') return inlineText(para.children).slice(0, 40);
  return '未命名草稿';
}
