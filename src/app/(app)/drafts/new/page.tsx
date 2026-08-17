"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Clock,
  Pencil,
  Sparkles,
  SquarePen,
  StretchHorizontal,
  Trash2,
  Type,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChipGroup } from "@/components/ui/chip-group";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { useEditorStore } from "@/store/editorStore";
import { useTopic } from "@/lib/api/hooks";
import { generateDraftStream } from "@/lib/api/sse";
import { ApiError } from "@/lib/api/client";
import type { Block } from "@/lib/api/types";

function blockText(b: Block): string {
  if (b.text) return b.text;
  if (b.children) return b.children.map((c) => c.text).join("");
  if (b.items) return b.items.join(" / ");
  if (b.type === "divider") return "——";
  return "";
}

const TONES = [
  { value: "温暖", label: "温暖" },
  { value: "克制", label: "克制" },
  { value: "犀利", label: "犀利" },
];
const LENGTHS = [
  { value: "短", label: "短" },
  { value: "中", label: "中" },
  { value: "长", label: "长" },
];

export default function NewDraftPage() {
  return (
    <Suspense fallback={<LoadingState label="加载写作台…" />}>
      <NewDraftWorkbench />
    </Suspense>
  );
}

function NewDraftWorkbench() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const topicId = searchParams.get("topicId");
  const { generating, suggestions, generatedBlocks } = useEditorStore();
  const startGenerating = useEditorStore((s) => s.startGenerating);
  const appendBlock = useEditorStore((s) => s.appendBlock);
  const finishGenerating = useEditorStore((s) => s.finishGenerating);
  const addSuggestion = useEditorStore((s) => s.addSuggestion);
  const resolveSuggestion = useEditorStore((s) => s.resolveSuggestion);
  const setCurrentDraftId = useEditorStore((s) => s.setCurrentDraftId);
  const reset = useEditorStore((s) => s.reset);

  const [tone, setTone] = useState("温暖");
  const [length, setLength] = useState("中");
  const [err, setErr] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    reset();
  }, [reset]);

  const { data: topic } = useTopic(topicId ?? "");

  const wordCount = generatedBlocks.reduce((n, b) => n + blockText(b).length, 0);
  const readingMin = Math.max(1, Math.round(wordCount / 350));

  const run = async (action: "生成草稿" | "续写" | "扩写" | "润色") => {
    if (!topicId) return;
    setErr(null);
    startGenerating();
    const ac = new AbortController();
    abortRef.current = ac;
    const toneNote = action === "润色" ? "润色语气，更口语" : action === "扩写" ? "展开细节" : action === "续写" ? "顺着写下去" : tone;
    try {
      await generateDraftStream(
        topicId,
        { tone: toneNote, length },
        {
          signal: ac.signal,
          onBlock: (b) => {
            appendBlock(b);
            addSuggestion({
              id: `${Date.now()}-${generatedBlocks.length}-${Math.random()}`,
              blockIndex: generatedBlocks.length,
              text: blockText(b),
              status: "pending",
            });
          },
          onDone: (draftId) => {
            finishGenerating();
            setCurrentDraftId(draftId);
            router.push(`/drafts/${draftId}`);
          },
          onError: (msg) => {
            finishGenerating();
            setErr(msg || "生成中断");
          },
        },
      );
    } catch (e) {
      finishGenerating();
      if (e instanceof ApiError) setErr(e.message);
    }
  };

  const pendingCount = suggestions.filter((s) => s.status === "pending").length;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href="/topics" className="text-muted hover:text-fg" aria-label="返回选题">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="font-serif text-xl font-medium text-fg">
              {topic ? topic.title : topicId ? "生成写作台" : "新建写作台"}
            </h1>
            <p className="text-xs text-muted">AI 起头，你来做主</p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted">
          <span className="inline-flex items-center gap-1">
            <Type size={16} aria-hidden /> {wordCount} 字
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock size={16} aria-hidden /> 约 {readingMin} 分钟
          </span>
          <Badge tone={generating ? "accent" : "neutral"}>
            {generating ? "AI 生成中" : "待生成"}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_260px]">
        <div className="min-w-0">
          {err && <ErrorState message={err} className="mb-4" />}
          {!topicId && !generating ? (
            <EmptyState
              title="先从选题池挑一个方向"
              hint="回到选题雷达，点「采用」即可带着选题进入写作台"
              action={
                <Link href="/topics">
                  <Button variant="secondary">去选题池</Button>
                </Link>
              }
            />
          ) : generatedBlocks.length === 0 && !generating ? (
            <EmptyState
              title="从这段开始写，或让 AI 帮你起头"
              hint="示例导语：「年底了，我又一次打开备忘录，发现去年写的计划只完成了一半……」"
              action={
                <Button onClick={() => run("生成草稿")} disabled={!topicId}>
                  <Sparkles size={20} /> 生成草稿
                </Button>
              }
            />
          ) : (
            <div className="flex flex-col gap-3">
              {generating && <LoadingState label="AI 正在生成…预计 20s" className="py-6" />}
              {suggestions.map((s) => (
                <SuggestionCard
                  key={s.id}
                  text={s.text}
                  status={s.status}
                  onAdopt={() => resolveSuggestion(s.id, "adopted")}
                  onDiscard={() => resolveSuggestion(s.id, "discarded")}
                  onEdit={() => {
                    setEditingId(s.id);
                    setEditText(s.text);
                  }}
                  editing={editingId === s.id}
                  editText={editText}
                  onEditText={setEditText}
                  onSaveEdit={() => {
                    resolveSuggestion(s.id, "edited");
                    setEditingId(null);
                  }}
                  onCancelEdit={() => setEditingId(null)}
                />
              ))}
            </div>
          )}
        </div>

        <aside className="rounded-lg border border-border bg-surface-warm p-4 lg:sticky lg:top-20 lg:self-start">
          <p className="mb-2 text-sm font-medium text-fg-2">语调</p>
          <ChipGroup options={TONES} value={tone} onChange={setTone} size="sm" className="mb-4" />
          <p className="mb-2 text-sm font-medium text-fg-2">长度</p>
          <ChipGroup options={LENGTHS} value={length} onChange={setLength} size="sm" className="mb-4" />
          <div className="flex flex-col gap-2">
            <Button onClick={() => run("生成草稿")} disabled={!topicId || generating}>
              <Sparkles size={20} /> 生成草稿
            </Button>
            <Button variant="secondary" size="sm" onClick={() => run("续写")} disabled={!topicId || generating}>
              <SquarePen size={16} /> 续写
            </Button>
            <Button variant="secondary" size="sm" onClick={() => run("扩写")} disabled={!topicId || generating}>
              <StretchHorizontal size={16} /> 扩写
            </Button>
            <Button variant="secondary" size="sm" onClick={() => run("润色")} disabled={!topicId || generating}>
              <Wand2 size={16} /> 润色
            </Button>
          </div>
          <p className="mt-4 text-xs text-meta">已采纳 {suggestions.filter((s) => s.status === "adopted").length} 条 · 待处理 {pendingCount} 条</p>
        </aside>
      </div>
    </div>
  );
}

