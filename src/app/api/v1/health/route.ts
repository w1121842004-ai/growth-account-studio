/**
 * 健康检查。不需要认证（容器探针/反代要能直接打）。
 * 只暴露「能不能用」，不暴露连接串、密钥、堆栈。
 */
import { ok, route } from '@/lib/http/envelope';
import { healthSnapshot } from '@/lib/services/health-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  return route('health', async () => ok(await healthSnapshot()));
}
