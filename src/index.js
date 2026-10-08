export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/api/hello") {
      return Response.json({
        message: "Hello from Cloudflare Workers!",
        timestamp: new Date().toISOString(),
        path: path,
      });
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Static assets are not configured", { status: 500 });
  },
};
