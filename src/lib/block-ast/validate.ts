/**
 * Block AST 运行时校验 + 归一化（权威定义见 types.ts / block-ast.schema.json）。
 *
 * 为什么要「归一化」而不是纯拒绝：
 * 编辑器（Tiptap 3）与旧前端类型可能给出等价但形状不同的输入
 * （items 为 string[]、marks 为对象、code.language 而非 lang、paragraph.text 而非 children）。
 * API 边界统一收敛成权威形状后入库，渲染器只面对一种结构（ADR-002）。
 * 不可识别的 type 一律报错，避免静默丢内容。
 */
import type { Block, BlockAst, Inline, Mark } from './types';

export class AstError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AstError';
  }
}

const MARKS: readonly Mark[] = ['bold', 'italic', 'strike', 'code', 'link', 'underline'];
const MAX_BLOCKS = 600;

type Loose = Record<string, unknown>;

function asRecord(value: unknown, path: string): Loose {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new AstError(`${path} 必须是对象`);
  }
  return value as Loose;
}

function normalizeMarks(raw: unknown): Mark[] | undefined {
  if (Array.isArray(raw)) {
    const list = raw.filter((m): m is Mark => MARKS.includes(m as Mark));
    return list.length ? list : undefined;
  }
  if (typeof raw === 'object' && raw !== null) {
    const obj = raw as Record<string, unknown>;
    const list = MARKS.filter((m) => obj[m] === true);
    return list.length ? list : undefined;
  }
  return undefined;
}

function normalizeInline(raw: unknown, path: string): Inline {
  if (typeof raw === 'string') return { text: raw };
  const rec = asRecord(raw, path);
  const text = rec.text;
  if (typeof text !== 'string') throw new AstError(`${path}.text 必须是字符串`);
  const marks = normalizeMarks(rec.marks);
  const href = typeof rec.href === 'string' ? rec.href : undefined;
  const inline: Inline = { text };
  if (marks) inline.marks = marks;
  if (href) inline.href = href;
  if (marks?.includes('link') && !href) {
    // link 缺 href 时降级为普通文本，避免渲染出空 <a>
    inline.marks = marks.filter((m) => m !== 'link');
    if (inline.marks.length === 0) delete inline.marks;
  }
  return inline;
}

/** children 归一：支持 children 数组、纯 text 字段、字符串数组 */
function normalizeChildren(rec: Loose, path: string): Inline[] {
  if (Array.isArray(rec.children)) {
    return rec.children.map((c, i) => normalizeInline(c, `${path}.children[${i}]`));
  }
  if (typeof rec.text === 'string') return [{ text: rec.text }];
  return [];
}

/** items 归一：支持 Inline[][]、string[]、{children:[]}[] */
function normalizeItems(rec: Loose, path: string): Inline[][] {
  const raw = rec.items;
  if (!Array.isArray(raw)) throw new AstError(`${path}.items 必须是数组`);
  return raw.map((item, i) => {
    const p = `${path}.items[${i}]`;
    if (typeof item === 'string') return [{ text: item }];
    if (Array.isArray(item)) return item.map((c, j) => normalizeInline(c, `${p}[${j}]`));
    const asObj = asRecord(item, p);
    if (Array.isArray(asObj.children)) return normalizeChildren(asObj, p);
    return [normalizeInline(asObj, p)];
  });
}

function normalizeLevel(raw: unknown): 1 | 2 | 3 {
  const n = typeof raw === 'number' ? Math.trunc(raw) : 2;
  if (n <= 1) return 1;
  if (n >= 3) return 3;
  return 2;
}

function normalizeBlock(raw: unknown, index: number): Block {
  const path = `blocks[${index}]`;
  const rec = asRecord(raw, path);
  const type = rec.type;
  switch (type) {
    case 'heading':
      return { type: 'heading', level: normalizeLevel(rec.level), children: normalizeChildren(rec, path) };
    case 'paragraph':
      return { type: 'paragraph', children: normalizeChildren(rec, path) };
    case 'quote':
      return { type: 'quote', children: normalizeChildren(rec, path) };
    case 'list':
      return { type: 'list', items: normalizeItems(rec, path) };
    case 'orderedList':
      return { type: 'orderedList', items: normalizeItems(rec, path) };
    case 'code': {
      const text = typeof rec.text === 'string' ? rec.text : '';
      const lang =
        typeof rec.lang === 'string' ? rec.lang : typeof rec.language === 'string' ? rec.language : undefined;
      return lang ? { type: 'code', lang, text } : { type: 'code', text };
    }
    case 'image': {
      if (typeof rec.src !== 'string' || rec.src.length === 0) {
        throw new AstError(`${path}.src 必填（image 块）`);
      }
      const alt = typeof rec.alt === 'string' ? rec.alt : '';
      const caption = typeof rec.caption === 'string' ? rec.caption : undefined;
      return caption ? { type: 'image', src: rec.src, alt, caption } : { type: 'image', src: rec.src, alt };
    }
    case 'divider':
      return { type: 'divider' };
    default:
      throw new AstError(`${path}.type 不在允许枚举内：${String(type)}`);
  }
}

/** 归一化并校验 Block AST；失败抛 AstError（路由层映射 400）。 */
export function normalizeBlockAst(input: unknown): BlockAst {
  const rec = asRecord(input, 'blocks');
  const raw = Array.isArray(rec.blocks) ? rec.blocks : Array.isArray(input) ? (input as unknown[]) : null;
  if (!raw) throw new AstError('blocks 必须是 {version, blocks[]} 结构');
  if (raw.length === 0) throw new AstError('blocks 不能为空');
  if (raw.length > MAX_BLOCKS) throw new AstError(`blocks 数量超过上限 ${MAX_BLOCKS}`);
  return { version: '1.0', blocks: raw.map(normalizeBlock) };
}

/** 宽松判定：用于 SSE 单块解析，失败返回 null 而不抛 */
export function tryNormalizeBlock(input: unknown): Block | null {
  try {
    return normalizeBlock(input, 0);
  } catch {
    return null;
  }
}
