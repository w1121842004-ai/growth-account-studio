/**
 * 双渲染器规则表（config 化，Spec C-1/C-2/C-3）。
 * 单一来源：渲染器代码只读本配置，不散落硬编码样式。
 * 修改平台规则须走变更流程，并配套快照测试（R-7）。
 *
 * 版本锚定：与 Spec §4 一致（Next.js 16.2.11 / React 19.2.x / Tiptap 3.x）。
 */

import type { BlockType, Mark } from '../block-ast/types';

/** 内联样式键值对（微信渲染器使用） */
export type InlineStyle = Record<string, string>;

export interface WechatRenderRules {
  /** 外层包裹：section 嵌套，横向 padding 6px（C-2） */
  wrapper: { tag: 'section'; paddingX: string };
  /** 标题层级用全内联 style 模拟（h1–h6 转 p，C-2） */
  headingStyle: Record<1 | 2 | 3, InlineStyle>;
  /** 各 block 类型默认内联样式 */
  blockStyle: Record<BlockType, InlineStyle>;
  /** inline mark -> 内联样式 */
  inlineStyle: Record<Mark, InlineStyle>;
  /** 代码块：禁 <pre>+white-space，改 <p><code> + &nbsp;（C-2） */
  codeBlock: { renderAs: 'p>code'; useNbsp: true; whiteSpace: false };
  /** 图片：仅 mmbiz.qpic.cn 域；MVP 正文默认不插图（C-2） */
  image: { domainWhitelist: string[]; defaultInsert: false };
  /** AI 标识：渲染期强制注入页脚，不可关闭（C-5/R-4） */
  disclosure: { position: 'footer'; text: string; appendTo: 'body' };
  /** 微信允许的标签；style/link 标签禁止 */
  allowedTags: string[];
  forbiddenTags: string[];
}

export interface ToutiaoRenderRules {
  /** 头条剥内联 style（C-3） */
  stripInlineStyle: true;
  /** 禁 section 嵌套（C-3） */
  sectionNesting: false;
  wrapper: { tag: 'article' };
  /** block -> 语义标签映射（零 style） */
  semanticTagMap: Record<BlockType, string>;
  /**
   * 层级用 Unicode 符号承载（C-3/AC-10）。
   * 取值与 design-system/design-tokens.css 的 --toutiao-* 一一对应（设计师 Phase 2 产出）。
   */
  unicodeHierarchy: {
    /** 一级标题包裹（--toutiao-emphasis / --toutiao-emphasis-close） */
    titleWrap: [string, string];
    /** 二级标题前缀（--toutiao-h2，实心菱形） */
    h2: string;
    /** 三级标题前缀（--toutiao-h3，空心圆） */
    h3: string;
    /** 列表要点前缀（--toutiao-bullet，黑右三角） */
    bullet: string;
    /** 引用包裹（--toutiao-quote / --toutiao-quote-close） */
    quoteWrap: [string, string];
    /** 分割线文本（--toutiao-divider，hr 之外的文本兜底） */
    divider: string;
  };
  /** 保留 <pre>（C-3） */
  preservePre: true;
  /** 换行用独立 <p>，禁 <br> 承担换行（C-3） */
  newlineAsParagraph: true;
  noBrForNewline: true;
  /** 有序列表不用 <ol> 行号占位（C-3） */
  noEmptyOlPlaceholder: true;
  /** 内容层 emoji 上限（与 P0 功能图标禁 emoji 是两回事，C-3） */
  emojiMaxTypes: number;
  emojiNotConsecutive: boolean;
  disclosure: { position: 'footer'; text: string; appendTo: 'body' };
  allowedTags: string[];
  forbiddenTags: string[];
  /** 有序列表前缀（渲染器自行编号） */
  orderedPrefix: (i: number) => string;
}

