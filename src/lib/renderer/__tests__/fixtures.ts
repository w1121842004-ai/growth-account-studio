import type { BlockAst } from '../../block-ast/types';

/**
 * 测试样本（QA 红线测试专用，与 tests/fixtures/sample-ast.ts 相互独立）。
 * 类型严格按 src/lib/block-ast/types.ts 的 BlockAst 联合类型构造，不凭猜想编字段。
 */

/** 覆盖全部 8 种 block 类型的 AST（heading 各 level / paragraph / quote / list / orderedList / code / image / divider）。 */
export const FULL_AST: BlockAst = {
  version: '1.0',
  blocks: [
    { type: 'heading', level: 1, children: [{ text: '每天进步一点点的复盘方法' }] },
    {
      type: 'paragraph',
      children: [
        { text: '很多人做复盘，只是' },
        { text: '记录发生了什么', marks: ['bold'] },
        { text: '，然后就停在这里。' },
      ],
    },
    { type: 'heading', level: 2, children: [{ text: '先看结果，再看动作' }] },
    { type: 'quote', children: [{ text: '复盘不是写日记，是找出下次能改的那一件事。' }] },
    {
      type: 'list',
      items: [
        [{ text: '结果与预期的差距' }],
        [{ text: '差距里', marks: ['italic'] }, { text: '可控的部分' }],
      ],
    },
    { type: 'heading', level: 3, children: [{ text: '一个可以照着做的模板' }] },
    {
      type: 'orderedList',
      items: [[{ text: '写下今天的目标' }], [{ text: '写下实际完成度' }], [{ text: '写下一个调整' }]],
    },
    { type: 'code', lang: 'text', text: '目标：写 800 字\n实际：写了 300 字\n调整：先列提纲' },
    {
      type: 'image',
      src: 'https://mmbiz.qpic.cn/mmbiz_png/example/640',
      alt: '复盘模板示意',
      caption: '模板可以直接抄',
    },
    { type: 'divider' },
    {
      type: 'paragraph',
      children: [{ text: '坚持两周，你会发现变化。' }, { text: 'code_sample', marks: ['code'] }],
    },
  ],
};

/**
 * 代表性文章（个人成长类，标题 + 3 段 + 1 引用 + 1 列表）。
 * 用于「一稿两投不走形」跨平台正文一致性断言与快照锁定。
 * 刻意不含 code 块（微信代码块逐行 <p> 与头条 <pre> 的空白在剥标签后不可直接对齐，属排版差异非内容差异）。
 */
export const ARTICLE_AST: BlockAst = {
  version: '1.0',
  blocks: [
    { type: 'heading', level: 1, children: [{ text: '普通人的复利成长法' }] },
    {
      type: 'paragraph',
      children: [{ text: '成长不是某一天突然开窍，而是把小事重复足够久。' }],
    },
    {
      type: 'paragraph',
      children: [{ text: '我们高估一年能做的事，低估三年能做的事。' }],
    },
    {
      type: 'quote',
      children: [{ text: '时间会奖励那些愿意慢慢变好的人。' }],
    },
    {
      type: 'list',
      items: [
        [{ text: '每天写三行复盘' }],
        [{ text: '每周读一本小书' }],
        [{ text: '每月做一次公开分享' }],
      ],
    },
    {
      type: 'paragraph',
      children: [{ text: '从今天开始，比从明天开始更有意义。' }],
    },
  ],
};
