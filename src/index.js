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
      return env.ASSETS.fetch(request);
    }

    return new Response("Static assets are not configured", { status: 500 });
  },
};
