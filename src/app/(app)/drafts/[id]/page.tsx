"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import {
  ArrowLeft,
  Bold,
  Italic,
  List,
  ListChecks,
  Lock,
  PencilLine,
  Save,
  SquarePen,
  StretchHorizontal,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { useDraft } from "@/lib/api/hooks";
import { api, ApiError } from "@/lib/api/client";
import type { BlockAst, BlockInline, Draft } from "@/lib/api/types";

const THRESHOLD = 50;

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function inlineHtml(children?: BlockInline[], text?: string): string {
  const parts = children ?? (text != null ? [{ text }] : []);
  return parts
    .map((p) => {
      let t = esc(p.text);
      if (p.marks?.bold) t = `<strong>${t}</strong>`;
      if (p.marks?.italic) t = `<em>${t}</em>`;
      if (p.marks?.code) t = `<code>${t}</code>`;
      return t;
    })
    .join("");
}

function apiAstToHtml(ast: BlockAst): string {
  return ast.blocks
    .map((b) => {
      switch (b.type) {
        case "heading":
          return `<h${b.level ?? 2}>${inlineHtml(b.children, b.text)}</h${b.level ?? 2}>`;
        case "paragraph":
          return `<p>${inlineHtml(b.children, b.text)}</p>`;
        case "quote":
          return `<blockquote><p>${inlineHtml(b.children, b.text)}</p></blockquote>`;
        case "list":
          return `<ul>${(b.items ?? []).map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
        case "orderedList":
          return `<ol>${(b.items ?? []).map((i) => `<li>${esc(i)}</li>`).join("")}</ol>`;
        case "code":
          return `<pre><code>${esc(b.text ?? "")}</code></pre>`;
        case "image":
          return `<p>［图片：${esc(b.alt ?? "")}］</p>`;
        case "divider":
          return "<hr/>";
        default:
          return "";
      }
    })
    .join("");
}

/** Tiptap/ProseMirror JSON 节点（只声明本页转换用到的字段）。 */
interface TiptapNode {
  type?: string;
  text?: string;
  attrs?: { level?: number; language?: string };
  content?: TiptapNode[];
}

function textOf(node?: TiptapNode | null): string {
  if (!node) return "";
  if (node.type === "text") return node.text ?? "";
  return (node.content ?? []).map(textOf).join("");
}

function tiptapJsonToApiAst(doc?: TiptapNode | null): BlockAst {
  const blocks: BlockAst["blocks"] = [];
  for (const node of doc?.content ?? []) {
    switch (node.type) {
      case "heading":
        blocks.push({ type: "heading", level: node.attrs?.level ?? 2, text: textOf(node) });
        break;
      case "paragraph": {
        const t = textOf(node);
        if (t) blocks.push({ type: "paragraph", text: t });
        break;
      }
      case "blockquote":
        for (const c of node.content ?? []) if (c.type === "paragraph") blocks.push({ type: "quote", text: textOf(c) });
        break;
      case "bulletList":
        blocks.push({ type: "list", items: (node.content ?? []).map((li: TiptapNode) => textOf(li.content?.[0])) });
        break;
      case "orderedList":
        blocks.push({ type: "orderedList", items: (node.content ?? []).map((li: TiptapNode) => textOf(li.content?.[0])) });
        break;
      case "codeBlock":
        blocks.push({ type: "code", language: node.attrs?.language, text: textOf(node) });
        break;
      case "horizontalRule":
        blocks.push({ type: "divider" });
        break;
    }
  }
  return { version: "1.0", blocks };
}

/**
 * 编辑距离（Levenshtein）。
 *
 * 性能背景：本函数在编辑器 onUpdate 里每次按键都会调用，而前后两次文本通常只差
 * 一两个字符、绝大部分内容相同。因此先用"公共前后缀裁剪"把全量比较缩小到变化区，
 * 再对变化区做双行滚动 DP：
 * - 裁剪是精确等价变换（剥掉相同前缀/后缀不影响编辑距离），返回值与朴素全矩阵
 *   实现逐字节一致，不会改变 C-7 人工编辑留痕的阈值语义；
 * - 打字场景裁剪后变化区通常只有 0-2 字符，计算量从 O(m·n) 降到常数级。
 * 不要"简化"回朴素全矩阵实现——3000 字正文每键约 900 万次迭代，编辑器会卡死。
 */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;

  // 公共前缀长度
  let p = 0;
  while (p < m && p < n && a[p] === b[p]) p += 1;
  // 公共后缀长度（注意与前缀不重叠）
  let s = 0;
  while (s < m - p && s < n - p && a[m - 1 - s] === b[n - 1 - s]) s += 1;

  const am = a.slice(p, m - s);
  const bm = b.slice(p, n - s);
  const lm = am.length;
  const ln = bm.length;
  if (!lm) return ln;
  if (!ln) return lm;

  // 双行滚动 DP（内存 O(min(lm,ln))），让较短串当内层维度
  if (lm < ln) return dist(am, bm);
  return dist(bm, am);

  function dist(x: string, y: string): number {
    const k = x.length;
    const l = y.length;
    let prev = new Uint32Array(l + 1);
    let curr = new Uint32Array(l + 1);
    for (let j = 0; j <= l; j += 1) prev[j] = j;
    for (let i = 1; i <= k; i += 1) {
      curr[0] = i;
      for (let j = 1; j <= l; j += 1) {
        const cost = x[i - 1] === y[j - 1] ? 0 : 1;
        curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      }
      [prev, curr] = [curr, prev];
    }
    return prev[l];
  }
}

export default function ReviewEditorPage() {
  const { id } = useParams<{ id: string }>();
  const { data: draft, isLoading, isError, error } = useDraft(id);

  const [editDistance, setEditDistance] = useState(0);
  const editDistanceRef = useRef(0);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [toolbar, setToolbar] = useState<{ top: number; left: number } | null>(null);
  const prevText = useRef("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inited = useRef(false);

  /** 保存当前编辑器内容（自动保存 + 手动保存按钮共用）。 */
  const save = useCallback(
    async (ed: Editor | null) => {
      if (!ed || !id) return;
      setSaveState("saving");
      try {
        const ast = tiptapJsonToApiAst(ed.getJSON());
        await api.put<Draft>(`/drafts/${id}`, { blocks: ast, editDistance: editDistanceRef.current });
        setSaveState("saved");
      } catch (e) {
        setSaveState("error");
        if (e instanceof ApiError) console.error(e.message);
      }
    },
    [id],
  );

  const handleUpdate = useCallback(
    (editor: Editor) => {
      const cur = editor.getText().replace(/\n/g, "");
      const next = editDistanceRef.current + levenshtein(prevText.current, cur);
      editDistanceRef.current = next;
      setEditDistance(next);
      prevText.current = cur;
      setSaveState("idle");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void save(editor), 1200);
    },
    [save],
  );

  const editor = useEditor(
    {
      extensions: [
        StarterKit,
        Placeholder.configure({ placeholder: "在这里继续写，或让 AI 帮你续写、扩写…" }),
      ],
      immediatelyRender: false,
      onUpdate: ({ editor }) => handleUpdate(editor),
      onSelectionUpdate: ({ editor }) => updateToolbar(editor),
    },
    [id],
  );

  function updateToolbar(ed: Editor) {
    const { from, to } = ed.state.selection;
    if (from === to) {
      setToolbar(null);
      return;
    }
    const c = ed.view.coordsAtPos(from);
    setToolbar({ top: c.top - 52, left: c.left });
  }

  useEffect(() => {
    if (editor && draft && !inited.current) {
      const html = apiAstToHtml(draft.blocks);
      editor.commands.setContent(html || "<p></p>");
      prevText.current = editor.getText().replace(/\n/g, "");
      editDistanceRef.current = draft.editDistance ?? 0;
      setEditDistance(draft.editDistance ?? 0);
      inited.current = true;
    }
  }, [editor, draft]);

  const reached = editDistance >= THRESHOLD;
  const aiInsert = (label: string) =>
    editor?.chain().focus().insertContent(`<p>【${label}】在此补充你的真实经历与判断，保留人味。</p>`).run();

  if (isLoading) return <LoadingState label="打开草稿…" />;
  if (isError) return <ErrorState message={(error as Error)?.message || "草稿打开失败"} />;
  if (!draft) return <EmptyState title="没有可编辑的内容" />;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href="/topics" className="text-muted hover:text-fg" aria-label="返回">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="font-serif text-xl font-medium text-fg">审核编辑器</h1>
          <Badge tone={saveState === "saved" ? "success" : "neutral"}>
            {saveState === "saving" ? "保存中…" : saveState === "saved" ? "已自动保存" : "未保存"}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => void save(editor)} disabled={!editor}>
            <Save size={16} /> 保存
          </Button>
          {reached ? (
            <Link href={`/drafts/${id}/preview`}>
              <Button size="sm">
                <PencilLine size={16} /> 去预览 / 导出
              </Button>
            </Link>
          ) : (
            <span title="需先做实质性编辑（保留人味）">
              <Button size="sm" disabled>
                <Lock size={16} /> 去预览 / 导出
              </Button>
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_280px]">
        <div className="relative min-w-0 rounded-lg border border-border bg-surface p-6">
          {toolbar && (
            <div
              className="fixed z-[1200] flex gap-1 rounded-md border border-border bg-surface p-1 shadow-md"
              style={{ top: toolbar.top, left: toolbar.left }}
            >
              <ToolBtn label="加粗" onClick={() => editor?.chain().focus().toggleBold().run()}>
                <Bold size={18} />
              </ToolBtn>
              <ToolBtn label="斜体" onClick={() => editor?.chain().focus().toggleItalic().run()}>
                <Italic size={18} />
              </ToolBtn>
              <ToolBtn label="列表" onClick={() => editor?.chain().focus().toggleBulletList().run()}>
                <List size={18} />
              </ToolBtn>
            </div>
          )}
          <EditorContent editor={editor} />
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>实质编辑进度</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Progress value={editDistance / THRESHOLD} tone={reached ? "success" : "danger"} />
              <p className="text-sm text-muted">
                编辑距离 {editDistance} / 达标线 {THRESHOLD}
              </p>
              {!reached && (
                <p className="text-sm text-warn">再做些实质编辑（改标题、删冗余、加金句）才能导出</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle>AI 辅助</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Button variant="secondary" size="sm" onClick={() => aiInsert("大纲")}>
                <ListChecks size={16} /> 生成大纲
              </Button>
              <Button variant="secondary" size="sm" onClick={() => aiInsert("续写")}>
                <SquarePen size={16} /> 续写
              </Button>
              <Button variant="secondary" size="sm" onClick={() => aiInsert("扩写")}>
                <StretchHorizontal size={16} /> 扩写
              </Button>
              <Button variant="secondary" size="sm" onClick={() => aiInsert("润色")}>
                <Wand2 size={16} /> 润色
              </Button>
              <p className="text-xs text-meta">AI 按钮为前端占位，真实续写由后端接口提供</p>
            </CardContent>
          </Card>

          {draft.editTrails.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>编辑留痕</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1.5">
                {draft.editTrails.slice(0, 6).map((t) => (
                  <p key={t.id} className="text-sm text-muted">
                    · {t.actions.join("，")}（距离 {t.distance}）
                  </p>
                ))}
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}

function ToolBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-9 w-9 items-center justify-center rounded text-fg-2 hover:bg-surface-warm"
    >
      {children}
    </button>
  );
}
