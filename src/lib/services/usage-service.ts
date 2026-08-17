/**
 * 用量统计（Spec §5 /usage）。
 * cost 落库单位是人民币「分」，直接对应 openapi costCents，不做二次换算。
 */
import { and, eq, gte, lte, sql, type SQL } from 'drizzle-orm';
import { getDb, drafts, usages } from '../../db';

export interface UsageByModel {
  model: string;
  tokensIn: number;
  tokensOut: number;
  costCents: number;
}

export interface UsageStatDto {
  tokensIn: number;
  tokensOut: number;
  costCents: number;
  exportCount: number;
  byModel: UsageByModel[];
  byKind: { kind: string; calls: number; costCents: number }[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** from/to 为日期（含端点）；缺省则统计全部。 */
export async function getUsage(
  userId: string,
  range: { from?: string; to?: string } = {},
): Promise<UsageStatDto> {
  const db = getDb();
  const filters: SQL[] = [eq(usages.userId, userId)];
  if (range.from) filters.push(gte(usages.createdAt, new Date(`${range.from}T00:00:00.000Z`)));
  if (range.to) filters.push(lte(usages.createdAt, new Date(`${range.to}T23:59:59.999Z`)));
  const where = and(...filters);

  const byModelRows = await db
    .select({
      model: usages.model,
      tokensIn: sql<number>`coalesce(sum(${usages.tokensIn}), 0)::int`,
      tokensOut: sql<number>`coalesce(sum(${usages.tokensOut}), 0)::int`,
      cost: sql<string>`coalesce(sum(${usages.cost}), 0)`,
    })
    .from(usages)
    .where(where)
    .groupBy(usages.model);

  const byKindRows = await db
    .select({
      kind: usages.kind,
      calls: sql<number>`count(*)::int`,
      cost: sql<string>`coalesce(sum(${usages.cost}), 0)`,
    })
    .from(usages)
    .where(where)
    .groupBy(usages.kind);

  const [exportRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(drafts)
    .where(and(eq(drafts.userId, userId), eq(drafts.status, 'exported')));

  const byModel: UsageByModel[] = byModelRows.map((r) => ({
    model: r.model,
    tokensIn: r.tokensIn,
    tokensOut: r.tokensOut,
    costCents: round2(Number(r.cost)),
  }));
  byModel.sort((a, b) => b.costCents - a.costCents);

  return {
    tokensIn: byModel.reduce((s, r) => s + r.tokensIn, 0),
    tokensOut: byModel.reduce((s, r) => s + r.tokensOut, 0),
    costCents: round2(byModel.reduce((s, r) => s + r.costCents, 0)),
    exportCount: exportRow?.n ?? 0,
    byModel,
    byKind: byKindRows.map((r) => ({
      kind: r.kind,
      calls: r.calls,
      costCents: round2(Number(r.cost)),
    })),
  };
}
