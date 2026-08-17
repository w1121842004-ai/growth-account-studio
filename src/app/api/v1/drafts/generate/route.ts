/**
 * 生成草稿（SSE，AC-03）。
 * 只产出草稿，不含任何发布动作（Spec §3 Out-of-Scope / ADR-003）。
 *
 * 错误处理分两段：
 * - 建流之前（鉴权/限流/参数/选题不存在）→ 正常 JSON 错误码，前端 client 能识别。
 * - 建流之后（模型失败）→ HTTP 200 已发出，只能转 SSE error 事件。
 */
import { requireUser } from '@/lib/auth/session';
import { route } from '@/lib/http/envelope';
import { optionalEnum, optionalString, readJson, requireUuid } from '@/lib/http/params';
import { clientKey, enforceLimit } from '@/lib/http/rate-limit';
import { sseResponse } from '@/lib/http/sse';
import { generateDraftEvents } from '@/lib/services/generate-service';
import { getTopic } from '@/lib/services/topic-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const LENGTHS = ['短', '中', '长'] as const;

export async function POST(req: Request): Promise<Response> {
  return route('drafts.generate', async () => {
    const user = await requireUser(req);
    enforceLimit('generate', clientKey(req, user.id));
    const body = await readJson(req);
    const topicId = requireUuid(
      typeof body.topicId === 'string' ? body.topicId : undefined,
      'topicId',
    );
    // 建流前先确认选题存在，让 404 走标准 JSON 错误而不是 SSE error
    await getTopic(topicId);

    const input = {
      userId: user.id,
      topicId,
      tone: optionalString(body.tone, 'tone', 120),
      length: optionalEnum(body.length, LENGTHS, 'length'),
    };
    // 成功路径返回 SSE 流，不走 JSON 信封
    return sseResponse((signal) => generateDraftEvents(input, signal), req.signal);
  });
}
