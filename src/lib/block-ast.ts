/**
 * Block AST（Spec §6）↔ Tiptap/ProseMirror JSON 转换 + 编辑距离计算。
 * 共用后端权威 Block AST；编辑器仅做展示与回写，不自行定义 HTML。
 */
import type { Block, BlockAst, BlockInline, BlockMarks } from "./api/types";

interface TiptapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  text?: string;
  marks?: { type: string }[];
}

function inlineToTiptap(children: BlockInline[] | undefined, fallback: string): TiptapNode[] {
  if (children && children.length > 0) {
    return children.map((c) => {
      const node: TiptapNode = { type: "text", text: c.text };
      const marks: { type: string }[] = [];
      const m: BlockMarks = c.marks ?? {};
      if (m.bold) marks.push({ type: "bold" });
      if (m.italic) marks.push({ type: "italic" });
      if (m.code) marks.push({ type: "code" });
      if (marks.length) node.marks = marks;
      return node;
    });
  }
  return [{ type: "text", text: fallback }];
}

export function blockAstToTiptap(ast: BlockAst): TiptapNode {
  const content: TiptapNode[] = ast.blocks.map((b) => {
    switch (b.type) {
      case "heading":
        return {
          type: "heading",
          attrs: { level: b.level ?? 2 },
          content: inlineToTiptap(b.children, b.text ?? ""),
        };
      case "quote":
        return { type: "blockquote", content: [{ type: "paragraph", content: inlineToTiptap(b.children, b.text ?? "") }] };
      case "list":
        return {
          type: "bulletList",
          content: (b.items ?? [b.text ?? ""]).map((it) => ({
            type: "listItem",
            content: [{ type: "paragraph", content: [{ type: "text", text: it }] }],
          })),
        };
      case "orderedList":
        return {
          type: "orderedList",
          content: (b.items ?? [b.text ?? ""]).map((it) => ({
            type: "listItem",
            content: [{ type: "paragraph", content: [{ type: "text", text: it }] }],
          })),
        };
      case "code":
        return { type: "codeBlock", attrs: { language: b.language ?? null }, content: [{ type: "text", text: b.text ?? "" }] };
      case "image":
        return { type: "image", attrs: { src: b.src ?? "", alt: b.alt ?? "" } };
      case "divider":
        return { type: "horizontalRule" };
      case "paragraph":
      default:
        return { type: "paragraph", content: inlineToTiptap(b.children, b.text ?? "") };
    }
  });
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

function tiptapInlineToBlock(nodes: TiptapNode[] | undefined): BlockInline[] {
  if (!nodes) return [];
  return nodes
    .filter((n) => n.type === "text")
    .map((n) => {
      const marks: BlockMarks = {};
      for (const mk of n.marks ?? []) {
        if (mk.type === "bold") marks.bold = true;
        else if (mk.type === "italic") marks.italic = true;
        else if (mk.type === "code") marks.code = true;
      }
      return { text: n.text ?? "", marks: Object.keys(marks).length ? marks : undefined };
    });
}

export function tiptapToBlockAst(doc: TiptapNode): BlockAst {
  const blocks: Block[] = (doc.content ?? []).map((node): Block => {
    switch (node.type) {
      case "heading":
        return {
          type: "heading",
          level: (node.attrs?.level as number) ?? 2,
          children: tiptapInlineToBlock(node.content),
        };
      case "blockquote":
        return { type: "quote", children: tiptapInlineToBlock(node.content?.[0]?.content) };
      case "bulletList":
        return {
          type: "list",
          items: (node.content ?? []).map((li) => li.content?.[0]?.content?.[0]?.text ?? ""),
        };
      case "orderedList":
        return {
          type: "orderedList",
          items: (node.content ?? []).map((li) => li.content?.[0]?.content?.[0]?.text ?? ""),
        };
      case "codeBlock":
        return { type: "code", language: (node.attrs?.language as string) ?? undefined, text: node.content?.[0]?.text ?? "" };
      case "image":
        return { type: "image", src: (node.attrs?.src as string) ?? "", alt: (node.attrs?.alt as string) ?? "" };
      case "horizontalRule":
        return { type: "divider" };
      default:
        return { type: "paragraph", children: tiptapInlineToBlock(node.content) };
    }
  });
  return { version: "1.0", blocks };
}

/** 提取 Block AST 纯文本（编辑距离与字数统计用）。 */
export function blockAstToPlainText(ast: BlockAst): string {
  return ast.blocks
    .map((b) => {
      if (b.children) return b.children.map((c) => c.text).join("");
      if (b.items) return b.items.join("\n");
      return b.text ?? "";
    })
    .join("\n");
}

/** 字符级编辑距离（Damerau-Levenshtein 简化版），用于「实质编辑」判定（C-7/AC-06）。 */
export function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

/** 实质编辑达标线（AC-06 阈值，相对初始文本字符的改动比例）。 */
export const EDIT_THRESHOLD_RATIO = 0.2;
