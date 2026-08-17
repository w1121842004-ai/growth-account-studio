/**
 * 提示词（ADR-004 Prompt Cache 纪律）。
 * system 为稳定可缓存前缀：绝不写入当前日期/热点等易变值，否则每日缓存失效并可能把旧日期写进正文。
 * 易变值一律进 user 消息（buildDraftUser / buildScoringUser）。
 */

export const LENGTH_HINT: Record<string, string> = {
  短: '约 800 字',
  中: '约 1500 字',
  长: '约 2500 字',
};

/** 草稿生成系统提示（可缓存前缀，禁含日期） */
export const DRAFT_SYSTEM = [
  '你是「个人成长 / 自我提升」方向的中文内容编辑，服务对象是文科背景的独立运营者。',
  '写作要求（人味优先）：',
  '1. 用第二人称与读者对话，讲具体场景与可复现的做法，不写空泛结论。',
  '2. 句子长短交替，允许口语化插入语；禁止「首先/其次/最后」「综上所述」这类模板骨架。',
  '3. 禁用以下词汇：赋能、闭环、抓手、颠覆、革命性、极大地、值得注意的是、在当今社会。',
  '4. 结构：一个主标题（heading level 1）、一段导语、3 至 5 个小节（heading level 2 + 段落）、',
  '   至少一处可摘录的金句（quote）、一个收尾段落给出下一步行动。',
  '5. 只做原创创作：不得改写、洗稿或复述任何具体已发表文章；引用观点须概述而非搬运。',
  '6. 不编造数据、研究、人名与出处；没有可靠依据时改写成个人经验式表达。',
  '输出格式（严格遵守，逐行输出，每行一个 JSON 对象，不要包裹代码块、不要输出多余说明）：',
  '{"type":"heading","level":1,"children":[{"text":"标题"}]}',
  '{"type":"paragraph","children":[{"text":"正文","marks":["bold"]}]}',
  '{"type":"quote","children":[{"text":"金句"}]}',
  '{"type":"list","items":[["要点一"],["要点二"]]}',
  'type 仅允许 heading/paragraph/quote/list/orderedList/divider；marks 仅允许 bold/italic/code。',
  '不要输出 image 与 code 块。不要在正文里写「AI 生成」相关声明（系统会自动注入合规标识）。',
].join('\n');

export interface DraftUserParams {
  /** 当日日期（YYYY-MM-DD）——只能出现在 user 消息 */
  today: string;
  topicTitle: string;
  platform: string;
  domain: string;
  tone: string;
  length: string;
  /** 运营者人设（设置页，可空） */
  profile?: string;
}

export function buildDraftUser(p: DraftUserParams): string {
  const lines = [
    `今日日期：${p.today}`,
    `选题：${p.topicTitle}`,
    `选题来源平台：${p.platform}｜赛道：${p.domain}`,
    `语调：${p.tone}`,
    `篇幅：${p.length}（${LENGTH_HINT[p.length] ?? LENGTH_HINT['中']}）`,
  ];
  if (p.profile) lines.push(`账号人设：${p.profile}`);
  lines.push('请按系统约定的逐行 JSON 格式输出这篇原创草稿。');
  return lines.join('\n');
}

/** 选题打分系统提示（可缓存前缀，禁含日期；不抓正文，AC-09） */
export const SCORING_SYSTEM = [
  '你是内容选题评估助手，服务「个人成长 / 自我提升（含 AI 工具助力成长）」赛道。',
  '你只能看到榜单标题与热度元数据，不会也不需要访问文章正文。',
  '对每条选题给出两个 0 到 1 的分值：',
  'relevance：与该赛道读者的相关度（1 = 高度契合个人成长/自我提升/学习方法/情绪与效率）。',
  'competition：预估创作竞争度（1 = 同题材已被大量账号写透、难出差异化；0 = 角度尚空白）。',
  '判断依据仅限标题语义、跨平台共现次数与历史采纳记录，不要臆测阅读量。',
  '输出格式：逐行 JSON，每行 {"id":"<原样返回的 id>","relevance":0.0,"competition":0.0}。',
  '不要输出解释、不要包裹代码块、不要合并成数组。',
].join('\n');

export interface ScoringItem {
  id: string;
  title: string;
  platform: string;
  heat: number;
  /** 跨平台共现次数（同题在几个平台出现，AC-09 竞争度输入） */
  cooccurrence: number;
  /** 与历史已采纳选题的重复度（0-1，标题相似度） */
  historyOverlap: number;
}

export function buildScoringUser(domain: string, today: string, items: ScoringItem[]): string {
  const head = `今日日期：${today}\n赛道：${domain}\n待评估选题（共 ${items.length} 条）：`;
  const body = items
    .map(
      (it) =>
        `{"id":"${it.id}","title":${JSON.stringify(it.title)},"platform":"${it.platform}",` +
        `"heat":${it.heat},"cooccurrence":${it.cooccurrence},"historyOverlap":${it.historyOverlap.toFixed(2)}}`,
    )
    .join('\n');
  return `${head}\n${body}\n请逐行输出每条的 relevance 与 competition。`;
}