export const WECHAT_RULES: WechatRenderRules = {
  wrapper: { tag: 'section', paddingX: '6px' },
  headingStyle: {
    1: { fontSize: '22px', fontWeight: '700', color: '#1c1917', lineHeight: '1.4', margin: '20px 0 10px' },
    2: { fontSize: '19px', fontWeight: '700', color: '#1c1917', lineHeight: '1.4', margin: '16px 0 8px' },
    3: { fontSize: '16px', fontWeight: '600', color: '#1c1917', lineHeight: '1.5', margin: '12px 0 6px' },
  },
  blockStyle: {
    paragraph: { fontSize: '16px', color: '#1c1917', lineHeight: '1.6', margin: '0 0 12px' },
    heading: {},
    quote: { padding: '10px 14px', background: '#f5f5f4', borderLeft: '3px solid #0d9488', color: '#44403c', margin: '0 0 12px' },
    list: { margin: '0 0 12px', paddingLeft: '20px' },
    orderedList: { margin: '0 0 12px', paddingLeft: '20px' },
    code: { margin: '0 0 12px' },
    image: { margin: '0 0 12px', textAlign: 'center' },
    divider: { borderTop: '1px solid #e7e5e4', margin: '16px 0' },
  },
  inlineStyle: {
    bold: { fontWeight: '700' },
    italic: { fontStyle: 'italic' },
    strike: { textDecoration: 'line-through' },
    code: { fontFamily: 'JetBrains Mono, monospace', background: '#f5f5f4', padding: '1px 4px', borderRadius: '3px', fontSize: '14px' },
    link: { color: '#0d9488', textDecoration: 'underline' },
    underline: { textDecoration: 'underline' },
  },
  codeBlock: { renderAs: 'p>code', useNbsp: true, whiteSpace: false },
  image: { domainWhitelist: ['mmbiz.qpic.cn'], defaultInsert: false },
  disclosure: { position: 'footer', text: '本文含 AI 辅助创作', appendTo: 'body' },
  allowedTags: ['section', 'p', 'br', 'strong', 'em', 'blockquote', 'code', 'ul', 'ol', 'li', 'img', 'span', 'hr'],
  forbiddenTags: ['pre', 'style', 'link'],
};

export const TOUTIAO_RULES: ToutiaoRenderRules = {
  stripInlineStyle: true,
  sectionNesting: false,
  wrapper: { tag: 'article' },
  semanticTagMap: {
    paragraph: 'p',
    heading: 'h2',
    quote: 'blockquote',
    list: 'p', // 每项以 ◆ / ▶ 前缀，独立 <p>
    orderedList: 'p', // 每项以 1. 2. 前缀，独立 <p>
    code: 'pre', // 保留 <pre>（C-3）
    image: 'img',
    divider: 'hr',
  },
  unicodeHierarchy: {
    titleWrap: ['【', '】'],
    h2: '◆ ',
    h3: '○ ',
    bullet: '▶ ',
    quoteWrap: ['「', '」'],
    divider: '· · ·',
  },
  preservePre: true,
  newlineAsParagraph: true,
  noBrForNewline: true,
  noEmptyOlPlaceholder: true,
  emojiMaxTypes: 2,
  emojiNotConsecutive: true,
  disclosure: { position: 'footer', text: '本文含 AI 辅助创作', appendTo: 'body' },
  allowedTags: ['p', 'h2', 'strong', 'em', 'blockquote', 'pre', 'img', 'hr'],
  forbiddenTags: ['section', 'style', 'ul', 'ol', 'br'],
  orderedPrefix: (i: number) => `${i}. `,
};

/** AI 标识文案（两渲染器一致，C-5） */
export const AI_DISCLOSURE_TEXT = '本文含 AI 辅助创作';

/**
 * 头条层级符号落地映射（唯一来源：design-system/design-tokens.css，逐条对齐）：
 * - heading level 1 → 【】包裹（--toutiao-emphasis / --toutiao-emphasis-close）
 * - heading level 2 → '◆ '（--toutiao-h2）
 * - heading level 3 → '○ '（--toutiao-h3）
 * - list 每项      → '▶ '（--toutiao-bullet）
 * - quote          → 「」（--toutiao-quote / --toutiao-quote-close）
 * - divider        → <hr>，纯文本导出降级 '· · ·'（--toutiao-divider）
 * 每个符号一个语义，不复用：◆ 只做二级标题，▶ 只做列表要点。符号集合固定为
 * 【】◆ ○ ▶ 「」· · ·，输出由 tests/snapshots 快照锁定（R-7），改符号须同步改 token。
 */
