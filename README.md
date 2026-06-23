# The Akins Bake House

Static website with Netlify Functions for Square checkout.
The live site can also use a Cloudflare Worker for the Square checkout backend when Netlify is not available.

## VS Code Plug And Play

1. Open this folder in VS Code.
2. Open Terminal > Run Task.
3. Run `Akins: One-Time Setup`.
4. Paste the real values into `.env`.
5. Run `Akins: Start Local Site`.

The local site opens through Netlify Dev at:

```text
http://localhost:8888
```

## Environment Values

The project uses `.env` locally and the same keys in Netlify:

```text
SQUARE_ACCESS_TOKEN
SQUARE_LOCATION_ID
SQUARE_ENVIRONMENT
SITE_URL
```

## Useful Commands

```text
npm install
npm run env:setup
npm run dev
npm run build
npm run check
```

## Free Cloudflare Worker Checkout

Use this when GitHub Pages should keep hosting the website and Cloudflare should only handle the private Square checkout token.

```text
npm run worker:login
npm run worker:secret
npm run worker:deploy
```

When `worker:secret` asks for the value, paste the Square production access token. Do not commit the token to GitHub.

The current Worker URL is:

```text
https://akins-square-checkout.cmhawkins29.workers.dev
```

If the Worker URL ever changes, set `dynamicSquareCheckoutEndpoint` in `assets/site.js` to the new URL. Then run:

```text
npm run check
npm run build
```
