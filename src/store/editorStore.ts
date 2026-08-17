/**
 * 编辑器本地态（Zustand，Spec §4：编辑器本地态与服务端态分离）。
 * 负责：当前草稿 id、生成中的块累积、AI 建议卡、实时编辑距离与达标态。
 * 服务端草稿走 TanStack Query（api/hooks），不在此重复持有。
 */
import { create } from "zustand";
import type { Block } from "@/lib/api/types";

export interface AiSuggestion {
  id: string;
  blockIndex: number;
  text: string;
  status: "pending" | "adopted" | "edited" | "discarded";
}

interface EditorState {
  currentDraftId: string | null;
  generating: boolean;
  generatedBlocks: Block[];
  suggestions: AiSuggestion[];
  setCurrentDraftId: (id: string | null) => void;
  startGenerating: () => void;
  appendBlock: (b: Block) => void;
  finishGenerating: () => void;
  addSuggestion: (s: AiSuggestion) => void;
  resolveSuggestion: (id: string, status: AiSuggestion["status"]) => void;
  reset: () => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  currentDraftId: null,
  generating: false,
  generatedBlocks: [],
  suggestions: [],
  setCurrentDraftId: (id) => set({ currentDraftId: id }),
  startGenerating: () => set({ generating: true, generatedBlocks: [], suggestions: [] }),
  appendBlock: (b) => set((s) => ({ generatedBlocks: [...s.generatedBlocks, b] })),
  finishGenerating: () => set({ generating: false }),
  addSuggestion: (s) => set((st) => ({ suggestions: [...st.suggestions, s] })),
  resolveSuggestion: (id, status) =>
    set((s) => ({ suggestions: s.suggestions.map((x) => (x.id === id ? { ...x, status } : x)) })),
  reset: () => set({ currentDraftId: null, generating: false, generatedBlocks: [], suggestions: [] }),
}));
