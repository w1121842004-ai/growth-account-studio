/**
 * 真人留痕度量（C-7 / AC-06 / AC-07）。
 *
 * 为什么用「紧凑文本 + Levenshtein」而不是 AST 结构 diff：
 * 门禁要卡的是「有没有真人动过文字」，不是「结构变没变」。只调段落顺序或换个标题层级
 * 就能过门禁的话，AC-06 形同虚设。所以比较对象是可见文字序列。
 *
 * 阈值：EDIT_DISTANCE_MIN（默认 50）。距离 < 阈值 → 导出返回 409。
 */
import type { BlockAst, EditAction } from '../block-ast/types';
import { blockAstToCompactText } from '../block-ast/text';

export const EDIT_DISTANCE_MIN = Number(process.env.EDIT_DISTANCE_MIN ?? 50);

/** 超长文本截断上限：O(n·m) 计算量封顶，避免超长草稿把请求拖死（失效模式 #5）。 */
const MAX_COMPARE_CHARS = 8_000;

/**
 * Levenshtein 距离（滚动数组，空间 O(min(n,m))）。
 * 字符按 code point 切分，避免中文/emoji 被拆成半个字符导致距离虚高。
 */
export function levenshtein(a: string, b: string): number {
  const s = [...a].slice(0, MAX_COMPARE_CHARS);
  const t = [...b].slice(0, MAX_COMPARE_CHARS);
  if (s.length === 0) return t.length;
  if (t.length === 0) return s.length;

  const short = s.length <= t.length ? s : t;
  const long = s.length <= t.length ? t : s;
  let prev = new Array<number>(short.length + 1);
  let curr = new Array<number>(short.length + 1);
  for (let j = 0; j <= short.length; j += 1) prev[j] = j;

  for (let i = 1; i <= long.length; i += 1) {
    curr[0] = i;
    const li = long[i - 1];
    for (let j = 1; j <= short.length; j += 1) {
      const cost = li === short[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    const swap = prev;
    prev = curr;
    curr = swap;
  }
  return prev[short.length];
}

export interface EditDiff {
  distance: number;
  actions: EditAction[];
  beforeChars: number;
  afterChars: number;
}

/**
 * 动作摘要（写入 edit_trails.actions）。
 * 判定逻辑刻意保守：长度变化决定 insert/delete，长度相近但内容变了记 replace；
 * 文字未变而块序列变了记 move；文字与块序列都未变但 AST 有差异记 style。
 */
export function summarizeActions(before: BlockAst, after: BlockAst, distance: number): EditAction[] {
  const beforeText = blockAstToCompactText(before);
  const afterText = blockAstToCompactText(after);
  const actions: EditAction[] = [];
  const delta = [...afterText].length - [...beforeText].length;

  if (distance > 0) {
    if (delta > 0) actions.push('insert');
    if (delta < 0) actions.push('delete');
    // 长度变化远小于距离 → 大量原地改写
    if (Math.abs(delta) < distance) actions.push('replace');
  } else {
    const beforeSeq = before.blocks.map((b) => b.type).join(',');
    const afterSeq = after.blocks.map((b) => b.type).join(',');
    if (beforeSeq !== afterSeq) actions.push('move');
    else if (JSON.stringify(before) !== JSON.stringify(after)) actions.push('style');
  }
  return actions;
}

/** 计算一次保存的编辑差异（相对上一版）。 */
export function diffDrafts(before: BlockAst, after: BlockAst): EditDiff {
  const beforeText = blockAstToCompactText(before);
  const afterText = blockAstToCompactText(after);
  const distance = levenshtein(beforeText, afterText);
  return {
    distance,
    actions: summarizeActions(before, after, distance),
    beforeChars: [...beforeText].length,
    afterChars: [...afterText].length,
  };
}

/**
 * 导出门禁判定（AC-06）。
 * 累计距离取 edit_trails 之和 —— 分多次小改也能累积到阈值，符合真人编辑习惯。
 */
export function exportGate(totalDistance: number, threshold = EDIT_DISTANCE_MIN): {
  allowed: boolean;
  message: string;
} {
  if (totalDistance >= threshold) return { allowed: true, message: '' };
  return {
    allowed: false,
    message: `请先对草稿做实质编辑（编辑距离低于阈值）后再导出：当前累计 ${totalDistance}，需达到 ${threshold}`,
  };
}
