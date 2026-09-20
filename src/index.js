export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/mark.html" || path.startsWith("/assets/")) {
      if (env.ASSETS) {
        return env.ASSETS.fetch(request);
      }

      return new Response("Static assets are not configured", { status: 500 });
    }

    if (path === "/api/hello") {
      return Response.json({
        message: "Hello from Cloudflare Workers!",
        timestamp: new Date().toISOString(),
        path: path,
      });
    }

    return new Response(
      `<!DOCTYPE html>
<html>
<head><title>My First Worker</title>
<style>
  body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f38020; }
  .card { background: white; padding: 2rem 3rem; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); text-align: center; }
  h1 { color: #f38020; }
  code { background: #f4f4f4; padding: 2px 6px; border-radius: 4px; }
</style>
</head>
<body>
  <div class="card">
    <h1>🚀 Hello World!</h1>
    <p>Your Cloudflare Worker is running successfully.</p>
    <p>Try the API endpoint: <code>/api/hello</code></p>
  </div>
</body>
</html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  },
};
