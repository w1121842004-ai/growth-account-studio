"use client";

import { useState } from "react";
import { Circle, Save, Settings2, ShieldCheck, Sparkles, Layers, Rss, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChipGroup } from "@/components/ui/chip-group";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LoadingState } from "@/components/common/states";
import {
  useModels,
  useSettings,
  useSaveSettings,
  useSources,
  useToggleSource,
  useUpdateModel,
} from "@/lib/api/hooks";
import type { LayoutTemplate } from "@/lib/api/types";

const SECTIONS = [
  { key: "profile", label: "人设语调", icon: UserRound },
  { key: "models", label: "模型切换", icon: Settings2 },
  { key: "layout", label: "默认排版", icon: Layers },
  { key: "sources", label: "采集源", icon: Rss },
  { key: "compliance", label: "合规", icon: ShieldCheck },
] as const;
type SectionKey = (typeof SECTIONS)[number]["key"];

const TONES = [
  { value: "温暖", label: "温暖" },
  { value: "克制", label: "克制" },
  { value: "犀利", label: "犀利" },
];
const LAYOUTS = [
  { value: "minimal", label: "极简" },
  { value: "book", label: "书卷" },
  { value: "columns", label: "分栏" },
];

const DEFAULT_PROFILE = "小林 · 用 AI 助力自我成长的记录者";
const DEFAULT_TONE = "温暖";
const DEFAULT_LAYOUT: LayoutTemplate = "book";

