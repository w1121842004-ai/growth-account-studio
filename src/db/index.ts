/**
 * Drizzle 客户端（postgres.js 驱动，PostgreSQL 17）。
 * 懒初始化 + 全局单例：Next dev 热重载不重复建连接池（ADR-007）。
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type Db = ReturnType<typeof createDb>;

const DEFAULT_URL = 'postgres://postgres:postgres@localhost:5432/growth_studio';

function createDb() {
  const url = process.env.DATABASE_URL ?? DEFAULT_URL;
  const sql = postgres(url, {
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });
  return drizzle(sql, { schema });
}

type GlobalWithDb = typeof globalThis & { __growthStudioDb?: Db };

/** 获取单例数据库句柄。首次调用才建立连接池。 */
export function getDb(): Db {
  const g = globalThis as GlobalWithDb;
  if (!g.__growthStudioDb) {
    g.__growthStudioDb = createDb();
  }
  return g.__growthStudioDb;
}

export { schema };
export * from './schema';
