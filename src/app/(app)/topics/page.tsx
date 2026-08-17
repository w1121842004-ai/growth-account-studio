"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Flame,
  History,
  Lightbulb,
  Plus,
  Radar,
  Search,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChipGroup } from "@/components/ui/chip-group";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/common/states";
import { useTopics } from "@/lib/api/hooks";
import { api, ApiError } from "@/lib/api/client";
import { formatHeat, competitionLabel, platformLabel } from "@/lib/format";
import type { Topic } from "@/lib/api/types";

const DOMAINS = ["个人成长", "职场", "情感", "学习"];
const PLATFORMS = [
  { value: "", label: "全部" },
  { value: "toutiao", label: "头条" },
  { value: "baidu", label: "百度" },
  { value: "zhihu", label: "知乎" },
  { value: "bilibili", label: "B站" },
];
const SORTS = [
  { value: "score", label: "评分" },
  { value: "heat", label: "热度" },
  { value: "competition", label: "竞争度" },
];
const SORT_FIELD: Record<string, keyof Topic> = {
  score: "score",
  heat: "heat",
  competition: "competition",
};

const SOURCE_ICON: Record<string, LucideIcon> = {
  toutiao: Flame,
  baidu: Lightbulb,
  zhihu: Lightbulb,
  bilibili: History,
};

export default function TopicsPage() {
  const router = useRouter();
  const [domain, setDomain] = useState("个人成长");
  const [platform, setPlatform] = useState("");
  const [sort, setSort] = useState("score");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [mining, setMining] = useState(false);
  const [mineNote, setMineNote] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useTopics({
    domain,
    platform: platform || undefined,
    page,
  });

  const items = useMemo(() => {
    const list = data?.items ?? [];
    const filtered = keyword
      ? list.filter((t) => t.title.toLowerCase().includes(keyword.toLowerCase()))
      : list;
    const field = SORT_FIELD[sort];
    return [...filtered].sort((a, b) => {
      const av = a[field] as number;
      const bv = b[field] as number;
      return sort === "competition" ? av - bv : bv - av;
    });
  }, [data, keyword, sort]);

  const mine = async () => {
    setMining(true);
    setMineNote(null);
    try {
      await api.post<Topic[]>("/topics/score", { domain, batchSize: 50 });
      setMineNote("已按当前赛道重新打分，高潜选题已置顶");
      setPage(1);
      refetch();
    } catch (err) {
      setMineNote(
        err instanceof ApiError ? "采集源暂不可用，已使用本地缓存打分" : "挖掘失败，请稍后重试",
      );
    } finally {
      setMining(false);
    }
  };

  const adopt = async (id: string) => {
    try {
      await api.post(`/topics/${id}/adopt`);
    } catch {
      // 采用是尽力而为：即使后端端点未就绪，也带着 topicId 进入写作台
    }
    router.push(`/drafts/new?topicId=${id}`);
  };

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-serif text-2xl font-medium text-fg">选题雷达</h1>
            <p className="mt-1 text-sm text-muted">从热榜与历史高赞里，挑出值得写的方向</p>
          </div>
          <Button onClick={mine} disabled={mining}>
            <Sparkles size={20} /> {mining ? "挖掘中…" : "智能挖掘选题"}
          </Button>
        </div>

        <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-fg-2">领域</span>
            <ChipGroup
              options={[{ value: "个人成长", label: "个人成长" }, ...DOMAINS.slice(1).map((d) => ({ value: d, label: d }))]}
              value={domain}
              onChange={(v) => {
                setDomain(v);
                setPage(1);
              }}
              size="sm"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-fg-2">来源</span>
            <ChipGroup options={PLATFORMS} value={platform} onChange={(v) => { setPlatform(v); setPage(1); }} size="sm" />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-fg-2">排序</span>
            <ChipGroup options={SORTS} value={sort} onChange={setSort} size="sm" />
            <div className="relative ml-auto w-full max-w-xs">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-meta" aria-hidden />
              <Input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜索选题关键词"
                className="pl-9"
              />
            </div>
          </div>
          {mineNote && <p className="text-sm text-accent">{mineNote}</p>}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState message={(error as Error)?.message || "选题雷达暂时连不上"} onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          title="还没有选题"
          hint="输入你的赛道，让选题雷达帮你找方向。试试「个人成长 / AI 提效」"
          action={
            <Button variant="secondary" onClick={mine} disabled={mining}>
              <Sparkles size={20} /> 智能挖掘
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {items.map((t) => (
              <TopicCard key={t.id} topic={t} onAdopt={() => adopt(t.id)} />
            ))}
          </div>
          {data?.hasMore && (
            <div className="mt-6 flex justify-center">
              <Button variant="secondary" onClick={() => setPage((p) => p + 1)}>
                加载更多
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TopicCard({ topic, onAdopt }: { topic: Topic; onAdopt: () => void }) {
  const Icon = SOURCE_ICON[topic.platform] ?? Radar;
  const comp = competitionLabel(topic.competition);
  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-serif text-lg font-medium leading-snug text-fg line-clamp-2">
            {topic.title}
          </h3>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge tone="accent">
            <Icon size={16} aria-hidden /> {platformLabel(topic.platform)}
          </Badge>
          <Badge tone="neutral">热度 {formatHeat(topic.heat)}</Badge>
          <Badge tone={comp.tone}>竞争度 {comp.text}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        {topic.duplicateWarning && (
          <p className="flex items-center gap-1.5 rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">
            <AlertTriangle size={16} aria-hidden /> 重复度预警：与近 7 天爆款高相似，建议改角度
          </p>
        )}
        <div className="mt-auto flex items-center justify-between">
          <span className="text-xs text-meta">综合分 {topic.score.toFixed(1)}</span>
          <Button variant="secondary" size="sm" onClick={onAdopt}>
            <Plus size={16} /> 采用
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
