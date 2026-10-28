function textBinding(env, name) {
  const value = env && env[name];
  return typeof value === "string" ? value.trim() : "";
}

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function sameOrigin(request, url) {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");

  if (origin) {
    return origin === url.origin;
  }

  return Boolean(referer && referer.startsWith(url.origin));
}

async function proxyAmapRest(request, env) {
  const key = textBinding(env, "amap_key");
  const secret = textBinding(env, "amap_secret");

  if (!key || !secret) {
    return json({ error: "请在 Worker 控制台配置 amap_key 和 amap_secret" }, 500);
  }

  const incoming = new URL(request.url);

  if (!sameOrigin(request, incoming)) {
    return json({ error: "forbidden" }, 403);
  }

  const providedKey = incoming.searchParams.get("key");

  if (providedKey && providedKey !== key) {
    return json({ error: "forbidden" }, 403);
  }

  const upstreamPath = incoming.pathname.replace(/^\/_AMapService\/?/, "/");
  const upstream = new URL(upstreamPath, "https://restapi.amap.com");

  incoming.searchParams.forEach((value, name) => {
    if (name.toLowerCase() !== "jscode") {
      upstream.searchParams.append(name, value);
    }
  });

  if (!upstream.searchParams.get("key")) {
    upstream.searchParams.set("key", key);
  }

  upstream.searchParams.set("jscode", secret);

  const headers = new Headers();
  const contentType = request.headers.get("content-type");

  if (contentType) {
    headers.set("content-type", contentType);
  }

  const init = {
    method: request.method,
    headers,
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }

  const upstreamResponse = await fetch(upstream, init);
  const responseHeaders = new Headers();
  const responseType = upstreamResponse.headers.get("content-type");

  if (responseType) {
    responseHeaders.set("content-type", responseType);
  }

  responseHeaders.set("cache-control", "no-store");

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: responseHeaders,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/api/hello") {
      return Response.json({
        message: "Hello from Cloudflare Workers!",
        timestamp: new Date().toISOString(),
        path: path,
      });
    }

    if (path === "/api/db" && request.method === "GET") {
      if (!env.DB) {
        return json({ error: "请绑定 D1 数据库（binding 名称：DB）" }, 500);
      }

      try {
        const { results } = await env.DB.prepare(
          "SELECT id, message, created_at FROM demo_messages ORDER BY id DESC LIMIT 20",
        ).all();
        return json({ results });
      } catch (error) {
        return json({ error: "读取数据库失败，请先执行 migrations/0001_demo.sql", detail: error.message }, 500);
      }
    }

    if (path === "/api/db" && request.method === "POST") {
      if (!env.DB) {
        return json({ error: "请绑定 D1 数据库（binding 名称：DB）" }, 500);
      }

      try {
        const body = await request.json();
        const message = typeof body.message === "string" ? body.message.trim() : "";
        if (!message || message.length > 500) {
          return json({ error: "message 必须为 1 到 500 个字符" }, 400);
        }

        const result = await env.DB.prepare(
          "INSERT INTO demo_messages (message) VALUES (?)",
        ).bind(message).run();
        return json({ id: result.meta.last_row_id, message }, 201);
      } catch (error) {
        return json({ error: "写入数据库失败，请确认已执行 migrations/0001_demo.sql", detail: error.message }, 500);
      }
    }

    if (path === "/api/kv" && (request.method === "GET" || request.method === "PUT")) {
      if (!env.KV) return json({ error: "请绑定 KV namespace（binding 名称：KV）" }, 500);
      const key = url.searchParams.get("key") || "demo";
      if (request.method === "GET") {
        const value = await env.KV.get(key);
        return json({ key, value });
      }
      const value = await request.text();
      if (!value || value.length > 5000) return json({ error: "请求体必须为 1 到 5000 个字符" }, 400);
      await env.KV.put(key, value);
      return json({ key, value }, 201);
    }

    if (path === "/api/r2" && (request.method === "GET" || request.method === "PUT")) {
      if (!env.BUCKET) return json({ error: "请绑定 R2 bucket（binding 名称：BUCKET）" }, 500);
      const key = url.searchParams.get("key") || "demo.txt";
      if (request.method === "GET") {
        const object = await env.BUCKET.get(key);
        if (!object) return json({ error: "对象不存在", key }, 404);
        const headers = new Headers({ "cache-control": "no-store" });
        object.writeHttpMetadata(headers);
        headers.set("etag", object.httpEtag);
        return new Response(object.body, { headers });
      }
      const value = await request.text();
      if (!value || value.length > 1_000_000) return json({ error: "请求体必须为 1 到 1000000 个字符" }, 400);
      await env.BUCKET.put(key, value, { httpMetadata: { contentType: "text/plain; charset=utf-8" } });
      return json({ key, size: value.length }, 201);
    }

    if (path === "/api/do" && (request.method === "GET" || request.method === "POST")) {
      if (!env.COUNTER) return json({ error: "请绑定 Durable Object namespace（binding 名称：COUNTER）" }, 500);
      const id = env.COUNTER.idFromName("demo");
      return env.COUNTER.get(id).fetch(new Request(new URL("/" + (request.method === "POST" ? "increment" : ""), request.url), {
        method: request.method,
        body: request.method === "POST" ? await request.text() : undefined,
      }));
    }

    if (path === "/api/nav/config") {
      const key = textBinding(env, "amap_key");

      if (!key) {
        return json({ error: "请在 Worker 控制台配置 amap_key" }, 500);
      }

      return json({ key });
    }

    if (path === "/_AMapService" || path.startsWith("/_AMapService/")) {
      return proxyAmapRest(request, env);
    }

    if (env.ASSETS) {
      const assetResponse = await env.ASSETS.fetch(request);
      const contentType = assetResponse.headers.get("content-type") || "";

      if (contentType.startsWith("text/html") && !/charset=/i.test(contentType)) {
        const headers = new Headers(assetResponse.headers);
        headers.set("content-type", "text/html; charset=utf-8");
        return new Response(assetResponse.body, {
          status: assetResponse.status,
          statusText: assetResponse.statusText,
          headers,
        });
      }

      return assetResponse;
    }

    return new Response("Static assets are not configured", { status: 500 });
  },
};

export class Counter {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    let value = (await this.state.storage.get("value")) || 0;
    if (new URL(request.url).pathname === "/increment") {
      value += 1;
      await this.state.storage.put("value", value);
    }
    return Response.json({ value });
  }
}
