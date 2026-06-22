# The Akins Bake House

Static website with Netlify Functions for Square checkout and paid-order phone notifications.

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
SQUARE_WEBHOOK_URL
SQUARE_WEBHOOK_SIGNATURE_KEY
DISCORD_ORDER_WEBHOOK_URL
```

Use a private Discord channel for the free order notification path.

## Square Webhook

Create a Square webhook subscription with this notification URL:

```text
https://theakinsbakehouse.com/api/square-payment-webhook
```

Subscribe to:

```text
payment.created
```

Copy the Square webhook signature key into:

```text
SQUARE_WEBHOOK_SIGNATURE_KEY
```

## Free Owner Notifications

Customers only fill out the website checkout form and pay through Square. After Square confirms a completed website payment, Netlify sends a structured Discord notification with the order total, customer contact, pickup date, items, notes, receipt link, and Square order ID.

### Discord Setup

1. Create or open a Discord server.
2. Create a private channel named something like `akins-orders`.
3. Open the channel settings.
4. Go to Integrations > Webhooks.
5. Create a webhook named `The Akins Bake House Orders`.
6. Copy the webhook URL into `.env`:

```text
DISCORD_ORDER_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

7. Add the same value in Netlify under Environment variables.
8. In VS Code, run `Terminal > Run Task > Akins: Test Discord Notification`.

Keep the Discord webhook URL private. Anyone with that URL can post into the order channel.

## Useful Commands

```text
npm install
npm run env:setup
npm run dev
npm run notify:test
npm run build
npm run check
```
