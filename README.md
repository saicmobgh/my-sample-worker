# my-sample-worker

基于 Cloudflare Workers 的示例项目，包含静态页面、高德地图 REST 代理和多种 Cloudflare 数据存储示例。

## 目录

- [项目概览](#项目概览)
- [在线地址](#在线地址)
- [功能与 API](#功能与-api)
- [数据存储](#数据存储)
- [本地开发](#本地开发)
- [配置与密钥](#配置与密钥)
- [部署](#部署)
- [项目结构](#项目结构)
- [自动部署](#自动部署)

## 项目概览

静态文件由 Cloudflare Workers Assets 提供。Worker 提供基础 API、高德地图代理，以及 D1、KV 和 Durable Objects 的读写示例。R2 示例代码已提供，当前账户尚未启用 R2。

## 在线地址

- Worker：<https://wk.depsek.de5.net>
- 首页：<https://wk.depsek.de5.net/>
- 标记页面：<https://wk.depsek.de5.net/mark.html>
- 路线规划页面：<https://wk.depsek.de5.net/route.html>

## 功能与 API

### 静态页面

- `GET /`：项目首页。
- `GET /mark.html`：地图坐标标记页面。
- `GET /route.html`：地图路线规划页面。
- `/assets/*`：前端 JavaScript、CSS 和图标。

### 基础 API

#### `GET /api/hello`

返回问候信息、当前时间和请求路径。

```sh
curl https://wk.depsek.de5.net/api/hello
```

#### `GET /api/nav/config`

返回地图页面需要的高德 Web 端 API Key。需要配置 `amap_key` Worker Secret。

```sh
curl https://wk.depsek.de5.net/api/nav/config
```

#### `GET /api/db`

读取 D1 中最新的 20 条消息，按 `id` 倒序排列。

```sh
curl https://wk.depsek.de5.net/api/db
```

#### `POST /api/db`

写入一条消息。请求使用 JSON，`message` 长度为 1 到 500 个字符。

```sh
curl -X POST https://wk.depsek.de5.net/api/db \
  -H 'content-type: application/json' \
  -d '{"message":"hello from D1"}'
```

成功时返回 `201`，例如 `{"id":2,"message":"hello from D1"}`。

### 高德地图 REST 代理

`/_AMapService` 和 `/_AMapService/*` 请求会代理到 `https://restapi.amap.com`。代理要求请求来自 Worker 同源页面，并需要配置 `amap_key` 和 `amap_secret` 两个 Worker Secret。`jscode` 会由 Worker 注入上游请求。

```sh
curl 'https://wk.depsek.de5.net/_AMapService/v3/geocode/geo?address=北京市'
```

## 数据存储

### D1（已绑定）

Worker 使用 `DB` binding 访问 D1 数据库 `my-sample-worker-db`。迁移文件 `migrations/0001_demo.sql` 会创建 `demo_messages` 表。

```sh
npx wrangler d1 migrations apply my-sample-worker-db --local
npx wrangler d1 migrations apply my-sample-worker-db --remote
```

### KV（已上线）

`KV` binding 已配置在线上 Worker，namespace ID 为 `9488294829bb47a59a116c907a06eeb6`。`GET` 读取键值，`PUT` 写入文本值。

```sh
curl -sS -X PUT 'https://wk.depsek.de5.net/api/kv?key=greeting' -d 'hello from KV'
curl -sS 'https://wk.depsek.de5.net/api/kv?key=greeting'
```

本地调用示例：

```sh
curl -X PUT 'http://localhost:8787/api/kv?key=greeting' -d 'hello from KV'
curl 'http://localhost:8787/api/kv?key=greeting'
```

### Durable Objects（已上线）

`COUNTER` binding 和 `Counter` 类已部署。`GET` 读取计数器，`POST` 将计数器加一。

```sh
curl -sS 'https://wk.depsek.de5.net/api/do'
curl -sS -X POST 'https://wk.depsek.de5.net/api/do'
```

本地调用示例：

```sh
curl 'http://localhost:8787/api/do'
curl -X POST 'http://localhost:8787/api/do'
```

### R2（待启用）

当前 Cloudflare 账户尚未启用 R2，创建 bucket 时会返回错误 `10042`。先在 Cloudflare Dashboard 启用 R2，再创建 bucket，并取消 `wrangler.toml` 中 `[[r2_buckets]]` 配置的注释。

```sh
npx wrangler r2 bucket create my-sample-worker-bucket
curl -X PUT 'http://localhost:8787/api/r2?key=demo.txt' -d 'hello from R2'
curl 'http://localhost:8787/api/r2?key=demo.txt'
```

R2 binding 尚未配置时，`/api/r2` 返回 binding 配置提示。

## 本地开发

```sh
npm install
npm run dev
```

开发服务器默认运行在 <http://localhost:8787>。可通过以下命令检查基础 API 和 D1：

```sh
curl http://localhost:8787/api/hello
curl http://localhost:8787/api/db
curl -X POST http://localhost:8787/api/db \
  -H 'content-type: application/json' \
  -d '{"message":"local test"}'
```

## 配置与密钥

`wrangler.toml` 配置 Worker、静态资源、D1、KV、Durable Objects 和自定义域名。不要将高德密钥写入代码或提交到 Git，使用 Wrangler Secret 配置：

```sh
npx wrangler secret put amap_key
npx wrangler secret put amap_secret
```

## 部署

```sh
npm run deploy
```

部署后可检查：

```sh
curl https://wk.depsek.de5.net/api/hello
curl https://wk.depsek.de5.net/api/db
```

## 项目结构

```text
.
├── migrations/0001_demo.sql  # D1 建表迁移
├── public/                   # 静态页面和前端资源
├── src/index.js              # Worker 路由、存储和高德代理逻辑
├── wrangler.toml             # Worker、Assets、存储 binding 和域名配置
└── package.json              # npm 脚本和 Wrangler 依赖
```

## 自动部署

将 Git 仓库连接到 Cloudflare 的 **Workers & Pages > Settings > Builds**，后续推送可以触发自动构建和部署。
