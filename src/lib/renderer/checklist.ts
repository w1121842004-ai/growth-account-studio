/**
 * 导出前发布清单（Spec C-6/ADR-003）。
 * 平台侧标识必须由真人在平台后台勾选，系统只能提示——这是合规链条的最后一环。
 * 文案为纯文字，不含 emoji（P0 规则）。
 */
import type { RenderPlatform } from './index';

const COMMON: string[] = [
  '正文已自动包含「本文含 AI 辅助创作」标识，粘贴后请确认标识未被编辑器清除',
  '本次内容由真人审核并实质编辑，发布行为由你手动完成（系统不提供自动发布）',
  '引用他人内容不超过全文 30% 并已注明来源',
];

const WECHAT: string[] = [
  '在公众号编辑器粘贴后检查：段落间距、引用块、代码块换行是否保形',
  '正文图片仅支持微信素材库地址，封面与插图请在后台人工上传',
  '公众号侧保留 AI 辅助创作说明，不要删除页脚标识',
];

const TOUTIAO: string[] = [
  '在头条发文页勾选「AI 生成/辅助创作」声明（平台侧标识，法定义务）',
  '粘贴后检查：层级符号（【】◆ ○ ▶）是否完整，编辑器不应带入任何底色或字号差异',
  '标题与正文相似度过高的历史选题请先改角度，避免原创度预警',
];

export function publishChecklist(platform: RenderPlatform): string[] {
  return [...(platform === 'wechat' ? WECHAT : TOUTIAO), ...COMMON];
}
