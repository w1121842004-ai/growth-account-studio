/**
 * 真人留痕门禁单测（C-7 / AC-06 / AC-07）。
 * 关键点：只调顺序/样式不能过门禁；小改累加可以过；导出前必须卡住未编辑草稿。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { BlockAst } from '../src/lib/block-ast/types';
import {
  EDIT_DISTANCE_MIN,
  diffDrafts,
  exportGate,
  levenshtein,
  summarizeActions,
} from '../src/lib/drafts/edit-distance';
import { SAMPLE_AST, TINY_AST } from './fixtures/sample-ast';

function para(text: string): BlockAst {
  return { version: '1.0', blocks: [{ type: 'paragraph', children: [{ text }] }] };
}

test('Levenshtein：基本性质与中文按字计算', () => {
  assert.equal(levenshtein('', ''), 0);
  assert.equal(levenshtein('abc', 'abc'), 0);
  assert.equal(levenshtein('', '你好'), 2);
  assert.equal(levenshtein('kitten', 'sitting'), 3);
  // 中文按 code point 切分：改 2 个字 = 距离 2，不因 UTF-16 被放大
  assert.equal(levenshtein('今天天气不错', '今天天气很好'), 2);
  // emoji 是单个 code point，不拆成半个字符
  assert.equal(levenshtein('好开心😀', '好开心🎉'), 1);
  // 对称性
  assert.equal(levenshtein('复盘方法论', '方法论复盘'), levenshtein('方法论复盘', '复盘方法论'));
});

test('门禁：未编辑（距离 0）一律拒绝导出，并给出具体数字', () => {
  const gate = exportGate(0);
  assert.equal(gate.allowed, false);
  assert.match(gate.message, /实质编辑/);
  assert.match(gate.message, new RegExp(`${EDIT_DISTANCE_MIN}`), '提示须包含阈值，便于用户判断还差多少');
});

test('门禁：距离恰好达阈值即放行，差 1 则拦下（边界）', () => {
  assert.equal(exportGate(EDIT_DISTANCE_MIN).allowed, true);
  assert.equal(exportGate(EDIT_DISTANCE_MIN - 1).allowed, false);
  assert.equal(exportGate(EDIT_DISTANCE_MIN + 1).allowed, true);
  // 显式阈值覆盖（配置化）
  assert.equal(exportGate(10, 10).allowed, true);
  assert.equal(exportGate(9, 10).allowed, false);
});

test('门禁：多次小改累加可达阈值（符合真人分次编辑习惯）', () => {
  const steps = [18, 15, 20];
  const total = steps.reduce((a, b) => a + b, 0);
  assert.ok(steps.every((s) => !exportGate(s).allowed), '单次小改不应过门禁');
  assert.equal(exportGate(total).allowed, true, `累计 ${total} 应过门禁`);
});

test('只调块顺序不改文字：距离为 0，记 move，不得过门禁（AC-06 防绕过）', () => {
  const before: BlockAst = {
    version: '1.0',
    blocks: [
      { type: 'heading', level: 2, children: [{ text: '小标题' }] },
      { type: 'paragraph', children: [{ text: '正文一段话。' }] },
    ],
  };
  const after: BlockAst = {
    version: '1.0',
    blocks: [
      { type: 'paragraph', children: [{ text: '小标题' }] },
      { type: 'heading', level: 2, children: [{ text: '正文一段话。' }] },
    ],
  };
  const diff = diffDrafts(before, after);
  assert.equal(diff.distance, 0, '文字未变，距离必须为 0');
  assert.deepEqual(diff.actions, ['move']);
  assert.equal(exportGate(diff.distance).allowed, false);
});

test('只改样式（加粗）不改文字：距离 0，记 style，不得过门禁', () => {
  const before: BlockAst = {
    version: '1.0',
    blocks: [{ type: 'paragraph', children: [{ text: '同一句话' }] }],
  };
  const after: BlockAst = {
    version: '1.0',
    blocks: [{ type: 'paragraph', children: [{ text: '同一句话', marks: ['bold'] }] }],
  };
  const diff = diffDrafts(before, after);
  assert.equal(diff.distance, 0);
  assert.deepEqual(diff.actions, ['style']);
  assert.equal(exportGate(diff.distance).allowed, false);
});

test('动作摘要：增删改分别落 insert / delete / replace', () => {
  const short = para('原始的一段话。');
  const longer = para('原始的一段话。后面又补了一整段新的内容，用来说明观点。');
  const shorter = para('原始的。');
  const rewritten = para('完全换掉的七个字。');

  assert.ok(summarizeActions(short, longer, diffDrafts(short, longer).distance).includes('insert'));
  assert.ok(summarizeActions(short, shorter, diffDrafts(short, shorter).distance).includes('delete'));
  const rw = summarizeActions(short, rewritten, diffDrafts(short, rewritten).distance);
  assert.ok(rw.includes('replace'), `原地改写应记 replace，实际 ${JSON.stringify(rw)}`);
  assert.deepEqual(summarizeActions(short, short, 0), [], '完全相同则无动作');
});

test('字符统计：before/after 字数以 code point 计', () => {
  const diff = diffDrafts(TINY_AST, para('改成一句更短的话。'));
  assert.equal(diff.beforeChars, 17);
  assert.equal(diff.afterChars, 9);
  assert.ok(diff.distance > 0);
});

test('长草稿：截断上限生效，不因超长文本拖死请求（失效模式 #5）', () => {
  const huge = 'あ'.repeat(20_000);
  const started = Date.now();
  const d = levenshtein(huge, `${huge}x`);
  assert.ok(Date.now() - started < 3_000, '超长比较必须在截断上限内完成');
  assert.ok(d >= 0);
});

test('全量样本改一个字：距离为 1，仍不足以过门禁', () => {
  const mutated: BlockAst = JSON.parse(JSON.stringify(SAMPLE_AST));
  const first = mutated.blocks[0];
  assert.equal(first.type, 'heading');
  if (first.type === 'heading') first.children[0].text = '每天进步一点点的复盘方式';
  const diff = diffDrafts(SAMPLE_AST, mutated);
  assert.equal(diff.distance, 1);
  assert.equal(exportGate(diff.distance).allowed, false, '改一个字不算实质编辑');
});
