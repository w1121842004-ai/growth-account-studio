import { defineConfig } from 'vitest/config';

/**
 * Vitest 配置（QA 红线测试套件，task #11）。
 * - environment: node —— 被测模块全是纯函数 + Node 侧逻辑（renderer / block-ast / collection / breaker），不需要 jsdom。
 * - include 只收 src 目录下的 .test.ts（写路径时注意不要出现未转义的 "* /" 序列，会截断注释导致 esbuild 解析失败）。
 * - 根目录 tests/ 下的 node:test 套件用 `npm run test:node` 跑，两套并存互不干扰。
 * - 被测模块只用相对 import，不依赖 @/ 别名，故无需 vite-tsconfig-paths。
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules/**', '.next/**', 'tests/**'],
    reporters: ['default'],
  },
});
