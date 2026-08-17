# 采集 Worker 实现要点（Spec AC-02 / C-4 / ADR-005 / ADR-008）

## 进程模型
- 独立 Node 进程（Docker Compose 第二 service，与 Next.js 同容器或相邻容器），不阻塞 API。
- 入口仅装配（C-9）：`worker.ts` 注册 cron → 调 `collectAll()`；业务逻辑在 `lib/collect/*`。

## 调度（node-cron 最新稳定）
- 单 cron：`0 */1 * * *` 占位，实际采集节流由 `MIN_INTERVAL_MS = 30*60*1000` 守护（避免误配高频）。
- **单并发**：全局 `isRunning` 互斥；上轮未结束则跳过本轮（不叠加）。
- **间隔 ≥30min**：每次源采集前校验 `now - lastFetch >= MIN_INTERVAL_MS`。
- **指数退避**：失败 `delay = base*2^retry`（base=60s，cap=30min），达 cap 后告警并重置。

## 白名单常量（硬编码 + 单测，C-4）
```ts
// lib/collect/sources.ts —— 单一来源，改此须走变更流程 + 补单测
export interface SourceDef {
  key: 'toutiao_hot_event' | 'baidu_rs' | 'zhihu_hot' | 'bilibili_hot';
  label: string;
  endpoint: string;          // 仅聚合/热榜路径
  robotsAllowed: boolean;    // 实测结论
  defaultEnabled: boolean;
  robotsNote: string;
}
export const ALLOWED_SOURCES: SourceDef[] = [
  { key:'toutiao_hot_event', label:'头条热榜', endpoint:'https://www.toutiao.com/hot-event/', robotsAllowed:true,  defaultEnabled:true,  robotsNote:'仅 hot-event 聚合路径；/trending//item//group//search 在 robots Disallow（禁采）' },
  { key:'baidu_rs',          label:'百度热搜', endpoint:'https://top.baidu.com/board?tab=realtime', robotsAllowed:true, defaultEnabled:true, robotsNote:'robots 返回 404，无明确禁止' },
  { key:'zhihu_hot',         label:'知乎热榜', endpoint:'https://www.zhihu.com/hot', robotsAllowed:false, defaultEnabled:false, robotsNote:'Phase1 未核验 robots，启用前必验' },
  { key:'bilibili_hot',       label:'B站热门', endpoint:'https://www.bilibili.com/v/popular/rank/all', robotsAllowed:false, defaultEnabled:false, robotsNote:'Phase1 未核验 robots，启用前必验' },
];
// 永久禁采
export const BLOCKED_SOURCES = ['weibo']; // 开发者协议禁采（R-3）
```

## 采集行为约束
- 仅抓取**标题 / 热度 / 榜位**元数据；**绝不抓取文章正文**（R-3/B-3，AC-09）。
- 落库前按 `platform + source_item_key + bucket_date` 去重（topics 唯一索引，幂等）。
- `source_item_key` = 平台条目稳定 ID 或榜位（同日同榜位即同键）。
- 遵守 robots + 合理 UA + 限速；失败指数退避。

## 单元测试清单（必过，C-10 门禁）
1. `ALLOWED_SOURCES` 不含 weibo，且 BLOCKED_SOURCES 含 weibo。
2. toutiao 仅允许 hot-event 路径，构造 `/trending/...` 请求应被拦截（不发起）。
3. 单并发：并发触发两次 `collectAll()`，仅一次实际执行（isRunning 互斥）。
4. 间隔：连续两次采集间隔 <30min 时第二次被跳过（lastFetch 守卫）。
5. 指数退避：模拟连续失败，delay 依次 60s→120s→…→cap 30min 且不再指数爆炸。
6. 仅存元数据：mock 响应含正文，断言落库 topics 不含正文文本字段。
7. 幂等：同一 (platform,key,date) 采集两次，topics 仅 1 行。
8. robots 守卫：zhihu/bilibili defaultEnabled=false，启用前 `robotsAllowed=false` 断言拦截。
9. 频率限制：单源单次请求数 ≤1（不循环轰炸）。
