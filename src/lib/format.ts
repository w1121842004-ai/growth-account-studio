/** 展示格式化（选题热度/竞争度）。禁止出现在组件里写魔法数字。 */

export function formatHeat(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return String(n);
}

export function competitionLabel(c: number): { text: string; tone: "success" | "warn" | "danger" } {
  if (c < 0.4) return { text: "低", tone: "success" };
  if (c < 0.7) return { text: "中", tone: "warn" };
  return { text: "高", tone: "danger" };
}

export function platformLabel(p: string): string {
  switch (p) {
    case "toutiao": return "头条";
    case "baidu": return "百度";
    case "zhihu": return "知乎";
    case "bilibili": return "B站";
    default: return p;
  }
}
