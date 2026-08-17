/**
 * 草稿业务（F2/F4：Block AST 落库 + 真人留痕 C-7/AC-06）。
 * 归属校验一律「非本人 → 404」而不是 403：403 会泄露「该 id 存在」。
 */
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { getDb, drafts, editTrails } from '../../db';
import type { BlockAst, EditAction } from '../block-ast/types';
import { deriveTitle } from '../block-ast/text';
import { normalizeBlockAst } from '../block-ast/validate';
import { diffDrafts } from '../drafts/edit-distance';
import { notFound } from '../http/envelope';
import { paginate, type Page } from '../http/envelope';

export type DraftRow = typeof drafts.$inferSelect;
export type TrailRow = typeof editTrails.$inferSelect;

export interface EditTrailDto {
  id: string;
  draftId: string;
  distance: number;
  actions: EditAction[];
  createdAt: string;
}

export interface DraftDto {
  id: string;
  userId: string;
  topicId: string | null;
  title: string;
  blocks: BlockAst;
  status: DraftRow['status'];
  editDistance: number;
  createdAt: string;
  updatedAt: string;
  editTrails: EditTrailDto[];
}

function trailDto(row: TrailRow): EditTrailDto {
  return {
    id: row.id,
    draftId: row.draftId,
    distance: row.distance,
    actions: row.actions,
    createdAt: row.createdAt.toISOString(),
  };
}

function draftDto(row: DraftRow, trails: TrailRow[]): DraftDto {
  return {
    id: row.id,
    userId: row.userId,
    topicId: row.topicId,
    title: row.title,
    blocks: row.blocks,
    status: row.status,
    // 累计距离：多次小改可累积到阈值（AC-06）
    editDistance: trails.reduce((sum, t) => sum + t.distance, 0),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    editTrails: trails.map(trailDto),
  };
}

async function loadOwned(userId: string, id: string): Promise<DraftRow> {
  const rows = await getDb()
    .select()
    .from(drafts)
    .where(and(eq(drafts.id, id), eq(drafts.userId, userId)))
    .limit(1);
  if (!rows[0]) throw notFound('草稿不存在');
  return rows[0];
}

async function loadTrails(draftId: string): Promise<TrailRow[]> {
  return getDb()
    .select()
    .from(editTrails)
    .where(eq(editTrails.draftId, draftId))
    .orderBy(asc(editTrails.createdAt));
}

export async function createDraft(input: {
  userId: string;
  topicId?: string | null;
  blocks: unknown;
}): Promise<DraftDto> {
  const ast = normalizeBlockAst(input.blocks);
  const [row] = await getDb()
    .insert(drafts)
    .values({
      userId: input.userId,
      topicId: input.topicId ?? null,
      title: deriveTitle(ast),
      blocks: ast,
    })
    .returning();
  return draftDto(row, []);
}

export async function getDraft(userId: string, id: string): Promise<DraftDto> {
  const row = await loadOwned(userId, id);
  return draftDto(row, await loadTrails(id));
}

export interface DraftListQuery {
  userId: string;
  status?: DraftRow['status'];
  page: number;
  limit: number;
}

export interface DraftSummary {
  id: string;
  topicId: string | null;
  title: string;
  status: DraftRow['status'];
  editDistance: number;
  blockCount: number;
  createdAt: string;
  updatedAt: string;
}

/** 列表不返回全量 Block AST（JSONB 可能很大），只给摘要 + 累计编辑距离。 */
export async function listDrafts(q: DraftListQuery): Promise<Page<DraftSummary>> {
  const db = getDb();
  const where = q.status
    ? and(eq(drafts.userId, q.userId), eq(drafts.status, q.status))
    : eq(drafts.userId, q.userId);

  const [countRow] = await db.select({ n: sql<number>`count(*)::int` }).from(drafts).where(where);
  const rows = await db
    .select({
      id: drafts.id,
      topicId: drafts.topicId,
      title: drafts.title,
      status: drafts.status,
      blockCount: sql<number>`coalesce(jsonb_array_length(${drafts.blocks} -> 'blocks'), 0)::int`,
      distance: sql<number>`coalesce((
        select sum(${editTrails.distance})::int from ${editTrails}
        where ${editTrails.draftId} = ${drafts.id}
      ), 0)`,
      createdAt: drafts.createdAt,
      updatedAt: drafts.updatedAt,
    })
    .from(drafts)
    .where(where)
    .orderBy(desc(drafts.updatedAt))
    .limit(q.limit)
    .offset((q.page - 1) * q.limit);

  const items: DraftSummary[] = rows.map((r) => ({
    id: r.id,
    topicId: r.topicId,
    title: r.title,
    status: r.status,
    editDistance: r.distance ?? 0,
    blockCount: r.blockCount ?? 0,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
  return paginate(items, countRow?.n ?? 0, q.page, q.limit);
}

/**
 * 保存人工编辑：计算与上一版的距离并写 edit_trails（C-7）。
 * 距离为 0 时也写一条（actions 可能是 move/style），保留完整留痕链；
 * 完全无差异（distance=0 且无 actions）则不落痕，避免空点击刷阈值。
 */
export async function updateDraft(input: {
  userId: string;
  id: string;
  blocks: unknown;
}): Promise<DraftDto> {
  const row = await loadOwned(input.userId, input.id);
  const next = normalizeBlockAst(input.blocks);
  const diff = diffDrafts(row.blocks, next);
  const db = getDb();

  const [saved] = await db
    .update(drafts)
    .set({ blocks: next, title: deriveTitle(next), updatedAt: new Date() })
    .where(eq(drafts.id, input.id))
    .returning();

  if (diff.distance > 0 || diff.actions.length > 0) {
    await db
      .insert(editTrails)
      .values({ draftId: input.id, distance: diff.distance, actions: diff.actions });
  }
  return draftDto(saved, await loadTrails(input.id));
}

export async function deleteDraft(userId: string, id: string): Promise<{ id: string }> {
  await loadOwned(userId, id);
  await getDb().delete(drafts).where(eq(drafts.id, id));
  return { id };
}

/** 标记为已导出（导出门禁在 render-service 里判定，这里只落状态）。 */
export async function markExported(userId: string, id: string): Promise<DraftRow> {
  await loadOwned(userId, id);
  const [row] = await getDb()
    .update(drafts)
    .set({ status: 'exported', updatedAt: new Date() })
    .where(eq(drafts.id, id))
    .returning();
  return row;
}

export async function totalEditDistance(draftId: string): Promise<number> {
  const [row] = await getDb()
    .select({ n: sql<number>`coalesce(sum(${editTrails.distance}), 0)::int` })
    .from(editTrails)
    .where(eq(editTrails.draftId, draftId));
  return row?.n ?? 0;
}

export { loadOwned as loadOwnedDraft };
