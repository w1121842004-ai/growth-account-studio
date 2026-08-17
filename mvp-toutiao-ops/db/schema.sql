-- ============================================================================
-- 头条号+公众号运营工具 · 数据库 Schema (PostgreSQL 17)
-- 通过 Drizzle ORM (drizzle-orm 0.38.x) 管理迁移；此处提供等价 DDL 作为契约基线。
-- 所有时间字段使用 timestamptz；主键用 uuid v7（有序，避免随机 IO）。
-- ============================================================================

-- 扩展
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid / uuid 生成
CREATE EXTENSION IF NOT EXISTS "pg_trgm";     -- 中文模糊检索（ILIKE 加速，可选）

-- ---------------------------------------------------------------------------
-- users：运营者账户（MVP 单账号，表结构预留多账号）
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email        text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  name         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);

-- ---------------------------------------------------------------------------
-- hotlist_entries：热榜快照（仅 toutiao / baidu 自动采集；weibo 仅人工导入）
-- 采集由 node-cron 触发，幂等：同 source + title + 日期 只保留一条。
-- ---------------------------------------------------------------------------
CREATE TYPE hotlist_source AS ENUM ('toutiao', 'baidu', 'weibo_import');

CREATE TABLE hotlist_entries (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source       hotlist_source NOT NULL,
  title        text NOT NULL,
  url          text,
  rank         integer NOT NULL,
  heat         bigint,
  raw          jsonb,                       -- 平台原始字段，备审计
  captured_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, title, (captured_at::date))
);

CREATE INDEX idx_hotlist_source_captured ON hotlist_entries (source, captured_at DESC);
CREATE INDEX idx_hotlist_title_trgm ON hotlist_entries USING gin (title gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- topics：选题候选（热度×相关度×竞争度 评分）
-- total_score = 0.45·heat_score + 0.40·relevance_score − 0.15·competition_score
-- competition_score 来自元数据估算，不爬正文（B-3 合规约束）
-- ---------------------------------------------------------------------------
CREATE TYPE topic_status AS ENUM ('candidate', 'approved', 'rejected');

CREATE TABLE topics (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotlist_entry_id  uuid REFERENCES hotlist_entries(id) ON DELETE SET NULL,
  title             text NOT NULL,
  heat_score        numeric(6,4) NOT NULL DEFAULT 0,
  relevance_score   numeric(6,4) NOT NULL DEFAULT 0,
  competition_score numeric(6,4) NOT NULL DEFAULT 0,
  total_score       numeric(6,4) NOT NULL DEFAULT 0,
  rationale         jsonb,                 -- { heat, relevance, competition } 构成说明
  status            topic_status NOT NULL DEFAULT 'candidate',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);

CREATE INDEX idx_topics_score ON topics (total_score DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_topics_status ON topics (status) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- articles：草稿（Block AST 存 JSONB；双平台 HTML 由渲染器产出后缓存）
-- ---------------------------------------------------------------------------
CREATE TYPE article_status AS ENUM ('draft', 'in_review', 'approved', 'exported');

CREATE TABLE articles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id        uuid REFERENCES topics(id) ON DELETE SET NULL,
  title           text,
  block_ast       jsonb NOT NULL,          -- 见 schemas/block-ast.schema.json
  wechat_html     text,                    -- 渲染缓存（全内联 style）
  toutiao_html    text,                    -- 渲染缓存（零 CSS）
  status          article_status NOT NULL DEFAULT 'draft',
  ai_disclosure   boolean NOT NULL DEFAULT true,  -- 导出强制 true，不可关闭
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

CREATE INDEX idx_articles_status_created ON articles (status, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_articles_topic ON articles (topic_id) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- review_logs：真人审核留痕（合规 C-7，微信「非真人自动化」红线）
-- ---------------------------------------------------------------------------
CREATE TYPE review_action AS ENUM ('submit', 'approve', 'reject');

CREATE TABLE review_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id  uuid NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  action      review_action NOT NULL,
  editor_name text NOT NULL,               -- 真人署名，不可为空
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_review_article ON review_logs (article_id, created_at);

-- ---------------------------------------------------------------------------
-- llm_configs：适配层 Provider 配置（可热切换，加密存储 key）
-- ---------------------------------------------------------------------------
CREATE TABLE llm_configs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider      text NOT NULL,            -- hunyuan | zhipu | qwen
  model         text NOT NULL,            -- hunyuan-hy3 / glm-4.6 / qwen-plus / hunyuan-a13b
  api_key_enc   text NOT NULL,            -- 应用层加密后存储
  base_url      text NOT NULL,            -- OpenAI 兼容端点
  is_active     boolean NOT NULL DEFAULT true,
  priority      integer NOT NULL DEFAULT 0,  -- 0=主力，>0 备选
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- generation_logs：生成调用审计（成本/速率归因）
-- ---------------------------------------------------------------------------
CREATE TABLE generation_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id  uuid REFERENCES articles(id) ON DELETE SET NULL,
  provider    text NOT NULL,
  model       text NOT NULL,
  tokens_in   integer NOT NULL DEFAULT 0,
  tokens_out  integer NOT NULL DEFAULT 0,
  cost_cents  numeric(10,4) NOT NULL DEFAULT 0,
  latency_ms  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_gen_article ON generation_logs (article_id);

-- ---------------------------------------------------------------------------
-- feature_flags：灰度发布（轻量实现，无需第三方服务）
-- ---------------------------------------------------------------------------
CREATE TABLE feature_flags (
  key          text PRIMARY KEY,
  enabled      boolean NOT NULL DEFAULT false,
  rollout      jsonb NOT NULL DEFAULT '{}'::jsonb,  -- { user_ids:[], percentage:5 }
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 视图：选题看板（含热榜来源标题，便于运营者浏览）
-- ---------------------------------------------------------------------------
CREATE VIEW topic_board AS
  SELECT t.id, t.title, t.total_score, t.status,
         h.source AS hot_source, h.title AS hot_title, h.heat AS hot_heat
  FROM topics t
  LEFT JOIN hotlist_entries h ON h.id = t.hotlist_entry_id
  WHERE t.deleted_at IS NULL;
