/** 渲染器快照用固定样本：覆盖全部 8 种 block 类型与 marks 组合。 */
import type { BlockAst } from '../../src/lib/block-ast/types';

export const SAMPLE_AST: BlockAst = {
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
    {
      type: 'quote',
      children: [{ text: '复盘不是写日记，是找出下次能改的那一件事。' }],
    },
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

/** 极短草稿：用于编辑距离门禁测试。 */
export const TINY_AST: BlockAst = {
  version: '1.0',
  blocks: [{ type: 'paragraph', children: [{ text: '原始的一段话，长度大约二十来个字。' }] }],
};