export default function SettingsPage() {
  const [section, setSection] = useState<SectionKey>("profile");
  const { data: settings } = useSettings();
  const saveSettings = useSaveSettings();

  const [dirty, setDirty] = useState<{ profile?: string; tone?: string; layout?: LayoutTemplate }>({});
  const profile = dirty.profile ?? settings?.profile ?? DEFAULT_PROFILE;
  const tone = dirty.tone ?? settings?.tone ?? DEFAULT_TONE;
  const layout = dirty.layout ?? settings?.layout ?? DEFAULT_LAYOUT;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <div>
        <h1 className="font-serif text-2xl font-medium text-fg">设置</h1>
        <p className="mt-1 text-sm text-muted">人设、模型与排版偏好，让生成的稿子更像你</p>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-[180px_1fr]">
        <nav className="flex flex-row gap-1 md:flex-col">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.key}
                onClick={() => setSection(s.key)}
                className={`flex items-center gap-2 rounded-md px-3 py-2.5 text-base font-medium transition-colors duration-150 focus-visible:outline-none ${
                  section === s.key ? "bg-accent-soft text-accent" : "text-fg-2 hover:bg-surface-warm"
                }`}
              >
                <Icon size={20} aria-hidden /> {s.label}
              </button>
            );
          })}
        </nav>

        <div className="min-w-0">
          {section === "profile" && (
            <Card>
              <CardHeader>
                <CardTitle>人设与语调</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <label className="flex flex-col gap-1.5 text-sm text-fg-2">
                  人设描述
                  <Textarea value={profile} onChange={(e) => setDirty((d) => ({ ...d, profile: e.target.value }))} rows={3} />
                </label>
                <div>
                  <p className="mb-2 text-sm text-fg-2">默认语调</p>
                  <ChipGroup options={TONES} value={tone} onChange={(v) => setDirty((d) => ({ ...d, tone: v }))} />
                </div>
                <p className="rounded-md bg-surface-warm px-3 py-2 text-sm text-muted">
                  示例：「{tone}地说：年底了，我又一次打开备忘录，发现去年写的计划只完成了一半……」
                </p>
                <div>
                  <Button
                    size="sm"
                    onClick={() => saveSettings.mutate({ profile, tone }, { onSuccess: () => { setDirty({}); setSection("models"); } })}
                    disabled={saveSettings.isPending}
                  >
                    <Save size={16} /> 保存人设
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {section === "layout" && (
            <Card>
              <CardHeader>
                <CardTitle>默认排版模板（仅影响微信视图）</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <ChipGroup options={LAYOUTS} value={layout} onChange={(v) => setDirty((d) => ({ ...d, layout: v as LayoutTemplate }))} />
                <Button size="sm" onClick={() => saveSettings.mutate({ layout }, { onSuccess: () => setDirty({}) })} disabled={saveSettings.isPending}>
                  <Save size={16} /> 保存排版偏好
                </Button>
              </CardContent>
            </Card>
          )}

          {section === "models" && <ModelsSection />}
          {section === "sources" && <SourcesSection />}
          {section === "compliance" && (
            <Card>
              <CardHeader>
                <CardTitle>合规说明</CardTitle>
              </CardHeader>
              <CardContent className="flex items-start gap-3">
                <ShieldCheck size={24} className="shrink-0 text-accent" aria-hidden />
                <p className="text-sm text-fg-2">
                  导出正文自动注入「本文含 AI 辅助创作」，且不可关闭（平台合规要求）。发布行为由你在各平台后台手动完成，本工具不提供自动发布。
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function ModelsSection() {
  const { data, isLoading } = useModels();
  const update = useUpdateModel();
  if (isLoading) return <LoadingState label="加载模型配置…" />;
  return (
    <div className="flex flex-col gap-4">
      {data?.map((m) => (
        <ModelRow key={`${m.id}:${m.baseUrl}:${m.model}:${m.enabled}`} id={m.id} name={m.name} baseUrl={m.baseUrl} model={m.model} role={m.role} enabled={m.enabled} onSave={(patch) => update.mutate({ id: m.id, patch })} saving={update.isPending} />
      ))}
    </div>
  );
}

function ModelRow({
  name,
  baseUrl,
  model,
  role,
  enabled,
  onSave,
  saving,
}: {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  role: string;
  enabled: boolean;
  onSave: (patch: { baseUrl?: string; model?: string; enabled?: boolean }) => void;
  saving: boolean;
}) {
  const [url, setUrl] = useState(baseUrl);
  const [mdl, setMdl] = useState(model);
  const [on, setOn] = useState(enabled);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2">
          <Circle size={12} className={on ? "text-success" : "text-warn"} fill="currentColor" aria-hidden />
          {name}
        </CardTitle>
        <Badge tone={role === "primary" ? "accent" : "neutral"}>{role === "primary" ? "主模型" : "备选"}</Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5 text-sm text-fg-2">
          Base URL
          <Input value={url} onChange={(e) => setUrl(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm text-fg-2">
          模型名
          <Input value={mdl} onChange={(e) => setMdl(e.target.value)} />
        </label>
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-fg-2">
            <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} className="accent-accent" />
            启用
          </label>
          <Button size="sm" disabled={saving} onClick={() => onSave({ baseUrl: url, model: mdl, enabled: on })}>
            <Save size={16} /> 保存
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SourcesSection() {
  const { data, isLoading } = useSources();
  const toggle = useToggleSource();
  if (isLoading) return <LoadingState label="加载采集源…" />;
  return (
    <div className="flex flex-col gap-4">
      {data?.map((s) => (
        <Card key={s.id}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="flex items-center gap-2">
              <Rss size={18} className="text-accent" aria-hidden /> {s.name}
            </CardTitle>
            <Badge tone={s.enabled ? "success" : "neutral"}>{s.enabled ? "采集中" : "已停用"}</Badge>
          </CardHeader>
          <CardContent className="flex items-start justify-between gap-3">
            <p className="text-sm text-muted">{s.robotsNote || "白名单来源，合规可采集"}</p>
            <Button variant="secondary" size="sm" disabled={toggle.isPending} onClick={() => toggle.mutate({ id: s.id, enabled: !s.enabled })}>
              {s.enabled ? "停用" : "启用"}
            </Button>
          </CardContent>
        </Card>
      ))}
      <p className="flex items-center gap-1.5 text-xs text-meta">
        <Sparkles size={14} aria-hidden /> 采集仅限白名单来源，微博不采集（合规约束）
      </p>
    </div>
  );
}
