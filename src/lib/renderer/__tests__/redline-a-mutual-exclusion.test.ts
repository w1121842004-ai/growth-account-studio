/**
 * 红线 A：双平台渲染器互斥约束（架构阻断问题 B-1）。
 *
 * 微信编辑器剥 class/id、只认 inline style、要求 <section> 包裹；
 * 头条编辑器（ProseMirror）剥 inline style、要求语义标签 + Unicode 层级符号。
 * 故「一份 HTML 两平台通用」不成立，系统用 Block AST 中间表示 + 双渲染器。
 *
 * 本文件仅断言「双渲染器互斥 + 一稿两投不走形」，AI 标识相关断言见 redline-b。
 */
import { describe, expect, it } from 'vitest';
import { renderBoth, renderPlatform, renderText } from '../index';
import { AI_DISCLOSURE_TEXT } from '../rules';
import { ARTICLE_AST, FULL_AST } from './fixtures';

/** 断言 HTML 中每个开始标签都带 inline style=（微信版硬约束 C-2）。 */
function assertEveryBlockTagHasStyle(html: string): void {
  const re = /<([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[2];
    if (!/\sstyle\s*=/.test(attrs)) {
      throw new Error(`发现无内联 style 的块级标签 <${m[1]}>：${m[0]}`);
    }
  }
}

/**
 * 剥标签 + 剥头条注入的层级符号壳（【】◆ ○ ▶ 「」与有序前缀 N.），再做空白归一。
 * 这样比对的是「用户正文文字」是否两平台一致——层级符号是平台 chrome，不是用户内容。
 */
function visibleText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/【|】/g, '')
    .replace(/◆\s*|○\s*/g, '')
    .replace(/▶\s*/g, '')
    .replace(/「|」/g, '')
    .replace(/\d+\.\s+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

describe('红线A-1：全 block 类型分别过双渲染器', () => {
  const wechat = renderPlatform('wechat', FULL_AST).html;
  const toutiao = renderPlatform('toutiao', FULL_AST).html;

  it('微信版：每个块级元素都带 inline style', () => {
    expect(() => assertEveryBlockTagHasStyle(wechat)).not.toThrow();
  });

  it('微信版：含 <section 包裹', () => {
    expect(wechat).toMatch(/<section/);
  });

  it('微信版：不含 class= / id= / <pre（微信剥 class 且禁 pre）', () => {
    expect(wechat).not.toMatch(/class\s*=/);
    expect(wechat).not.toMatch(/id\s*=/);
    expect(wechat).not.toMatch(/<pre[\s>]/);
  });

  it('头条版：完全不含 style= 属性', () => {
    expect(toutiao).not.toMatch(/\sstyle\s*=/);
  });

  it('头条版：不含 <section / <ul / <ol / <br', () => {
    expect(toutiao).not.toMatch(/<section/);
    expect(toutiao).not.toMatch(/<ul[\s>]/);
    expect(toutiao).not.toMatch(/<ol[\s>]/);
    expect(toutiao).not.toMatch(/<br\s*\/?>/);
  });

  it('头条版：标题带层级符号（一级【】/二级◆/三级○）', () => {
    expect(toutiao).toContain('【'); // 一级标题包裹
    expect(toutiao).toContain('◆'); // 二级标题前缀
    expect(toutiao).toContain('○'); // 三级标题前缀
  });

  it('头条版：列表项带 Unicode 前缀（无序 ▶ / 有序 N.）', () => {
    expect(toutiao).toContain('▶'); // 无序列表要点
    expect(toutiao).toContain('1. '); // 有序列表编号（渲染器自行编号）
  });

  it('头条版：引用带「」包裹、代码块保留 <pre>', () => {
    expect(toutiao).toContain('「');
    expect(toutiao).toContain('<pre>');
  });
});

describe('红线A-4：一稿两投不走形（同份 AST 两版正文文字一致）', () => {
  it('剥标签 + 剥层级符号壳后，微信版与头条版可见正文完全一致', () => {
    const { wechat, toutiao } = renderBoth(ARTICLE_AST);
    expect(visibleText(wechat)).toBe(visibleText(toutiao));
  });

  it('两版正文都包含文章标题与引用原句（内容未丢失）', () => {
    const { wechat, toutiao } = renderBoth(ARTICLE_AST);
    const wt = visibleText(wechat);
    const tt = visibleText(toutiao);
    for (const piece of ['普通人的复利成长法', '时间会奖励那些愿意慢慢变好的人。', '每天写三行复盘']) {
      expect(wt).toContain(piece);
      expect(tt).toContain(piece);
    }
  });
});

describe('红线A-5：renderText 纯文本版与 AST 一致', () => {
  const text = renderText(ARTICLE_AST);

  it('纯文本包含正文与 AI 标识', () => {
    expect(text).toContain('普通人的复利成长法');
    expect(text).toContain('时间会奖励那些愿意慢慢变好的人。');
    expect(text).toContain(AI_DISCLOSURE_TEXT);
  });

  it('纯文本以 AI 标识收尾（导出剪贴板尾部强制标识）', () => {
    expect(text.trim().endsWith(AI_DISCLOSURE_TEXT)).toBe(true);
  });
});
