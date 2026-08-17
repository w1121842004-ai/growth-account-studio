/**
 * Block AST 归一化 + 流式解析 + 选题打分数学（ADR-002 / ADR-006 / AC-01 / AC-09）。
 * 这一层出错最容易「静默算错」（失效模式 #2），所以断言写到具体数值。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { parseBlocks, parseInline, parseJsonLines, StreamingBlockParser } from '../src/lib/ai/parse';
import {
  DEFAULT_WEIGHTS,
  competitionFromSignals,
  computeScore,
  dictionaryRelevance,
  normalizeHeat,
} from '../src/lib/ai/scoring';
import { AstError, normalizeBlockAst, tryNormalizeBlock } from '../src/lib/block-ast/validate';
import { blockAstToCompactText, deriveTitle } from '../src/lib/block-ast/text';
import { computeSignals } from '../src/lib/services/topic-signals';

test('AST 归一化：拒绝空 blocks / 未知 type / 非法结构（不静默丢内容）', () => {
  assert.throws(() => normalizeBlockAst({ version: '1.0', blocks: [] }), AstError);
  assert.throws(() => normalizeBlockAst({ version: '1.0' }), AstError);
  assert.throws(
    () => normalizeBlockAst({ version: '1.0', blocks: [{ type: 'table', rows: [] }] }),
    AstError,
    '未知 type 必须报错而不是丢块',
  );
  assert.throws(() => normalizeBlockAst({ version: '1.0', blocks: [{ type: 'image', alt: '缺 src' }] }), AstError);
});

test('AST 归一化：容忍编辑器等价形状（text / string[] / marks 对象 / language）', () => {
  const ast = normalizeBlockAst({
    blocks: [
      { type: 'heading', level: 9, text: '标题层级越界要收敛到 3' },
      { type: 'paragraph', text: '用 text 字段而非 children' },
      { type: 'list', items: ['字符串条目一', '字符串条目二'] },
      { type: 'code', language: 'ts', text: 'const a = 1;' },
      { type: 'paragraph', children: [{ text: '加粗', marks: { bold: true, nope: true } }] },
      { type: 'paragraph', children: [{ text: '缺 href 的链接', marks: ['link'] }] },
    ],
  });
  assert.equal(ast.version, '1.0');
  const [h, p, list, code, bold, link] = ast.blocks;
  assert.equal(h.type === 'heading' && h.level, 3, 'level 越界收敛到 3');
  assert.equal(p.type === 'paragraph' && p.children[0].text, '用 text 字段而非 children');
  assert.equal(list.type === 'list' && list.items.length, 2);
  assert.equal(code.type === 'code' && code.lang, 'ts', 'language 应映射为 lang');
  assert.deepEqual(bold.type === 'paragraph' ? bold.children[0].marks : null, ['bold'], '非法 mark 要过滤');
  assert.equal(
    link.type === 'paragraph' ? link.children[0].marks : 'x',
    undefined,
    'link 缺 href 应降级为纯文本，避免渲染空 a 标签',
  );
});

test('AST 归一化：块数量上限拦截（防超大 payload 打死渲染）', () => {
  const many = Array.from({ length: 601 }, () => ({ type: 'paragraph', text: 'x' }));
  assert.throws(() => normalizeBlockAst({ blocks: many }), AstError);
  assert.doesNotThrow(() => normalizeBlockAst({ blocks: many.slice(0, 600) }));
});

test('tryNormalizeBlock：单块宽松解析，失败返回 null 不抛（SSE 用）', () => {
  assert.equal(tryNormalizeBlock({ type: 'divider' })?.type, 'divider');
  assert.equal(tryNormalizeBlock({ type: 'unknown' }), null);
  assert.equal(tryNormalizeBlock('not an object'), null);
});

test('流式解析：逐行 JSON 主路径按块吐出', () => {
  const parser = new StreamingBlockParser();
  const out = [
    ...parser.push('{"type":"heading","level":2,"children":[{"text":"小标题"}]}\n'),
    ...parser.push('{"type":"paragraph","children":[{"text":"正文"}]}\n'),
    ...parser.end(),
  ];
  assert.deepEqual(out.map((b) => b.type), ['heading', 'paragraph']);
});

test('流式解析：chunk 在行中间切断也能拼回完整块', () => {
  const parser = new StreamingBlockParser();
  const line = '{"type":"paragraph","children":[{"text":"被切断的一行"}]}\n';
  const mid = Math.floor(line.length / 2);
  const first = parser.push(line.slice(0, mid));
  assert.equal(first.length, 0, '半行不得提前吐块');
  const second = [...parser.push(line.slice(mid)), ...parser.end()];
  assert.equal(second.length, 1);
  assert.equal(second[0].type, 'paragraph');
});

test('流式解析：模型退化成 Markdown 时兜底转换，不报废整次生成', () => {
  const blocks = parseBlocks(
    ['# 一级标题', '正文一段。', '> 引用一句', '- 要点一', '- 要点二', '1. 步骤一', '2. 步骤二', '---'].join('\n'),
  );
  assert.deepEqual(blocks.map((b) => b.type), [
    'heading',
    'paragraph',
    'quote',
    'list',
    'orderedList',
    'divider',
  ]);
  const list = blocks[3];
  assert.equal(list.type === 'list' && list.items.length, 2, '连续列表项应合并为一个 list 块');
});

test('流式解析：```json 围栏被吸收，不当成代码块正文', () => {
  const blocks = parseBlocks(
    '```json\n{"type":"paragraph","children":[{"text":"围栏内的正文"}]}\n```\n',
  );
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'code', '围栏内内容进 code 块，不会被当 JSON 指令执行');
});

test('行内 Markdown 解析：bold / italic / code 三种 mark', () => {
  const nodes = parseInline('普通**加粗**再*斜体*再`代码`');
  assert.deepEqual(
    nodes.map((n) => [n.text, n.marks?.[0] ?? null]),
    [
      ['普通', null],
      ['加粗', 'bold'],
      ['再', null],
      ['斜体', 'italic'],
      ['再', null],
      ['代码', 'code'],
    ],
  );
});

test('parseJsonLines：跳过截断行与非 JSON 噪声', () => {
  const rows = parseJsonLines(
    ['以下是结果：', '{"id":"a","relevance":0.8,"competition":0.2}', '{"id":"b","relevance":0.5},', '{"id":"c"'].join(
      '\n',
    ),
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0].id, 'a');
  assert.equal(rows[1].id, 'b');
});

test('打分公式：0.45·heat + 0.40·relevance − 0.15·competition（ADR-006）', () => {
  assert.deepEqual(DEFAULT_WEIGHTS, { heat: 0.45, relevance: 0.4, competition: 0.15 });
  assert.equal(computeScore(1, 1, 0), 0.85);
  assert.equal(computeScore(0, 0, 1), 0, '负值必须夹到 0，不得出现负分');
  assert.equal(computeScore(1, 1, 1), 0.7);
  assert.equal(computeScore(0.5, 0.5, 0.5), 0.35);
  // 竞争度上升必然拉低分数（单调性）
  assert.ok(computeScore(0.8, 0.8, 0.2) > computeScore(0.8, 0.8, 0.9));
});

test('热度归一：对数压缩且单调，0 与负数归 0', () => {
  assert.equal(normalizeHeat(0), 0);
  assert.equal(normalizeHeat(-100), 0);
  assert.ok(normalizeHeat(1_000) < normalizeHeat(1_000_000));
  assert.ok(normalizeHeat(10 ** 8) <= 1, '不得超过 1');
  assert.ok(normalizeHeat(10 ** 7) >= 0.99);
});

test('竞争度：跨平台共现越多越高，历史重复度加权 0.4', () => {
  assert.equal(competitionFromSignals(1, 0), 0, '仅 1 个平台且无历史重复 → 无竞争');
  assert.equal(competitionFromSignals(4, 0), 0.6);
  assert.equal(competitionFromSignals(1, 1), 0.4);
  assert.equal(competitionFromSignals(4, 1), 1);
  assert.ok(competitionFromSignals(2, 0) < competitionFromSignals(3, 0));
});

test('词典降级打分：赛道词加分、娱乐噪声扣分（无模型时仍可用）', () => {
  const growth = dictionaryRelevance('每天复盘的自律习惯怎么建立');
  const noise = dictionaryRelevance('某明星球队比赛八卦');
  const neutral = dictionaryRelevance('今天天气很好');
  assert.ok(growth >= 0.9, `赛道强相关应高分，实际 ${growth}`);
  assert.ok(noise < neutral, `娱乐噪声必须低于中性标题：${noise} vs ${neutral}`);
  assert.ok(noise >= 0 && growth <= 1, '相关度必须落在 0-1');
});

test('竞争度信号：跨平台共现与历史重复只看标题，不抓正文（R-3）', () => {
  const batch = [
    { id: '1', title: '如何用复盘提升自律', platform: 'toutiao' },
    { id: '2', title: '如何用复盘提升自律', platform: 'baidu' },
    { id: '3', title: '一个完全无关的科技新品发布', platform: 'toutiao' },
  ];
  const signals = computeSignals(batch, ['如何用复盘提升自律能力']);
  const first = signals.get('1');
  assert.ok(first, '应返回每个条目的信号');
  assert.ok(first!.cooccurrence >= 2, '跨平台同题应统计为共现 >= 2');
  assert.ok(first!.historyOverlap > 0.5, '与历史采纳高度相似应给出重复度');
  assert.equal(first!.duplicateWarning, true);
  assert.equal(signals.get('3')!.cooccurrence, 1, '孤立选题共现为 1');
  assert.equal(signals.get('3')!.duplicateWarning, false);
});

test('纯文本投影：紧凑文本忽略装饰，标题派生取首个 heading', () => {
  const ast = normalizeBlockAst({
    blocks: [
      { type: 'divider' },
      { type: 'heading', level: 1, text: '复盘方法论' },
      { type: 'paragraph', text: '正文' },
    ],
  });
  assert.equal(blockAstToCompactText(ast), '复盘方法论\n正文', 'divider 不参与编辑距离比较');
  assert.equal(deriveTitle(ast), '复盘方法论');
  const noHeading = normalizeBlockAst({ blocks: [{ type: 'paragraph', text: '只有段落时用段落前 40 字' }] });
  assert.equal(deriveTitle(noHeading), '只有段落时用段落前 40 字');
});
