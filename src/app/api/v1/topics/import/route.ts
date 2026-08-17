/**
 * 手动导入选题（微博等禁采源的合规兜底路径，R-3/C-4）。
 * 接受整段粘贴文本或标题数组；平台枚举仅限白名单四家，不接受 weibo 之类的禁采标记。
 */
import { requireUser } from '@/lib/auth/session';
import { badRequest, ok, route } from '@/lib/http/envelope';
import { optionalString, readJson, requireEnum } from '@/lib/http/params';
import { importTopics } from '@/lib/services/topic-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PLATFORMS = ['toutiao', 'baidu', 'zhihu', 'bilibili'] as const;

function extractTitles(body: Record<string, unknown>): string[] {
  if (Array.isArray(body.titles)) {
    return body.titles.filter((t): t is string => typeof t === 'string');
  }
  if (typeof body.text === 'string') {
    // 粘贴的热榜常带「1. 」「01 」「#」前缀，一并剥掉
    return body.text
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*(?:#|\d{1,3}[.、)\s]|[·•\-*])\s*/, '').trim())
      .filter((line) => line.length > 0);
  }
  return [];
}

export async function POST(req: Request): Promise<Response> {
  return route('topics.import', async () => {
    await requireUser(req);
    const body = await readJson(req);
    const titles = extractTitles(body);
    if (titles.length === 0) throw badRequest('请提供 titles 数组或 text 文本（每行一个标题）');
    const platform = requireEnum(body.platform, PLATFORMS, 'platform');
    const rows = await importTopics({
      titles,
      platform,
      domain: optionalString(body.domain, 'domain', 40),
    });
    return ok(rows, 201);
  });
}
