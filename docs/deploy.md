# 部署指南：Lighthouse + Docker Compose + Caddy

> Spec ADR-001 锁定方案：腾讯云 Lighthouse（固定出口 IP）+ Docker Compose + Caddy（自动 HTTPS）。
> 固定出口 IP 满足微信/头条 API 白名单（R-9），国内访问质量优于境外 VPS。

---

## 0. 部署拓扑

```
用户浏览器
   │ 443
   ▼
Caddy (80/443, 自动 HTTPS, 反代)
   │
   ▼
web (Next.js 16 生产模式 :3000)  ──┐
   │                                ├─ compose 内网
worker (node-cron 定时采集) ────────┤
   │                                │
   ▼                                ▼
db (PostgreSQL 17, 数据卷持久化)
```

---

## 1. 前置准备

| 项 | 说明 |
|---|---|
| 腾讯云 Lighthouse 实例 | 2C4G 起（Next 构建需 ≥2G 内存），系统 Ubuntu/Debian，地域选离读者近的 |
| 域名（可选但推荐） | 解析 A 记录到服务器公网 IP；无域名可先用 IP+HTTP |
| 模型 API Key | 已配好的混元 TokenHub Key（`tokenhub.tencentmaas.com`） |
| 腾讯云安全组 | 放行 **80 / 443**（HTTPS 与 ACME 校验）；SSH 22 默认 |

**购买建议**：Lighthouse「应用镜像」选 **Docker CE** 预装镜像可省去手动装 Docker；否则按下面 init 步骤安装。

---

## 2. 服务器初始化（一次性）

```bash
# SSH 登录服务器后：
sudo apt update && sudo apt install -y git curl

# 方式 A：Docker 已预装 → 直接 clone 部署
git clone <你的仓库地址> /opt/growth-studio
cd /opt/growth-studio

# 方式 B：用仓库自带脚本初始化（自动装 docker compose 插件 + clone）
#   REPO_URL=<你的仓库地址> ./scripts/deploy.sh init
```

> 仓库需包含：`Dockerfile`、`docker-compose.yml`、`Caddyfile`、`.env.production.example`、`scripts/`。建议把本项目推到私有仓库（GitHub/Gitee），服务器上 clone。

---

## 3. 配置环境变量

```bash
cd /opt/growth-studio
cp .env.production.example .env
vim .env        # 必改项 ↓
```

**必改项**：

| 变量 | 改法 |
|---|---|
| `POSTGRES_PASSWORD` | 强密码（`openssl rand -hex 16`） |
| `JWT_SECRET` | 强随机值（`openssl rand -hex 32`） |
| `HUNYUAN_API_KEY` | 你的 TokenHub Key |

**可选项**：`COLLECTION_CRON_EXPRESSION`（默认每 4 小时采集一次，不需要定时采集可留 `disabled`）。

---

## 4. 配置域名（有域名时）

```bash
vim Caddyfile   # 把 example.com 换成你的域名
```

- 域名 A 记录 → 服务器公网 IP（TTL 调小，如 300s）
- Caddy 会自动申请/续期 Let's Encrypt 证书（需 80 端口放行做校验）
- 无域名：注释 `example.com {...}`，启用文件底部 `:80` 段，直接 IP 访问（明文 HTTP）

---

## 5. 构建并启动

```bash
./scripts/deploy.sh up
# 等价于: docker compose --env-file .env up -d --build

# 首次启动自动执行：
#   1) db  健康检查通过
#   2) migrate 一次性任务（drizzle-kit push 同步表结构）
#   3) web + worker 启动
```

---

## 6. 验证

```bash
# 健康检查（应有 db:up、modelsConfigured:2）
curl -s http://localhost:3000/api/v1/health
# → {"code":0,"data":{"status":"ok","db":"up","modelsConfigured":2,...}}

# 域名访问
curl -s https://你的域名/api/v1/health

# 浏览器打开 https://你的域名 → 注册账号 → 导入选题 → 打分 → 生成 → 编辑 → 导出

# 容器状态
docker compose ps
# 日志（web/worker 分开看）
docker compose logs -f web
docker compose logs -f worker
```

---

## 7. 日常运维

| 操作 | 命令 |
|---|---|
| 更新部署（拉新代码重建） | `./scripts/deploy.sh update` |
| 查看日志 | `./scripts/deploy.sh logs` |
| 停止服务 | `./scripts/deploy.sh down` |
| 备份数据库 | `docker compose exec db pg_dump -U postgres growth_studio > backup.sql` |
| 恢复数据库 | `cat backup.sql \| docker compose exec -T db psql -U postgres growth_studio` |
| 改配置（模型切换等） | 改 `.env` 后 `docker compose --env-file .env up -d`（仅重启受影响容器） |

**数据安全**：PG 数据在 `pgdata` 卷（`docker volume ls` 可见），`compose down` 不删卷；`compose down -v` 才会删（**慎用**）。

---

## 8. 回滚

```bash
# 回滚到上一个镜像（保留 .env 与数据卷）
git log --oneline -5          # 找上一个提交
git checkout <上一个commit>
./scripts/deploy.sh up
```

---

## 9. 上线前 Checklist

- [ ] `.env` 中 `POSTGRES_PASSWORD` / `JWT_SECRET` 已换强随机值（非模板值）
- [ ] 安全组仅放行 80/443/22
- [ ] 域名 HTTPS 已生效（`curl -I https://域名` 返回 200）
- [ ] 健康检查 `db:up`、`modelsConfigured:2`
- [ ] 浏览器全流程走通：注册 → 选题 → 生成 → 编辑 → 双平台导出
- [ ] 首次生成前确认 TokenHub 账户余额 > 0（Key 冻结会 401）
- [ ] 定时采集：确认 `COLLECTION_CRON_EXPRESSION` 是否开启、`worker` 日志无异常
