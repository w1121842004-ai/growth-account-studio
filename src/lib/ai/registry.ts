/**
 * 模型注册表：model_configs 表为准，env 为兜底默认（ADR-004 热切换不改代码）。
 * 选路：generate → role=primary 优先，再按 priority 取 fallback；
 *       score    → tier=score 的省钱档优先（hunyuan-lite），无则复用 generate 链。
 */
import { asc, eq } from 'drizzle-orm';
import { getDb, modelConfigs } from '../../db';

export type ModelKind = 'generate' | 'score';

export interface ModelTarget {
  configId?: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  role: 'primary' | 'fallback';
  tier: string;
}

/** env 默认档（首次启动未写 model_configs 时可用；apiKey 为空则该档不可用） */
export function envTargets(): ModelTarget[] {
  const list: ModelTarget[] = [
    {
      name: '腾讯混元 Hy3',
      baseUrl: process.env.HUNYUAN_BASE_URL ?? 'https://tokenhub.tencentmaas.com/v1',
      apiKey: process.env.HUNYUAN_API_KEY ?? '',
      model: process.env.HUNYUAN_MODEL ?? 'hy3',
      role: 'primary',
      tier: 'generate',
    },
    {
      name: '混元省钱档',
      baseUrl: process.env.HUNYUAN_BASE_URL ?? 'https://tokenhub.tencentmaas.com/v1',
      apiKey: process.env.HUNYUAN_API_KEY ?? '',
      model: process.env.HUNYUAN_LITE_MODEL ?? 'hunyuan-lite',
      role: 'fallback',
      tier: 'score',
    },
    {
      name: '智谱 GLM-4.7-Flash',
      baseUrl: process.env.ZHIPU_BASE_URL ?? 'https://open.bigmodel.cn/api/paas/v4',
      apiKey: process.env.ZHIPU_API_KEY ?? '',
      model: process.env.ZHIPU_MODEL ?? 'glm-4.7-flash',
      role: 'fallback',
      tier: 'generate',
    },
    {
      name: '通义 Qwen Plus',
      baseUrl: process.env.QWEN_BASE_URL ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      apiKey: process.env.QWEN_API_KEY ?? '',
      model: process.env.QWEN_MODEL ?? 'qwen-plus',
      role: 'fallback',
      tier: 'generate',
    },
  ];
  return list.filter((t) => t.apiKey.length > 0);
}

async function dbTargets(): Promise<ModelTarget[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(modelConfigs)
    .where(eq(modelConfigs.enabled, true))
    .orderBy(asc(modelConfigs.priority));
  return rows
    .filter((r) => r.apiKey.length > 0)
    .map((r) => ({
      configId: r.id,
      name: r.name,
      baseUrl: r.baseUrl,
      apiKey: r.apiKey,
      model: r.model,
      role: r.role,
      tier: r.tier,
    }));
}

function orderChain(targets: ModelTarget[], kind: ModelKind): ModelTarget[] {
  const rank = (t: ModelTarget): number => {
    if (kind === 'score') {
      if (t.tier === 'score') return 0;
      return t.role === 'primary' ? 1 : 2;
    }
    // generate：省钱档不入主链路（ADR-004），仅在无其他可用时兜底
    if (t.tier === 'score') return 3;
    return t.role === 'primary' ? 0 : 1;
  };
  return [...targets].sort((a, b) => rank(a) - rank(b));
}

/**
 * 解析调用链。DB 不可用（未迁移/未启库）时退回 env 档，不让整个端点崩溃。
 * 返回空数组表示「未配置任何可用模型」，调用方须回 503 + 明确指引。
 */
export async function resolveChain(kind: ModelKind): Promise<ModelTarget[]> {
  let targets: ModelTarget[] = [];
  try {
    targets = await dbTargets();
  } catch (err) {
    console.warn('[ai] model_configs 读取失败，回退 env 默认档:', (err as Error).message);
  }
  if (targets.length === 0) targets = envTargets();
  return orderChain(targets, kind);
}
