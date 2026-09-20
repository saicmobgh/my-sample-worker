# my-sample-worker

A sample Cloudflare Worker deployed via Workers Builds.

## Endpoints

- `GET /` — Hello World HTML page
- `GET /api/hello` — JSON response with a greeting and timestamp
- `GET /mark.html` — Coordinate marking map page

## Local Development

```bash
npm install
npx wrangler dev
```

The map page is served from `public/mark.html` and its files in `public/assets/`.

## Deploy

```bash
npx wrangler deploy
```

## CI/CD with Workers Builds

This repo is configured for [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/). 
Connect it to Cloudflare via **Workers & Pages > Settings > Builds** to enable automatic deployments on every push.
