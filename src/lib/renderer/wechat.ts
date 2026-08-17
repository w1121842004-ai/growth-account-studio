/**
 * 渲染器 A：微信公众号（全内联 style + <section> 嵌套，Spec C-2/AC-04）。
 * 规则只来自 rules.ts 的 WECHAT_RULES，禁止在此硬编码样式值。
 *
 * 关键约束：
 * - h1–h6 一律转 <p>，标题层级靠内联样式模拟（微信编辑器会吞 h 标签样式）。
 * - 禁 <pre> + white-space（换行会丢），代码块用 <p><code> 每行一段 + &nbsp; 保形。
 * - 正文图片仅 mmbiz.qpic.cn；其余域名不输出 <img>（MVP 正文默认不插图，封面人工上传）。
 * - 链接：微信允许标签集不含 <a>，故降级为「文本（链接：URL）」，避免静默丢失 URL。
 * - 页脚强制注入 AI 标识，字号与正文一致（不缩小），不可关闭（C-5/ADR-009）。
 */
import type { Block, BlockAst, Inline } from '../block-ast/types';
import { escapeHtml, mergeStyle, preserveSpaces, splitLines, styleAttr } from './escape';
import { AI_DISCLOSURE_TEXT, WECHAT_RULES as R } from './rules';

function inlineHtml(nodes: Inline[]): string {
  return nodes.map(renderInline).join('');
}

function renderInline(node: Inline): string {
  const marks = node.marks ?? [];
  let html = escapeHtml(node.text);
  if (marks.includes('code')) {
    html = `<code${styleAttr(R.inlineStyle.code)}>${html}</code>`;
  }
  const spanStyle = mergeStyle(
    marks.includes('strike') ? R.inlineStyle.strike : undefined,
    marks.includes('underline') ? R.inlineStyle.underline : undefined,
    marks.includes('link') ? R.inlineStyle.link : undefined,
  );
  if (Object.keys(spanStyle).length > 0) {
    html = `<span${styleAttr(spanStyle)}>${html}</span>`;
  }
  if (marks.includes('italic')) html = `<em${styleAttr(R.inlineStyle.italic)}>${html}</em>`;
  if (marks.includes('bold')) html = `<strong${styleAttr(R.inlineStyle.bold)}>${html}</strong>`;
  if (marks.includes('link') && node.href) {
    html += `<span${styleAttr(R.blockStyle.paragraph)}>（链接：${escapeHtml(node.href)}）</span>`;
  }
  return html;
}

function paragraph(children: Inline[]): string {
  return `<p${styleAttr(R.blockStyle.paragraph)}>${inlineHtml(children)}</p>`;
}

function heading(level: 1 | 2 | 3, children: Inline[]): string {
  // h1–h6 转 p（C-2），层级只由内联样式承载
  return `<p${styleAttr(R.headingStyle[level])}>${inlineHtml(children)}</p>`;
}

function quote(children: Inline[]): string {
  const style = mergeStyle(R.blockStyle.quote, { fontSize: R.blockStyle.paragraph.fontSize });
  return `<blockquote${styleAttr(style)}><p${styleAttr({
    margin: '0',
    fontSize: R.blockStyle.paragraph.fontSize,
    lineHeight: R.blockStyle.paragraph.lineHeight,
    color: R.blockStyle.quote.color ?? R.blockStyle.paragraph.color,
  })}>${inlineHtml(children)}</p></blockquote>`;
}

function list(items: Inline[][], ordered: boolean): string {
  const tag = ordered ? 'ol' : 'ul';
  const style = ordered ? R.blockStyle.orderedList : R.blockStyle.list;
  const li = items
    .map(
      (item) =>
        `<li${styleAttr({
          fontSize: R.blockStyle.paragraph.fontSize,
          color: R.blockStyle.paragraph.color,
          lineHeight: R.blockStyle.paragraph.lineHeight,
          margin: '0 0 6px',
        })}>${inlineHtml(item)}</li>`,
    )
    .join('');
  return `<${tag}${styleAttr(style)}>${li}</${tag}>`;
}

/** 代码块：禁 pre，逐行 <p><code>，空格转 &nbsp; 保形（C-2） */
function code(text: string): string {
  const lines = splitLines(text);
  const wrapStyle = mergeStyle(R.blockStyle.code, { background: '#f5f5f4', padding: '10px 12px' });
  const body = lines
    .map(
      (line) =>
        `<p${styleAttr({ margin: '0', lineHeight: '1.6' })}><code${styleAttr(
          R.inlineStyle.code,
        )}>${line.length ? preserveSpaces(line) : '&nbsp;'}</code></p>`,
    )
    .join('');
  return `<section${styleAttr(wrapStyle)}>${body}</section>`;
}

function image(src: string, alt: string, caption?: string): string {
  const allowed = R.image.domainWhitelist.some((domain) => {
    try {
      return new URL(src).hostname.endsWith(domain);
    } catch {
      return false;
    }
  });
  if (!allowed) {
    // 非白名单域名不输出 img（微信会剥离外链图），显式留占位文字避免静默丢内容
    return `<p${styleAttr(R.blockStyle.paragraph)}>［配图待人工上传：${escapeHtml(
      alt || caption || '未命名图片',
    )}］</p>`;
  }
  const img = `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}"${styleAttr({
    maxWidth: '100%',
    display: 'block',
    margin: '0 auto',
  })} />`;
  const cap = caption
    ? `<p${styleAttr(mergeStyle(R.blockStyle.paragraph, { fontSize: '14px', textAlign: 'center' }))}>${escapeHtml(
        caption,
      )}</p>`
    : '';
  return `<section${styleAttr(R.blockStyle.image)}>${img}${cap}</section>`;
}

function renderBlock(block: Block): string {
  switch (block.type) {
    case 'heading':
      return heading(block.level, block.children);
    case 'paragraph':
      return paragraph(block.children);
    case 'quote':
      return quote(block.children);
    case 'list':
      return list(block.items, false);
    case 'orderedList':
      return list(block.items, true);
    case 'code':
      return code(block.text);
    case 'image':
      return image(block.src, block.alt, block.caption);
    case 'divider':
      return `<hr${styleAttr(R.blockStyle.divider)} />`;
  }
}

/** AI 标识（C-5/ADR-009）：字号与正文一致、不可关闭、页脚位置 */
function disclosure(): string {
  const style = mergeStyle(R.blockStyle.paragraph, {
    margin: '20px 0 0',
    paddingTop: '10px',
    borderTop: '1px solid #e7e5e4',
    color: '#57534e',
  });
  return `<p${styleAttr(style)}>${escapeHtml(AI_DISCLOSURE_TEXT)}</p>`;
}

/** 渲染微信版 HTML（可直接粘贴进公众号编辑器）。 */
export function renderWechat(ast: BlockAst): string {
  const body = ast.blocks.map(renderBlock).join('');
  const wrapperStyle = styleAttr({
    paddingLeft: R.wrapper.paddingX,
    paddingRight: R.wrapper.paddingX,
    fontSize: R.blockStyle.paragraph.fontSize,
    color: R.blockStyle.paragraph.color,
    lineHeight: R.blockStyle.paragraph.lineHeight,
  });
  return `<${R.wrapper.tag}${wrapperStyle}>${body}${disclosure()}</${R.wrapper.tag}>`;
}
