/**
 * 健康快照（GET /health 的业务层）。
 * 只回答「能不能用」：数据库连通性、可用模型档数、采集是否在跑。
 * 绝不回连接串、密钥、堆栈——探针接口是无认证的，任何内部细节都算泄漏。
 */
import { sql } from 'drizzle-orm';
import { getDb } from '../../db';
import { resolveChain } from '../ai/registry';
import { isCollecting } from '../collection/worker';

export type DbStatus = 'up' | 'down';

export interface HealthSnapshot {
  status: 'ok' | 'degraded';
  db: DbStatus;
  /** 已配置且可用（含 API Key）的模型档数；0 表示生成/打分会返回 503 */
  modelsConfigured: number;
  collecting: boolean;
  time: string;
}

/** 数据库连通性探测：单条 select 1，失败只记日志不抛（探针必须始终有响应）。 */
async function pingDb(): Promise<DbStatus> {
  try {
    await getDb().execute(sql`select 1`);
    return 'up';
  } catch (err) {
    console.error('[health] 数据库不可用:', (err as Error).message);
    return 'down';
  }
}

async function countModels(): Promise<number> {
  try {
    return (await resolveChain('generate')).length;
  } catch (err) {
    console.warn('[health] 模型链解析失败:', (err as Error).message);
    return 0;
  }
}

export async function healthSnapshot(): Promise<HealthSnapshot> {
  const [db, modelsConfigured] = await Promise.all([pingDb(), countModels()]);
  return {
    status: db === 'up' ? 'ok' : 'degraded',
    db,
    modelsConfigured,
    collecting: isCollecting(),
    time: new Date().toISOString(),
  };
}
