/**
 * 采集 worker 入口（ADR-008：node-cron 常驻进程，不引 Redis/BullMQ）。
 *
 * 运行方式：
 *   npx tsx scripts/worker.ts          # 常驻，按 cron 表达式跑
 *   npx tsx scripts/worker.ts --once   # 立即跑一轮后退出（手动/CI 用）
 *
 * dev 下不随 next dev 自动启动 —— 采集是出网行为，必须显式启动。
 */
import cron from 'node-cron';
import { collectAll, isCollecting } from '../src/lib/collection/worker';

const EXPRESSION = process.env.COLLECTION_CRON_EXPRESSION ?? '0 */4 * * *';
const TIMEZONE = process.env.COLLECTION_CRON_TZ ?? 'Asia/Shanghai';

async function runOnce(trigger: string): Promise<void> {
  if (isCollecting()) {
    console.log(`[worker] ${trigger} 跳过：上一轮仍在执行（单并发）`);
    return;
  }
  const startedAt = Date.now();
  try {
    const report = await collectAll();
    if (report.skipped) {
      console.log(`[worker] ${trigger} 被单并发闸拦下`);
      return;
    }
    for (const r of report.results) {
      console.log(
        `[worker] ${r.key} status=${r.status} fetched=${r.fetched} upserted=${r.inserted}` +
          (r.reason ? ` reason=${r.reason}` : ''),
      );
    }
    console.log(
      `[worker] ${trigger} 完成，共入库 ${report.inserted} 条，耗时 ${Date.now() - startedAt}ms`,
    );
  } catch (err) {
    // worker 不允许因单轮失败退出：下一轮 cron 继续（退避状态已落库）
    console.error(`[worker] ${trigger} 异常：`, err instanceof Error ? err.message : err);
  }
}

async function main(): Promise<void> {
  const once = process.argv.includes('--once');
  if (once) {
    await runOnce('手动单次');
    process.exit(0);
  }
  if (!cron.validate(EXPRESSION)) {
    console.error(`[worker] cron 表达式非法：${EXPRESSION}`);
    process.exit(1);
  }
  console.log(`[worker] 启动，表达式 ${EXPRESSION}（${TIMEZONE}）`);
  cron.schedule(EXPRESSION, () => void runOnce('定时'), { timezone: TIMEZONE });

  const shutdown = (sig: string) => {
    console.log(`[worker] 收到 ${sig}，退出`);
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

void main();
