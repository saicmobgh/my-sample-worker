# my-sample-worker

一个基于 Cloudflare Workers 的示例项目，包含静态页面、高德地图代理和 Cloudflare D1 数据库示例。

## 在线地址

- Worker：<https://wk.depsek.de5.net>
- 首页：<https://wk.depsek.de5.net/>
- 标记页面：<https://wk.depsek.de5.net/mark.html>
- 路线规划页面：<https://wk.depsek.de5.net/route.html>

## 支持的功能

### 静态页面

- `GET /`：项目首页。
- `GET /mark.html`：地图坐标标记页面。
- `GET /route.html`：地图路线规划页面。
- `/assets/*`：前端 JavaScript、CSS、图标等静态资源。

静态文件来自 `public/`，由 Cloudflare Workers Assets 提供服务。

### 基础 API

#### `GET /api/hello`

返回 Worker 的问候信息、当前时间和请求路径。

```sh
curl https://wk.depsek.de5.net/api/hello
```

#### `GET /api/nav/config`

返回前端地图页面需要的高德 Web 端 `key`。需要先配置 `amap_key` Worker Secret，否则返回 `500`。

```sh
curl https://wk.depsek.de5.net/api/nav/config
```

#### `GET /api/db`

读取 D1 数据库中最新的 20 条消息，按 `id` 倒序返回。

```sh
curl https://wk.depsek.de5.net/api/db
```

返回格式：`{"results":[{"id":1,"message":"hello","created_at":"2026-10-22 02:15:58"}]}`。

#### `POST /api/db`

向 D1 写入一条消息。请求必须使用 JSON，`message` 必须是 1 到 500 个字符的字符串。

```sh
curl -X POST https://wk.depsek.de5.net/api/db \
  -H 'content-type: application/json' \
  -d '{"message":"hello from D1"}'
```

成功时返回 `201`，例如：`{"id":2,"message":"hello from D1"}`。

### 高德地图 REST 代理

所有 `/_AMapService` 和 `/_AMapService/*` 路径都会代理到 `https://restapi.amap.com`，用于隐藏高德安全密钥 `jscode`。

例如查询地理编码：

```sh
curl 'https://wk.depsek.de5.net/_AMapService/v3/geocode/geo?address=北京市'
```

代理要求请求来自当前 Worker 同源页面，并且需要配置以下 Worker Secret：

- `amap_key`：高德 Web 服务 API Key。
- `amap_secret`：高德安全密钥，会作为 `jscode` 注入上游请求。

代理会自动补充 `key` 和 `jscode`，并转发请求方法、请求体和上游响应类型。

## 项目配置

`wrangler.toml` 已配置 Worker 名称、`public/` 静态资源目录、`ASSETS` binding、`DB` D1 binding 和自定义域名 `wk.depsek.de5.net`。

不要把高德密钥写入代码或提交到 Git，使用 Wrangler Secret：

```sh
npx wrangler secret put amap_key
npx wrangler secret put amap_secret
```

## 本地开发

```sh
npm install
npm run dev
```

默认地址为 <http://localhost:8787>。本地测试：

```sh
curl http://localhost:8787/api/hello
curl http://localhost:8787/api/db
curl -X POST http://localhost:8787/api/db \
  -H 'content-type: application/json' \
  -d '{"message":"local test"}'
```

## D1 数据库

创建数据库：

```sh
npx wrangler d1 create my-sample-worker-db
```

将返回的 `database_id` 写入 `wrangler.toml` 的 `[[d1_databases]]` 配置中。当前项目已经配置好数据库 ID。

表结构文件为 `migrations/0001_demo.sql`，创建 `demo_messages` 表。应用到本地或远程数据库：

```sh
npx wrangler d1 migrations apply my-sample-worker-db --local
npx wrangler d1 migrations apply my-sample-worker-db --remote
```

## 部署

部署 Worker、静态资源和 D1 binding：

```sh
npm run deploy
```

部署完成后验证：

```sh
curl https://wk.depsek.de5.net/api/hello
curl https://wk.depsek.de5.net/api/db
```

## 目录结构

```text
.
├── migrations/0001_demo.sql  # D1 建表迁移
├── public/                   # 静态页面和前端资源
├── src/index.js              # Worker 路由、D1 和高德代理逻辑
├── wrangler.toml             # Worker、Assets、D1 和域名配置
└── package.json              # npm 脚本和 Wrangler 依赖
```

## Workers Builds

将 Git 仓库连接到 Cloudflare 的 **Workers & Pages > Settings > Builds** 后，每次推送都可以自动构建和部署。
