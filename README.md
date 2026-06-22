# The Akins Bake House

Static website with Netlify Functions for Square checkout.

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
