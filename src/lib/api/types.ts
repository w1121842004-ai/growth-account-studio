/**
 * API 类型契约（openapi.yaml 唯一来源，Spec §5 锁定）。
 * 前端据此写 fetch 客户端与 TanStack Query hook，禁止与后端类型漂移。
 */

export type Platform = "toutiao" | "baidu" | "zhihu" | "bilibili";
export type RenderPlatform = "wechat" | "toutiao";
export type DraftStatus = "draft" | "exported";
export type TonePreset = "温暖" | "克制" | "犀利";
export type LengthPreset = "短" | "中" | "长";
export type LayoutTemplate = "minimal" | "book" | "columns";

/** 统一响应包络 {code, data, message} */
export interface ApiEnvelope<T> {
  code: number;
  data: T | null;
  message: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: User;
}

/** 选题（Spec §6 topics 表） */
export interface Topic {
  id: string;
  platform: Platform;
  sourceItemKey: string;
  bucketDate: string;
  title: string;
  heat: number;
  relevance: number;
  competition: number;
  score: number;
  domain: string;
  adopted: boolean;
  duplicateWarning: boolean | null;
}

export type PaginatedTopics = Paginated<Topic>;

/** Block AST（Spec §6，无 CSS） */
export type BlockType =
  | "paragraph"
  | "heading"
  | "quote"
  | "list"
  | "orderedList"
  | "code"
  | "image"
  | "divider";

export interface BlockMarks {
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
}

export interface Block {
  type: BlockType;
  level?: number;
  text?: string;
  /** 行内子节点（标题/段落/引用等可含 marks） */
  children?: BlockInline[];
  /** list/orderedList 的条目 */
  items?: string[];
  /** image 的 src/alt */
  src?: string;
  alt?: string;
  /** code 的语言 */
  language?: string;
}

export interface BlockInline {
  text: string;
  marks?: BlockMarks;
}

export interface BlockAst {
  version: string;
  blocks: Block[];
}

export interface EditTrail {
  id: string;
  draftId: string;
  distance: number;
  actions: string[];
  createdAt: string;
}

export interface Draft {
  id: string;
  userId: string;
  topicId: string | null;
  blocks: BlockAst;
  status: DraftStatus;
  editDistance: number;
  createdAt: string;
  editTrails: EditTrail[];
}

export interface DraftPatch {
  blocks: BlockAst;
}

export interface GenerationUsage {
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costCents: number;
  latencyMs: number;
  cacheHit: boolean;
}

export interface RenderResult {
  platform: RenderPlatform;
  html: string;
  disclosureInjected: boolean;
}

export interface ExportResult {
  platform: RenderPlatform;
  html: string;
  text: string;
  checklist: string[];
}

export interface ModelConfig {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  role: "primary" | "fallback";
  enabled: boolean;
}

export interface ModelConfigPatch {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  role?: "primary" | "fallback";
  enabled?: boolean;
}

export interface SourceConfig {
  id: string;
  name: string;
  endpoint: string;
  enabled: boolean;
  lastFetch: string | null;
  robotsNote: string;
}

export interface UsageStat {
  tokensIn: number;
  tokensOut: number;
  costCents: number;
  exportCount: number;
  byModel: { model: string; tokensIn: number; tokensOut: number; costCents: number }[];
}

export interface Settings {
  profile: string;
  tone: string;
  layout: LayoutTemplate;
}

export interface SettingsPatch {
  profile?: string;
  tone?: string;
  layout?: LayoutTemplate;
}

export interface GenerateRequest {
  topicId: string;
  tone?: string;
  length?: LengthPreset;
}

/** SSE 事件负载（openapi SSEEvent） */
export type SSEEvent =
  | { type: "block"; payload: Block; id?: string }
  | { type: "done"; payload: { draftId: string; usage: GenerationUsage }; id?: string }
  | { type: "error"; payload: { message: string }; id?: string };
