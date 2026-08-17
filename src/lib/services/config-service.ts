/**
 * 配置业务（F5：模型热切换 ADR-004 / 采集源启停 AC-02 / 个人设置）。
 * apiKey 只写不读：响应里永不回传明文，只回 hasApiKey 布尔位。
 */
import { eq } from 'drizzle-orm';
import { getDb, modelConfigs, sourceConfigs, users, type UserSettings } from '../../db';
import { envTargets } from '../ai/registry';
import { breakerKey, snapshot as breakerSnapshot } from '../ai/breaker';
import { canEnableSource, CollectionBlockedError } from '../collection/robots';
import { listSources as listSourceRows } from '../collection/worker';
import { conflict, notFound, unprocessable } from '../http/envelope';

export type ModelRow = typeof modelConfigs.$inferSelect;

export interface ModelConfigDto {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  role: ModelRow['role'];
  tier: string;
  priority: number;
  enabled: boolean;
  hasApiKey: boolean;
}

function modelDto(row: ModelRow): ModelConfigDto {
  return {
    id: row.id,
    name: row.name,
    baseUrl: row.baseUrl,
    model: row.model,
    role: row.role,
    tier: row.tier,
    priority: row.priority,
    enabled: row.enabled,
    hasApiKey: row.apiKey.length > 0,
  };
}

/** 库内无配置时用环境变量种子写入一次，避免设置页空白（ADR-004 默认值）。 */
export async function seedModelConfigs(): Promise<void> {
  const db = getDb();
  const existing = await db.select({ id: modelConfigs.id }).from(modelConfigs).limit(1);
  if (existing.length > 0) return;
  const targets = envTargets();
  if (targets.length === 0) return;
  await db.insert(modelConfigs).values(
    targets.map((t, i) => ({
      name: t.name,
      baseUrl: t.baseUrl,
      apiKey: t.apiKey,
      model: t.model,
      role: t.role,
      tier: t.tier,
      priority: (i + 1) * 10,
      enabled: true,
    })),
  );
}

export async function listModels(): Promise<ModelConfigDto[]> {
  await seedModelConfigs();
  const rows = await getDb().select().from(modelConfigs);
  rows.sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
  return rows.map(modelDto);
}

export interface ModelPatch {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  role?: ModelRow['role'];
  tier?: string;
  priority?: number;
  enabled?: boolean;
}

export async function updateModel(id: string, patch: ModelPatch): Promise<ModelConfigDto> {
  const db = getDb();
  const [current] = await db.select().from(modelConfigs).where(eq(modelConfigs.id, id)).limit(1);
  if (!current) throw notFound('模型配置不存在');

  const next = { ...patch };
  // 空字符串 apiKey 视为「不修改」，避免前端回填空值把 key 洗掉
  if (next.apiKey !== undefined && next.apiKey.trim() === '') delete next.apiKey;
  const enabled = next.enabled ?? current.enabled;
  const apiKey = next.apiKey ?? current.apiKey;
  if (enabled && apiKey.trim() === '') {
    throw unprocessable('启用该模型前必须填写 API Key');
  }
  const [row] = await db
    .update(modelConfigs)
    .set(next)
    .where(eq(modelConfigs.id, id))
    .returning();
  return modelDto(row);
}

/**
 * 各模型熔断状态（/health 与设置页展示）。
 * 刻意不调 gate()：gate() 在半开时会占用唯一探测名额，健康检查不能有这种副作用。
 */
export async function modelHealth() {
  const rows = await getDb().select().from(modelConfigs);
  const now = Date.now();
  return rows.map((r) => {
    const state = breakerSnapshot(breakerKey(r.baseUrl, r.model));
    const status = state.openUntil === 0 ? 'closed' : now < state.openUntil ? 'open' : 'half-open';
    return {
      id: r.id,
      name: r.name,
      model: r.model,
      enabled: r.enabled,
      hasApiKey: r.apiKey.length > 0,
      breaker: status,
      failures: state.failures,
      openUntil: state.openUntil ? new Date(state.openUntil).toISOString() : null,
    };
  });
}

export interface SourceConfigDto {
  id: string;
  key: string;
  name: string;
  endpoint: string;
  enabled: boolean;
  lastFetch: string | null;
  failures: number;
  nextRetryAt: string | null;
  robotsAllowed: boolean;
  robotsNote: string;
}

export async function listSources(): Promise<SourceConfigDto[]> {
  const rows = await listSourceRows();
  return rows.map((r) => ({
    id: r.id,
    key: r.key,
    name: r.name,
    endpoint: r.endpoint,
    enabled: r.enabled,
    lastFetch: r.lastFetch,
    failures: r.failures,
    nextRetryAt: r.nextRetryAt,
    robotsAllowed: r.robotsAllowed,
    robotsNote: r.robotsNote,
  }));
}

/**
 * 启停采集源。启用前必过 canEnableSource —— 未核验 robots 的源不允许被 UI 打开（C-4）。
 * 关闭永远允许。
 */
export async function updateSource(id: string, enabled: boolean): Promise<SourceConfigDto> {
  const db = getDb();
  const [current] = await db.select().from(sourceConfigs).where(eq(sourceConfigs.id, id)).limit(1);
  if (!current) throw notFound('采集源不存在');
  if (enabled) {
    const check = canEnableSource(current.key);
    if (!check.ok) throw conflict(`该源不可启用：${check.reason}`);
  }
  await db
    .update(sourceConfigs)
    .set({ enabled, failures: enabled ? 0 : current.failures, nextRetryAt: null })
    .where(eq(sourceConfigs.id, id));
  const all = await listSources();
  const dto = all.find((s) => s.id === id);
  if (!dto) throw notFound('采集源不存在');
  return dto;
}

export const DEFAULT_SETTINGS: Required<UserSettings> = {
  profile: '',
  tone: '温暖、有共鸣、可操作',
  layout: 'minimal',
};

export async function getSettings(userId: string): Promise<Required<UserSettings>> {
  const [row] = await getDb()
    .select({ settings: users.settings })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) throw notFound('用户不存在');
  return { ...DEFAULT_SETTINGS, ...(row.settings ?? {}) };
}

export async function updateSettings(
  userId: string,
  patch: UserSettings,
): Promise<Required<UserSettings>> {
  const current = await getSettings(userId);
  const next: Required<UserSettings> = {
    profile: patch.profile ?? current.profile,
    tone: patch.tone ?? current.tone,
    layout: patch.layout ?? current.layout,
  };
  await getDb().update(users).set({ settings: next }).where(eq(users.id, userId));
  return next;
}

export { CollectionBlockedError };
