/**
 * TanStack Query hooks（服务端态）。路径与 openapi.yaml 严格一致。
 * 仅封装 GET/PUT 等确定性调用；SSE 生成走 sse.ts。
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type {
  Draft,
  ExportResult,
  GenerateRequest,
  ModelConfig,
  ModelConfigPatch,
  PaginatedTopics,
  RenderPlatform,
  RenderResult,
  Settings,
  SettingsPatch,
  SourceConfig,
  Topic,
  UsageStat,
} from "./types";

export const queryKeys = {
  topics: (params: Record<string, string | number>) => ["topics", params] as const,
  topic: (id: string) => ["topic", id] as const,
  draft: (id: string) => ["draft", id] as const,
  draftRender: (id: string, platform: RenderPlatform) => ["render", id, platform] as const,
  models: ["models"] as const,
  sources: ["sources"] as const,
  usage: ["usage"] as const,
  settings: ["settings"] as const,
};

export function useTopics(params: { domain?: string; platform?: string; page?: number } = {}) {
  const search = new URLSearchParams();
  if (params.domain) search.set("domain", params.domain);
  if (params.platform) search.set("platform", params.platform);
  if (params.page) search.set("page", String(params.page));
  return useQuery({
    queryKey: queryKeys.topics(params),
    queryFn: () => api.get<PaginatedTopics>(`/topics?${search.toString()}`),
  });
}

export function useTopic(id: string) {
  return useQuery({
    queryKey: queryKeys.topic(id),
    queryFn: () => api.get<Topic>(`/topics/${id}`),
    enabled: !!id,
  });
}

export function useDraft(id: string) {
  return useQuery({
    queryKey: queryKeys.draft(id),
    queryFn: () => api.get<Draft>(`/drafts/${id}`),
    enabled: !!id,
  });
}

export function useDraftRender(id: string, platform: RenderPlatform) {
  const search = new URLSearchParams({ platform });
  return useQuery({
    queryKey: queryKeys.draftRender(id, platform),
    queryFn: () => api.get<RenderResult>(`/drafts/${id}/render?${search.toString()}`),
    enabled: !!id,
  });
}

export function useSaveDraft(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (blocks: import("./types").BlockAst) =>
      api.put<Draft>(`/drafts/${id}`, { blocks } as import("./types").DraftPatch),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.draft(id) }),
  });
}

export function useExportDraft(id: string) {
  return useMutation({
    mutationFn: (platform: RenderPlatform) => api.post<ExportResult>(`/drafts/${id}/export`, { platform }),
  });
}

export function useModels() {
  return useQuery({ queryKey: queryKeys.models, queryFn: () => api.get<ModelConfig[]>("/models") });
}

export function useUpdateModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ModelConfigPatch }) =>
      api.put<ModelConfig>(`/models/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.models }),
  });
}

export function useSources() {
  return useQuery({ queryKey: queryKeys.sources, queryFn: () => api.get<SourceConfig[]>("/sources") });
}

export function useToggleSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.put<SourceConfig>(`/sources/${id}`, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.sources }),
  });
}

export function useUsage() {
  return useQuery({ queryKey: queryKeys.usage, queryFn: () => api.get<UsageStat>("/usage") });
}

export function useSettings() {
  return useQuery({ queryKey: queryKeys.settings, queryFn: () => api.get<Settings>("/settings") });
}

export function useSaveSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: SettingsPatch) => api.put<Settings>("/settings", patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.settings }),
  });
}

export type { GenerateRequest };
