/**
 * 成本换算（单位：人民币「分」；usages.cost 与 openapi costCents 同口径）。
 *
 * 唯一有据单价（impl/model-adapter.md）：混元 Hy3 输入 1 元 / 输出 4 元 每百万 token，
 * 命中 Prompt Cache 的输入按 0.25 计。其他模型厂商单价未在 Spec 给定，
 * 一律按 Hy3 同价保守估算（宁高估不低估），真实账单以厂商为准。
 */
export interface Price {
  /** 输入：分 / 百万 token */
  inCentsPerMTok: number;
  /** 输出：分 / 百万 token */
  outCentsPerMTok: number;
  /** 缓存命中输入的折扣系数 */
  cacheFactor: number;
}

const HY3: Price = { inCentsPerMTok: 100, outCentsPerMTok: 400, cacheFactor: 0.25 };
const LITE: Price = { inCentsPerMTok: 10, outCentsPerMTok: 40, cacheFactor: 0.25 };

const TABLE: { match: RegExp; price: Price }[] = [
  { match: /lite|a13b/i, price: LITE },
  { match: /hy3|hunyuan/i, price: HY3 },
];

export function priceOf(model: string): Price {
  return TABLE.find((row) => row.match.test(model))?.price ?? HY3;
}

export interface TokenCount {
  tokensIn: number;
  tokensOut: number;
  cachedIn: number;
}

/** 计算成本（分，保留 4 位小数由上层 numeric 承载）。 */
export function costCents(model: string, t: TokenCount): number {
  const p = priceOf(model);
  const fresh = Math.max(0, t.tokensIn - t.cachedIn);
  const cents =
    (fresh * p.inCentsPerMTok) / 1_000_000 +
    (t.cachedIn * p.inCentsPerMTok * p.cacheFactor) / 1_000_000 +
    (t.tokensOut * p.outCentsPerMTok) / 1_000_000;
  return Math.round(cents * 10_000) / 10_000;
}
