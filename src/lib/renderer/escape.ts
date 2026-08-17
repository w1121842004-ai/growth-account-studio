/**
 * 渲染器共用底座：HTML 转义、内联样式序列化、内容层 emoji 治理。
 * 渲染器只经此模块产出字符串，禁止各自手写转义（漏转义即 XSS/排版错乱）。
 */
import type { InlineStyle } from './rules';

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

/** camelCase → kebab-case（fontSize → font-size） */
function kebab(key: string): string {
  return key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

/** 序列化为 style="a:b;c:d"；空样式返回空串（不产出 style=""） */
export function styleAttr(style: InlineStyle | undefined): string {
  if (!style) return '';
  const entries = Object.entries(style).filter(([, v]) => v !== undefined && v !== '');
  if (entries.length === 0) return '';
  const css = entries.map(([k, v]) => `${kebab(k)}:${v}`).join(';');
  return ` style="${escapeHtml(css)}"`;
}

/** 合并多组内联样式（后者覆盖前者） */
export function mergeStyle(...styles: (InlineStyle | undefined)[]): InlineStyle {
  return Object.assign({}, ...styles.filter(Boolean)) as InlineStyle;
}

/** 文本按换行切成多段（头条禁 <br> 承担换行，C-3） */
export function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}

/** 首尾空格 → &nbsp;（微信代码块保形，C-2） */
export function preserveSpaces(text: string): string {
  return escapeHtml(text).replace(/ {2,}/g, (m) => '&nbsp;'.repeat(m.length)).replace(/^ /gm, '&nbsp;');
}

/**
 * Emoji 匹配：Extended_Pictographic 覆盖绝大多数表情。
 *
 * 注意 ▶（U+25B6）在 Unicode 里属于 Extended_Pictographic，但它是头条层级体系的
 * 列表要点符号（--toutiao-bullet），不是内容层表情。若不豁免，会出现两个后果：
 * 1. 正文里出现 ▶ 时白占「最多 2 种」配额，真表情反而被删（沉默逻辑错误）；
 * 2. 渲染器给列表加的 ▶ 前缀与 emoji 上限口径打架，外部按 Extended_Pictographic
 *    复核最终 HTML 会算出「3 种 emoji」。
 * 所以此处显式豁免层级符号集合，policy 与审计口径一致。
 */
const HIERARCHY_SYMBOLS = new Set(['◆', '○', '▶', '【', '】', '「', '」', '·']);
const EMOJI_RE = /\p{Extended_Pictographic}/gu;

/** 是否为内容层 emoji（层级符号不算）。 */
function isContentEmoji(ch: string): boolean {
  if (HIERARCHY_SYMBOLS.has(ch)) return false;
  return new RegExp(EMOJI_RE.source, 'u').test(ch);
}

export interface EmojiPolicy {
  maxTypes: number;
  notConsecutive: boolean;
}

/**
 * 内容层 emoji 治理（C-3：头条最多 2 种且不连续）。
 * 超出的种类直接删除，连续 emoji 只保留第一个。与「P0 禁 emoji 功能图标」是两件事。
 */
export function applyEmojiPolicy(text: string, policy: EmojiPolicy, seen: Set<string>): string {
  if (!EMOJI_RE.test(text)) {
    EMOJI_RE.lastIndex = 0;
    return text;
  }
  EMOJI_RE.lastIndex = 0;
  let prevWasEmoji = false;
  let out = '';
  for (const ch of text) {
    if (!isContentEmoji(ch)) {
      out += ch;
      prevWasEmoji = false;
      continue;
    }
    if (policy.notConsecutive && prevWasEmoji) continue;
    if (!seen.has(ch) && seen.size >= policy.maxTypes) continue;
    seen.add(ch);
    out += ch;
    prevWasEmoji = true;
  }
  return out;
}
