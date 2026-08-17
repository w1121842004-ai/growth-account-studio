/**
 * 双渲染器合规与快照测试（C-1/C-2/C-3/C-5，AC-04/AC-05）。
 * 快照文件在 tests/snapshots/；首次运行自动写入，之后不一致即失败。
 * 用 UPDATE_SNAPSHOTS=1 显式更新（改渲染规则时必须人工看 diff）。
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { AI_DISCLOSURE_TEXT, renderPlatform, renderText } from '../src/lib/renderer';
import { publishChecklist } from '../src/lib/renderer/checklist';
import { normalizeBlockAst } from '../src/lib/block-ast/validate';
import { SAMPLE_AST } from './fixtures/sample-ast';

const HERE = dirname(fileURLToPath(import.meta.url));
const SNAP_DIR = join(HERE, 'snapshots');

function matchSnapshot(name: string, actual: string): void {
  mkdirSync(SNAP_DIR, { recursive: true });
  const file = join(SNAP_DIR, `${name}.html`);
  if (!existsSync(file) || process.env.UPDATE_SNAPSHOTS === '1') {
    writeFileSync(file, actual, 'utf8');
    return;
  }
  assert.equal(actual, readFileSync(file, 'utf8'), `快照不一致：${name}（确认改动后用 UPDATE_SNAPSHOTS=1 更新）`);
}

test('微信渲染器：全内联样式 + section 包裹 + 标题降级为 p（C-1）', () => {
  const html = renderPlatform('wechat', SAMPLE_AST).html;
  matchSnapshot('wechat', html);
  assert.match(html, /<section/, '必须有 section 外层');
  assert.match(html, /style="/, '必须携带内联样式');
  assert.doesNotMatch(html, /<h[1-6][\s>]/, '标题必须降级为 p，公众号会吃掉 h 标签样式');
  assert.doesNotMatch(html, /<pre[\s>]/, '公众号编辑器不保留 pre，代码须逐行 p>code');
  assert.doesNotMatch(html, /class="/, '不得输出 class，公众号会剥离外部样式表');
});

test('头条渲染器：零内联样式 + 语义标签 + Unicode 层级（C-2）', () => {
  const html = renderPlatform('toutiao', SAMPLE_AST).html;
  matchSnapshot('toutiao', html);
  assert.doesNotMatch(html, /style="/, '头条编辑器会清洗内联样式，一律不输出');
  assert.doesNotMatch(html, /<section/, '头条不使用 section');
  assert.doesNotMatch(html, /<(ul|ol)[\s>]/, '列表项必须拆成独立 p');
  assert.doesNotMatch(html, /<br\s*\/?>/, '头条禁用 br，靠段落分隔');
  assert.match(html, /【.*】/, '一级标题用【】包裹');
  assert.match(html, /◆/, '二级标题用 ◆ 前缀');
  assert.match(html, /▶/, '无序列表项用 ▶ 前缀');
  assert.match(html, /「.*」/, '引用用「」包裹');
  assert.match(html, /<pre>/, '头条保留 pre 代码块');
});

test('AI 标识强制注入且不可关闭（C-5/R-4/ADR-009）', () => {
  for (const platform of ['wechat', 'toutiao'] as const) {
    const out = renderPlatform(platform, SAMPLE_AST);
    assert.equal(out.disclosureInjected, true);
    assert.ok(out.html.includes(AI_DISCLOSURE_TEXT), `${platform} 缺少 AI 标识`);
  }
  assert.ok(renderText(SAMPLE_AST).includes(AI_DISCLOSURE_TEXT), '纯文本导出也要带标识');
});

test('空 AST 不允许渲染（避免产出只有 AI 标识的空文）', () => {
  assert.throws(() => normalizeBlockAst({ version: '1.0', blocks: [] }));
});

test('头条 emoji 策略：最多 2 类且不连续（C-2/ADR-010）', () => {
  const ast = normalizeBlockAst({
    version: '1.0',
    blocks: [
      {
        type: 'paragraph',
        children: [{ text: '开心开心😀😀😀 又来😀 再来🎉 还有🔥 最后💡' }],
      },
    ],
  });
  const html = renderPlatform('toutiao', ast).html;
  const emojis = html.match(/\p{Extended_Pictographic}/gu) ?? [];
  assert.ok(new Set(emojis).size <= 2, `emoji 种类超限：${JSON.stringify(emojis)}`);
  assert.doesNotMatch(html, /(\p{Extended_Pictographic})\1/u, 'emoji 不得连续重复');
});

test('几何符号不算 emoji（◆ ○ ▶ 是层级符号，不受 emoji 上限约束）', () => {
  const html = renderPlatform('toutiao', SAMPLE_AST).html;
  const count = (html.match(/[◆○▶]/g) ?? []).length;
  assert.ok(count >= 3, `层级符号被误当 emoji 削减了：只剩 ${count} 个`);
});

test('层级符号不占 emoji 配额（▶ 属 Extended_Pictographic 的坑）', () => {
  // ▶ 在 Unicode 里是 Extended_Pictographic，但它是列表要点符号，不得挤掉真表情
  assert.equal(/\p{Extended_Pictographic}/u.test('▶'), true, '前提：▶ 确实被 Unicode 归为 ExtPict');
  const ast = normalizeBlockAst({
    version: '1.0',
    blocks: [
      { type: 'paragraph', children: [{ text: '正文里也出现了 ▶ 这个符号，加上 😀 和 🎉 两种表情' }] },
      { type: 'list', items: ['列表项一', '列表项二'] },
    ],
  });
  const html = renderPlatform('toutiao', ast).html;
  assert.ok(html.includes('😀'), '真表情不得被层级符号挤掉配额');
  assert.ok(html.includes('🎉'), '第二种真表情也应保留');
  const bullets = (html.match(/▶/g) ?? []).length;
  assert.equal(bullets, 3, `正文 1 个 + 列表 2 个 = 3 个 ▶，实际 ${bullets}`);
});

test('发布前 checklist 覆盖双平台 AI 声明要求（C-6）', () => {
  const toutiao = publishChecklist('toutiao');
  const wechat = publishChecklist('wechat');
  assert.ok(toutiao.length > 0 && wechat.length > 0);
  assert.ok(toutiao.some((s) => s.includes('AI')), '头条 checklist 必须提示勾选 AI 生成');
  assert.ok(wechat.some((s) => s.includes('AI')), '公众号 checklist 必须提示保留 AI 标识');
});
