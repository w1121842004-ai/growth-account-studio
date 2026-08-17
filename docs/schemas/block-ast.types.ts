/**
 * Block AST — 统一排版中间表示（Spec §6）。
 * 单一事实源，由 Tiptap 3 编辑产出，双渲染器（微信/头条）消费。
 * 权威 JSON Schema 见同目录 block-ast.schema.json。
 *
 * 设计约束（Spec C-1/C-2/C-3）：
 * - 无 CSS：样式不进入 AST，由渲染器按规则注入。
 * - type 枚举固定为 paragraph/heading/quote/list/orderedList/code/image/divider（不扩展 callout/table，避免 MVP 过度设计）。
 * - marks 落在 inline 节点上，不在 block 上。
 */

export type BlockType =
  | 'paragraph'
  | 'heading'
  | 'quote'
  | 'list'
  | 'orderedList'
  | 'code'
  | 'image'
  | 'divider';

export type Mark = 'bold' | 'italic' | 'strike' | 'code' | 'link' | 'underline';

export interface Inline {
  text: string;
  /** 行内标记；link 必须配合 href */
  marks?: Mark[];
  href?: string;
}

export type Block =
  | HeadingBlock
  | ParagraphBlock
  | QuoteBlock
  | ListBlock
  | OrderedListBlock
  | CodeBlock
  | ImageBlock
  | DividerBlock;

export interface HeadingBlock {
  type: 'heading';
  level: 1 | 2 | 3;
  children: Inline[];
}

export interface ParagraphBlock {
  type: 'paragraph';
  children: Inline[];
}

export interface QuoteBlock {
  type: 'quote';
  children: Inline[];
}

/** list：无序列表，items 为列表项数组，每项是一组 Inline */
export interface ListBlock {
  type: 'list';
  items: Inline[][];
}

/** orderedList：有序列表，渲染器自行编号（头条禁 <ol> 行号占位，见渲染规则） */
export interface OrderedListBlock {
  type: 'orderedList';
  items: Inline[][];
}

export interface CodeBlock {
  type: 'code';
  lang?: string;
  text: string;
}

export interface ImageBlock {
  type: 'image';
  src: string;
  alt: string;
  caption?: string;
}

export interface DividerBlock {
  type: 'divider';
}

export interface BlockAst {
  version: '1.0';
  blocks: Block[];
}

/** 编辑距离动作摘要（edit_trails.actions） */
export type EditAction = 'insert' | 'delete' | 'replace' | 'move' | 'style';
