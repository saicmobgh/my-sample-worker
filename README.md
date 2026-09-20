# my-sample-worker

A sample Cloudflare Worker deployed via Workers Builds.

## Endpoints

- `GET /` — Hello World HTML page
- `GET /api/hello` — JSON response with a greeting and timestamp

## Local Development

```bash
npm install
npx wrangler dev
```

## Deploy

```bash
npx wrangler deploy
```

## CI/CD with Workers Builds

This repo is configured for [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/). 
Connect it to Cloudflare via **Workers & Pages > Settings > Builds** to enable automatic deployments on every push.
