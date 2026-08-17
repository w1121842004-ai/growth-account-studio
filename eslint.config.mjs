/**
 * ESLint flat config。
 *
 * 说明：eslint-config-next 16.x 已原生导出 flat config 数组，直接 import 即可。
 * 不要再用 @eslint/eslintrc 的 FlatCompat 去 extends("next/core-web-vitals")——
 * 该兼容层在 ESLint 9 下会因 plugins.react 自引用触发
 * "Converting circular structure to JSON" 而整体崩溃。
 *
 * ignores 只允许放构建产物与非源码目录。业务源码（src/**）一律纳入检查，
 * 不得为了让 lint 通过而屏蔽实现目录。
 */
import coreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'drizzle/**',
      'docs/**',
      'design-system/**',
      'next-env.d.ts',
    ],
  },
  ...coreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // 服务端 worker / 适配层需要 console 做可观测性输出（ADR-004 熔断告警）
      'no-console': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
];

export default config;
