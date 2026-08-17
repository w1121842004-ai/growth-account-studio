/**
 * 流式输出 → Block AST 增量解析。
 * 主路径：模型按约定逐行输出 JSON（prompts.DRAFT_SYSTEM）。
 * 兜底：模型退化成 Markdown 时按行转换（标题/引用/列表/分割线/段落），避免整次生成报废。
 */
import type { Block, Inline, Mark } from '../block-ast/types';
import { tryNormalizeBlock } from '../block-ast/validate';

const FENCE = /^```/;

/** 行内 Markdown → Inline[]（仅 bold/italic/code，与 prompts 允许的 marks 对齐） */
export function parseInline(raw: string): Inline[] {
  const out: Inline[] = [];
  const re = /(\*\*|__)(.+?)\1|(\*|_)(.+?)\3|`([^`]+)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    if (m.index > last) out.push({ text: raw.slice(last, m.index) });
    const marks: Mark[] = m[2] ? ['bold'] : m[4] ? ['italic'] : ['code'];
    out.push({ text: m[2] ?? m[4] ?? m[5], marks });
    last = m.index + m[0].length;
  }
  if (last < raw.length) out.push({ text: raw.slice(last) });
  return out.length ? out : [{ text: raw }];
}

function markdownBlock(line: string): Block | null {
  const t = line.trim();
  if (!t) return null;
  const heading = /^(#{1,6})\s+(.*)$/.exec(t);
  if (heading) {
    const level = Math.min(3, heading[1].length) as 1 | 2 | 3;
    return { type: 'heading', level, children: parseInline(heading[2]) };
  }
  if (/^>\s?/.test(t)) return { type: 'quote', children: parseInline(t.replace(/^>\s?/, '')) };
  if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) return { type: 'divider' };
  return { type: 'paragraph', children: parseInline(t) };
}

function listItem(line: string): { ordered: boolean; text: string } | null {
  const t = line.trim();
  const un = /^[-*+·]\s+(.*)$/.exec(t);
  if (un) return { ordered: false, text: un[1] };
  const or = /^\d{1,2}[.)]\s+(.*)$/.exec(t);
  if (or) return { ordered: true, text: or[1] };
  return null;
}

/**
 * 增量解析器：喂入流式文本片段，吐出已完整的 Block。
 * 连续列表项会合并为一个 list/orderedList 块（在遇到非列表行或 end() 时 flush）。
 */
export class StreamingBlockParser {
  private buffer = '';
  private pendingItems: Inline[][] = [];
  private pendingOrdered = false;
  private codeLines: string[] | null = null;
  private codeLang: string | undefined;

  push(chunk: string): Block[] {
    this.buffer += chunk;
    const blocks: Block[] = [];
    let idx = this.buffer.indexOf('\n');
    while (idx >= 0) {
      const line = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 1);
      blocks.push(...this.consumeLine(line));
      idx = this.buffer.indexOf('\n');
    }
    return blocks;
  }

  /** 冲刷残留（流结束时调用） */
  end(): Block[] {
    const blocks: Block[] = [];
    if (this.buffer.trim()) {
      blocks.push(...this.consumeLine(this.buffer));
      this.buffer = '';
    }
    if (this.codeLines && this.codeLines.length) {
      blocks.push(this.flushCode());
    }
    const list = this.flushList();
    if (list) blocks.push(list);
    return blocks;
  }

  private flushList(): Block | null {
    if (this.pendingItems.length === 0) return null;
    const items = this.pendingItems;
    const ordered = this.pendingOrdered;
    this.pendingItems = [];
    this.pendingOrdered = false;
    return ordered ? { type: 'orderedList', items } : { type: 'list', items };
  }

  private flushCode(): Block {
    const text = (this.codeLines ?? []).join('\n');
    const lang = this.codeLang;
    this.codeLines = null;
    this.codeLang = undefined;
    return lang ? { type: 'code', lang, text } : { type: 'code', text };
  }

  private consumeLine(rawLine: string): Block[] {
    const out: Block[] = [];
    const line = rawLine.replace(/\r$/, '');

    // 代码围栏（模型偶发包裹 ```json，需吸收掉而非当正文）
    if (FENCE.test(line.trim())) {
      if (this.codeLines) {
        out.push(this.flushCode());
      } else {
        const lang = line.trim().slice(3).trim();
        this.codeLines = [];
        this.codeLang = lang && lang !== 'json' ? lang : undefined;
      }
      return out;
    }
    if (this.codeLines) {
      this.codeLines.push(line);
      return out;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      const list = this.flushList();
      if (list) out.push(list);
      return out;
    }

    // 主路径：JSON 行
    if (trimmed.startsWith('{')) {
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        parsed = null;
      }
      const block = parsed ? tryNormalizeBlock(parsed) : null;
      if (block) {
        const list = this.flushList();
        if (list) out.push(list);
        out.push(block);
        return out;
      }
    }

    // 兜底：Markdown 行
    const item = listItem(trimmed);
    if (item) {
      if (this.pendingItems.length && this.pendingOrdered !== item.ordered) {
        const list = this.flushList();
        if (list) out.push(list);
      }
      this.pendingOrdered = item.ordered;
      this.pendingItems.push(parseInline(item.text));
      return out;
    }

    const list = this.flushList();
    if (list) out.push(list);
    const block = markdownBlock(trimmed);
    if (block) out.push(block);
    return out;
  }
}

/** 一次性解析整段文本（打分兜底、测试用）。 */
export function parseBlocks(text: string): Block[] {
  const parser = new StreamingBlockParser();
  return [...parser.push(text), ...parser.end()];
}

/** 提取逐行 JSON 对象（打分响应解析）。 */
export function parseJsonLines(text: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim().replace(/,$/, '');
    if (!t.startsWith('{')) continue;
    try {
      const parsed: unknown = JSON.parse(t);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        out.push(parsed as Record<string, unknown>);
      }
    } catch {
      // 跳过截断行
    }
  }
  return out;
}
