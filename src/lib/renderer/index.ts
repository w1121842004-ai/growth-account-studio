/**
 * 双渲染器统一入口（ADR-002）。
 * 对外只暴露 renderPlatform / renderBoth，调用方不直接 import wechat.ts / toutiao.ts。
 * 出口自带合规自检（assertCompliance）：AI 标识必在、头条零 inline style、微信有 section。
 */
import type { BlockAst } from '../block-ast/types';
import { blockAstToText } from '../block-ast/text';
import { AI_DISCLOSURE_TEXT } from './rules';
import { renderToutiao } from './toutiao';
import { renderWechat } from './wechat';

export type RenderPlatform = 'wechat' | 'toutiao';
export const RENDER_PLATFORMS: readonly RenderPlatform[] = ['wechat', 'toutiao'];

export interface RenderOutput {
  platform: RenderPlatform;
  html: string;
  /** 恒为 true（C-5 不可关闭）；为 false 说明渲染器被改坏，直接抛错阻断导出 */
  disclosureInjected: boolean;
}

export class RenderComplianceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RenderComplianceError';
  }
}

/**
 * 渲染后合规自检（R-4/AC-05/AC-10）。
 * 任一条不满足即抛错——宁可 500 也不产出违规 HTML。
 */
export function assertCompliance(platform: RenderPlatform, html: string): void {
  if (!html.includes(AI_DISCLOSURE_TEXT)) {
    throw new RenderComplianceError(`${platform} 渲染结果缺少 AI 标识「${AI_DISCLOSURE_TEXT}」`);
  }
  if (platform === 'toutiao') {
    if (/\sstyle\s*=/.test(html)) throw new RenderComplianceError('头条版不得包含 inline style（AC-10）');
    if (/<\/?(section|ul|ol|br)\b/i.test(html)) {
      throw new RenderComplianceError('头条版不得包含 section/ul/ol/br 标签（C-3）');
    }
  }
  if (platform === 'wechat') {
    if (!html.includes('<section')) throw new RenderComplianceError('微信版必须以 section 包裹（C-2）');
    if (/<pre\b/i.test(html)) throw new RenderComplianceError('微信版禁用 pre 标签（C-2）');
    if (!/\sstyle\s*=/.test(html)) throw new RenderComplianceError('微信版必须全内联 style（C-2）');
  }
}

/** 渲染单平台（含合规自检）。 */
export function renderPlatform(platform: RenderPlatform, ast: BlockAst): RenderOutput {
  const html = platform === 'wechat' ? renderWechat(ast) : renderToutiao(ast);
  assertCompliance(platform, html);
  return { platform, html, disclosureInjected: true };
}

/** 一次渲染两版（预览页并排对照，AC-04）。 */
export function renderBoth(ast: BlockAst): { wechat: string; toutiao: string } {
  return {
    wechat: renderPlatform('wechat', ast).html,
    toutiao: renderPlatform('toutiao', ast).html,
  };
}

/** 纯文本版（导出到剪贴板的 text/plain，尾部同样带 AI 标识）。 */
export function renderText(ast: BlockAst): string {
  return `${blockAstToText(ast)}\n\n${AI_DISCLOSURE_TEXT}`;
}

export { AI_DISCLOSURE_TEXT };
export { renderWechat, renderToutiao };