function SuggestionCard({
  text,
  status,
  onAdopt,
  onDiscard,
  onEdit,
  editing,
  editText,
  onEditText,
  onSaveEdit,
  onCancelEdit,
}: {
  text: string;
  status: "pending" | "adopted" | "edited" | "discarded";
  onAdopt: () => void;
  onDiscard: () => void;
  onEdit: () => void;
  editing: boolean;
  editText: string;
  onEditText: (v: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
}) {
  if (status === "discarded") return null;
  return (
    <Card className={status === "adopted" ? "border-accent" : undefined}>
      <CardContent className="flex flex-col gap-3 pt-5">
        {editing ? (
          <>
            <Textarea value={editText} onChange={(e) => onEditText(e.target.value)} rows={4} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={onCancelEdit}>
                取消
              </Button>
              <Button size="sm" onClick={onSaveEdit}>
                保存改写
              </Button>
            </div>
          </>
        ) : (
          <p className="text-base leading-relaxed text-fg">{text}</p>
        )}
        <div className="flex items-center gap-2">
          {status === "adopted" && <Badge tone="success">已采纳</Badge>}
          {status === "edited" && <Badge tone="accent">已改写</Badge>}
          {!editing && (
            <>
              <Button size="sm" variant="secondary" onClick={onAdopt}>
                <Check size={16} /> 采纳
              </Button>
              <Button size="sm" variant="ghost" onClick={onEdit}>
                <Pencil size={16} /> 改写
              </Button>
              <Button size="sm" variant="ghost" onClick={onDiscard}>
                <Trash2 size={16} /> 丢弃
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
