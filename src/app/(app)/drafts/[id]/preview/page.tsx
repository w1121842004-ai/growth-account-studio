"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, Copy, Download, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState } from "@/components/common/states";
import { useDraft, useDraftRender } from "@/lib/api/hooks";
import { api } from "@/lib/api/client";
import { renderBoth, renderText, AI_DISCLOSURE_TEXT } from "@/lib/renderer";
import type { BlockAst as ApiAst, BlockInline, ExportResult } from "@/lib/api/types";
import type { BlockAst as RendererAst, Block as RendererBlock, Inline } from "@/lib/block-ast/types";

function toInline(text: string, marks?: { bold?: boolean; italic?: boolean; code?: boolean }): Inline {
  const m: Inline["marks"] = [];
  if (marks?.bold) m.push("bold");
  if (marks?.italic) m.push("italic");
  if (marks?.code) m.push("code");
  return { text, marks: m.length ? m : undefined };
}

function convApiToRenderer(ast: ApiAst): RendererAst {
  const fromChildren = (children?: BlockInline[], text?: string): Inline[] =>
    children && children.length ? children.map((c) => toInline(c.text, c.marks)) : [toInline(text ?? "")];
  const blocks: RendererBlock[] = ast.blocks.map((b): RendererBlock => {
    switch (b.type) {
      case "heading":
        return { type: "heading", level: (b.level ?? 2) as 1 | 2 | 3, children: fromChildren(b.children, b.text) };
      case "paragraph":
        return { type: "paragraph", children: fromChildren(b.children, b.text) };
      case "quote":
        return { type: "quote", children: fromChildren(b.children, b.text) };
      case "list":
        return { type: "list", items: (b.items ?? []).map((t) => [toInline(t)]) };
      case "orderedList":
        return { type: "orderedList", items: (b.items ?? []).map((t) => [toInline(t)]) };
      case "code":
        return { type: "code", lang: b.language, text: b.text ?? "" };
      case "image":
        return { type: "image", src: b.src ?? "", alt: b.alt ?? "", caption: b.alt };
      case "divider":
        return { type: "divider" };
      default:
        return { type: "paragraph", children: [toInline(b.text ?? "")] };
    }
  });
  return { version: "1.0", blocks };
}

const CAP_ROWS: { cap: string; wechat: string; toutiao: string }[] = [
  { cap: "颜色 / 背景 / 圆角 / 边框", wechat: "支持", toutiao: "剥离（不支持）" },
  { cap: "标题层级", wechat: "内联字号 / 字重 / 颜色", toutiao: "◆ ○ 符号" },
  { cap: "图片", wechat: "仅封面（素材库）", toutiao: "无" },
  { cap: "inline style", wechat: "全支持", toutiao: "全剥离" },
  { cap: "emoji", wechat: "不限", toutiao: "≤2 种且不连续" },
];

