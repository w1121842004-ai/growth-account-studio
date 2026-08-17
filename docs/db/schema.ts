/**
 * Drizzle ORM schema — 成长号工坊 MVP（Spec §6，锁定 7 张表）。
 * 版本锚定（Spec §4）：Drizzle 最新稳定 / PostgreSQL 17。
 * 生成迁移：drizzle-kit generate（本文件为唯一来源）。
 *
 * 注意：
 * - Block AST 存 JSONB，类型来自 ../schemas/block-ast.types。
 * - topics 唯一索引 (platform, source_item_key, bucket_date) 保证采集幂等（AC-02）。
 * - 真人留痕由 edit_trails 承载（C-7/AC-06），无独立 review_logs 表。
 * - AI 标识为渲染期注入（C-5），不落库。
 */
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  date,
  integer,
  numeric,
  boolean,
  jsonb,
  index,
  uniqueIndex,
  relations,
} from 'drizzle-orm/pg-core';
import type { BlockAst, EditAction } from '../schemas/block-ast.types';

// ---------------------------------------------------------------------------
// users：运营者账户（MVP 单用户本地账号，JWT，Spec §4）
// ---------------------------------------------------------------------------
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// topics：选题（热度×相关度×竞争度 评分；竞争度不爬正文，AC-09）
// ---------------------------------------------------------------------------
export const platformEnum = pgEnum('platform', ['toutiao', 'baidu', 'zhihu', 'bilibili']);

export const topics = pgTable(
  'topics',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    platform: platformEnum('platform').notNull(),
    sourceItemKey: text('source_item_key').notNull(),
    bucketDate: date('bucket_date').notNull(),
    title: text('title').notNull(),
    heat: integer('heat').notNull().default(0),
    relevance: numeric('relevance', { precision: 6, scale: 4 }).notNull().default('0'),
    competition: numeric('competition', { precision: 6, scale: 4 }).notNull().default('0'),
    score: numeric('score', { precision: 6, scale: 4 }).notNull().default('0'),
    domain: text('domain').notNull().default('个人成长'),
    adopted: boolean('adopted').notNull().default(false),
  },
  (t) => ({
    // 采集幂等：同平台同来源键同日只存一条（AC-02）
    uniqSource: uniqueIndex('topics_uniq_source').on(t.platform, t.sourceItemKey, t.bucketDate),
    scoreIdx: index('idx_topics_score').on(t.score),
  }),
);

// ---------------------------------------------------------------------------
// drafts：草稿（Block AST 存 JSONB）
// ---------------------------------------------------------------------------
export const draftStatusEnum = pgEnum('draft_status', ['draft', 'exported']);

export const drafts = pgTable(
  'drafts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    topicId: uuid('topic_id').references(() => topics.id, { onDelete: 'set null' }),
    blocks: jsonb('blocks').notNull().$type<BlockAst>(),
    status: draftStatusEnum('status').notNull().default('draft'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userStatusIdx: index('idx_drafts_user_status').on(t.userId, t.status),
  }),
);

// ---------------------------------------------------------------------------
// edit_trails：人工编辑留痕（C-7/AC-06，编辑距离低于阈值禁止导出）
// ---------------------------------------------------------------------------
export const editTrails = pgTable(
  'edit_trails',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    draftId: uuid('draft_id').notNull().references(() => drafts.id, { onDelete: 'cascade' }),
    distance: integer('distance').notNull().default(0),
    actions: jsonb('actions').notNull().$type<EditAction[]>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    draftIdx: index('idx_edit_trails_draft').on(t.draftId),
  }),
);

// ---------------------------------------------------------------------------
// model_configs：模型适配层配置（热切换不改代码，ADR-004）
// ---------------------------------------------------------------------------
export const modelRoleEnum = pgEnum('model_role', ['primary', 'fallback']);

export const modelConfigs = pgTable(
  'model_configs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    baseUrl: text('base_url').notNull(),
    apiKey: text('api_key').notNull(), // 应用层加密后存储
    model: text('model').notNull(),
    role: modelRoleEnum('role').notNull().default('fallback'),
    enabled: boolean('enabled').notNull().default(true),
  },
  (t) => ({
    roleIdx: index('idx_model_role').on(t.role),
  }),
);

// ---------------------------------------------------------------------------
// source_configs：采集源配置（白名单启停，AC-02/C-4）
// ---------------------------------------------------------------------------
export const sourceConfigs = pgTable(
  'source_configs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    endpoint: text('endpoint').notNull(),
    enabled: boolean('enabled').notNull().default(false),
    lastFetch: timestamp('last_fetch', { withTimezone: true }),
  },
  (t) => ({
    enabledIdx: index('idx_source_enabled').on(t.enabled),
  }),
);

// ---------------------------------------------------------------------------
// usages：用量统计（token/成本，Spec §5 /usage）
// ---------------------------------------------------------------------------
export const usages = pgTable(
  'usages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    model: text('model').notNull(),
    tokensIn: integer('tokens_in').notNull().default(0),
    tokensOut: integer('tokens_out').notNull().default(0),
    cost: numeric('cost', { precision: 10, scale: 4 }).notNull().default('0'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('idx_usages_user_created').on(t.userId, t.createdAt),
  }),
);

// ---------------------------------------------------------------------------
// 关系（供 Drizzle 联表查询）
// ---------------------------------------------------------------------------
export const usersRelations = relations(users, ({ many }) => ({
  drafts: many(drafts),
  usages: many(usages),
}));

export const topicsRelations = relations(topics, ({ many }) => ({
  drafts: many(drafts),
}));

export const draftsRelations = relations(drafts, ({ one, many }) => ({
  user: one(users, { fields: [drafts.userId], references: [users.id] }),
  topic: one(topics, { fields: [drafts.topicId], references: [topics.id] }),
  trails: many(editTrails),
}));

export const editTrailsRelations = relations(editTrails, ({ one }) => ({
  draft: one(drafts, { fields: [editTrails.draftId], references: [drafts.id] }),
}));

export const usagesRelations = relations(usages, ({ one }) => ({
  user: one(users, { fields: [usages.userId], references: [users.id] }),
}));
