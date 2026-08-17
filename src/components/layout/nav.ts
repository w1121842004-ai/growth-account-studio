import { Eye, PenLine, Radar, Settings, type LucideIcon } from "lucide-react";

export interface NavItem {
  href?: string;
  /** 动态 href（如预览需要草稿 id） */
  dynamicHref?: (draftId: string | null) => string;
  label: string;
  icon: LucideIcon;
  /** 需要草稿 id 才可点 */
  requiresDraft?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/topics", label: "选题雷达", icon: Radar },
  { href: "/drafts/new", label: "写作台", icon: PenLine },
  {
    label: "预览",
    icon: Eye,
    requiresDraft: true,
    dynamicHref: (id) => (id ? `/drafts/${id}/preview` : "/topics"),
  },
  { href: "/settings", label: "设置", icon: Settings },
];
