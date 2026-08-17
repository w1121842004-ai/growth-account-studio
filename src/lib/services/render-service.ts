/**
 * 渲染与导出业务（F3/F4：AC-04 / AC-05 / AC-06 / AC-07 / C-5 / C-6）。
 *
 * 两条不可绕过的红线：
 * 1. AI 标识由渲染器强制注入，renderPlatform 内含 assertCompliance —— 缺标识直接抛错，
 *    宁可 500 也不允许把无标识 HTML 交出去（R-4）。
 * 2. 未实质编辑禁止导出（AC-06）：累计编辑距离 < 阈值 → 409，且不改 status。
 * 3. 无自动发布：导出只产出 HTML/文本 + checklist，由用户手动粘贴（ADR-003/Spec §3）。
 */
import { normalizeBlockAst } from '../block-ast/validate';
import { blockAstToText } from '../block-ast/text';
import { EDIT_DISTANCE_MIN, exportGate } from '../drafts/edit-distance';
import { conflict } from '../http/envelope';
import { publishChecklist } from '../renderer/checklist';
import { AI_DISCLOSURE_TEXT, renderPlatform, type RenderPlatform } from '../renderer';
import { loadOwnedDraft, markExported, totalEditDistance } from './draft-service';

export interface RenderResultDto {
  platform: RenderPlatform;
  html: string;
  disclosureInjected: boolean;
}

export async function renderDraft(
  userId: string,
  id: string,
  platform: RenderPlatform,
): Promise<RenderResultDto> {
  const row = await loadOwnedDraft(userId, id);
  const out = renderPlatform(platform, normalizeBlockAst(row.blocks));
  return { platform, html: out.html, disclosureInjected: out.disclosureInjected };
}

/** 预览两个平台（前端对照面板一次拿全，省一次往返）。 */
export async function renderDraftBoth(userId: string, id: string) {
  const row = await loadOwnedDraft(userId, id);
  const ast = normalizeBlockAst(row.blocks);
  return {
    wechat: renderPlatform('wechat', ast).html,
    toutiao: renderPlatform('toutiao', ast).html,
    disclosureInjected: true,
  };
}

export interface ExportResultDto {
  platform: RenderPlatform;
  html: string;
  text: string;
  checklist: string[];
  editDistance: number;
  threshold: number;
}

/**
 * 导出。门禁顺序刻意如此：先判编辑距离（409 早退），再渲染，最后才改状态。
 * 反过来写会出现「已标记 exported 但渲染失败」的脏状态。
 */
export async function exportDraft(
  userId: string,
  id: string,
  platform: RenderPlatform,
): Promise<ExportResultDto> {
  const row = await loadOwnedDraft(userId, id);
  const distance = await totalEditDistance(id);
  const gate = exportGate(distance);
  if (!gate.allowed) throw conflict(gate.message);

  const ast = normalizeBlockAst(row.blocks);
  const out = renderPlatform(platform, ast);
  const text = `${blockAstToText(ast)}\n\n${AI_DISCLOSURE_TEXT}`;
  await markExported(userId, id);
  return {
    platform,
    html: out.html,
    text,
    checklist: publishChecklist(platform),
    editDistance: distance,
    threshold: EDIT_DISTANCE_MIN,
  };
}

/** 导出前自检（前端可提前灰掉按钮，避免用户点了才吃 409）。 */
export async function exportReadiness(userId: string, id: string) {
  await loadOwnedDraft(userId, id);
  const distance = await totalEditDistance(id);
  const gate = exportGate(distance);
  return {
    allowed: gate.allowed,
    editDistance: distance,
    threshold: EDIT_DISTANCE_MIN,
    message: gate.message,
  };
}