export default function PreviewPage() {
  const { id } = useParams<{ id: string }>();
  const { data: draft } = useDraft(id);
  const wechatQ = useDraftRender(id, "wechat");
  const toutiaoQ = useDraftRender(id, "toutiao");

  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyErr, setCopyErr] = useState<string | null>(null);

  const fallback = useMemo(() => {
    if (!draft?.blocks) return null;
    try {
      return renderBoth(convApiToRenderer(draft.blocks));
    } catch {
      return null;
    }
  }, [draft]);

  const wechatHtml = wechatQ.data?.html ?? fallback?.wechat ?? "";
  const toutiaoHtml = toutiaoQ.data?.html ?? fallback?.toutiao ?? "";

  const copyBoth = async () => {
    setCopying(true);
    setCopyErr(null);
    try {
      let wxHtml = wechatHtml;
      let ttHtml = toutiaoHtml;
      let wxText = "";
      let ttText = "";
      try {
        const wx = await api.post<ExportResult>(`/drafts/${id}/export`, { platform: "wechat" });
        wxHtml = wx.html;
        wxText = wx.text;
      } catch {
        /* 用前端兜底 */
      }
      try {
        const tt = await api.post<ExportResult>(`/drafts/${id}/export`, { platform: "toutiao" });
        ttHtml = tt.html;
        ttText = tt.text;
      } catch {
        /* 用前端兜底 */
      }
      if (!wxText && draft?.blocks) wxText = renderText(convApiToRenderer(draft.blocks));
      if (!ttText && draft?.blocks) ttText = renderText(convApiToRenderer(draft.blocks));
      const htmlBlob = new Blob([`${wxHtml}\n<hr/>\n${ttHtml}`], { type: "text/html" });
      const textBlob = new Blob([`${wxText}\n\n${ttText}`], { type: "text/plain" });
      await navigator.clipboard.write([new ClipboardItem({ "text/html": htmlBlob, "text/plain": textBlob })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyErr("复制失败，请检查浏览器剪贴板权限");
    } finally {
      setCopying(false);
    }
  };

  const loading = wechatQ.isLoading || toutiaoQ.isLoading;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={`/drafts/${id}`} className="text-muted hover:text-fg" aria-label="返回编辑器">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="font-serif text-xl font-medium text-fg">双平台预览导出</h1>
          <Badge tone="accent">两版内容一致，仅适配项不同</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={copyBoth} disabled={copying || !wechatHtml}>
            {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? "已复制两版" : "一键复制两版"}
          </Button>
          <Button size="sm" disabled title="导出由人工在平台后台完成">
            <Download size={16} /> 导出
          </Button>
        </div>
      </div>

      {copyErr && <p className="text-sm text-danger">{copyErr}</p>}

      {loading ? (
        <LoadingState label="渲染双平台预览…" />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <PhoneFrame title="微信公众号" accent>
            <div dangerouslySetInnerHTML={{ __html: wechatHtml || "<p>暂无内容</p>" }} />
          </PhoneFrame>
          <PhoneFrame title="今日头条">
            <article className="prose-quiet" dangerouslySetInnerHTML={{ __html: toutiaoHtml || "<p>暂无内容</p>" }} />
          </PhoneFrame>
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>发布前清单（合规）</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <CheckRow label="已在头条勾选「AI 生成 / 辅助创作」声明（平台侧法定义务）" />
          <CheckRow label="公众号已保留「本文含 AI 辅助创作」标识，未删除页脚" />
          <CheckRow label="正文已由真人审核并实质编辑，发布行为由你手动完成" />
          <p className="mt-1 text-xs text-meta">两版均含标识：{AI_DISCLOSURE_TEXT}（不可关闭）</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>双平台能力差异</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted">
                  <th className="py-2 pr-4 font-medium">能力</th>
                  <th className="py-2 pr-4 font-medium">微信视图</th>
                  <th className="py-2 font-medium">头条视图</th>
                </tr>
              </thead>
              <tbody>
                {CAP_ROWS.map((r) => (
                  <tr key={r.cap} className="border-b border-border-soft">
                    <td className="py-2 pr-4 text-fg-2">{r.cap}</td>
                    <td className="py-2 pr-4 text-fg">{r.wechat}</td>
                    <td className="py-2 text-fg">{r.toutiao}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PhoneFrame({ title, accent, children }: { title: string; accent?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <div className="mb-2 flex items-center gap-2 text-sm text-fg-2">
        <Smartphone size={16} aria-hidden /> {title}
      </div>
      <div className="mx-auto w-full max-w-[340px] overflow-hidden rounded-[24px] border border-border bg-surface shadow-md">
        {accent && (
          <div
            className="px-4 py-2 text-xs text-accent"
            style={{ background: "var(--ai-line)" }}
          >
            {AI_DISCLOSURE_TEXT}
          </div>
        )}
        <div className="max-h-[560px] overflow-y-auto px-4 py-4 text-fg">{children}</div>
      </div>
    </div>
  );
}

function CheckRow({ label }: { label: string }) {
  const [done, setDone] = useState(false);
  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm text-fg-2">
      <input type="checkbox" checked={done} onChange={(e) => setDone(e.target.checked)} className="mt-1 accent-accent" />
      <span className={done ? "text-fg" : undefined}>{label}</span>
    </label>
  );
}
