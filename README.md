# The Akins Bake House

A static bakery website with one shared Square checkout implementation for Cloudflare Workers, Netlify Functions, and local development.

## Preview and edit

Use Node 24.15 or later in the 24 release line (this project was checked with Node 24.19).

```text
npm run dev
```

Open `http://localhost:8888`. The preview serves the source files directly; save an edit and refresh the browser. No dependency installation or payment credentials are needed just to preview the website. VS Code's **Akins: Start Local Site** task starts the same server.

VS Code Live Server on port 5500 can show the pages, but it does not run the checkout backend. Use port 8888 to test the full local flow.

| What you want to change | File |
| --- | --- |
| Prices, add-on surcharges, menu units, quote-only bundles, quantity and text limits | `assets/order-rules.js` |
| Homepage wording and Taylor's story | `index.html` |
| Menu descriptions, categories, and product cards | `menu.html` |
| Checkout wording and fields | `checkout.html` |
| Colors, fonts, spacing, and responsive layout | `assets/site.css` |
| Food photos and logo | `assets/` |
| Public checkout endpoint | `assets/config.js` |
| Cart and browser checkout behavior | `assets/site.js` |
| Square requests and payment verification | `server/square-checkout.mjs` |

Prices are read from `order-rules.js` by the browser and the backend. Price elements marked with `data-price-name` are also updated during the static build, so the published no-JavaScript fallback remains consistent. When adding a brand-new item, add both its rules entry and a menu card, using the exact same item name in `data-item-name` and `data-price-name`. The checkout dropdown fills automatically.

Prices were adjusted on September 21, 2026 as a market-informed starting point, balancing accessible cookie prices with modest increases for other bakes. They are not a verified margin calculation: Taylor still needs to check ingredients, packaging, labor, payment fees, and portions. Cookie cakes, Butterfinger cake, cheesecake, and banana pudding now use starting prices and require a quote because their sizes are not specified. Existing food photos remain in place.

Approved add-on prices now appear directly in the dropdowns and are included in menu, cart, and checkout totals. Edit `addonPrices`, `breadAddons`, and `cookieAddons` in `assets/order-rules.js` to change them later. Each surcharge applies to one menu unit (a dozen, loaf, or pie), and a listed combination has one combined price. Options omitted from these price lists remain quote-only. Extra written requests also require a quote. The shared rules validate allowed choices and prices on the server; Square receives separate, clearly named lines for different versions of the same bake. Restart the local server after changing shared pricing rules.

## Checkout behavior

Every product card has a “Make it yours” dropdown. Suggested add-ins and flavor requests are configured in `assets/order-rules.js` in `itemOptions` and `optionLabels`. Original recipes keep the listed menu price. Priced add-ons show their surcharge and can be paid for with the bake; unpriced choices and additional written changes require a quote. “Something else” requires a short description, up to 200 characters.

Different options are separate cart lines, including a plain dozen and a pecan dozen of the same bake. Choices survive refresh, saved favorites, and copying/emailing the order request. The quantity limit applies across all versions of a bake. Existing plain-item carts and saved favorites still work. The checkout backend calculates approved add-on prices and rejects unpriced custom requests from direct payment.

Customers can edit options in their cart, with a preview before saving. Quantity buttons and direct number entry work while the editor is open, and preserve its draft. Quantities save immediately; canceling the editor cancels only the option changes. “Finish editing options” takes the customer to the Save options button before checkout can continue. Each order line shows its base price, add-on cost, unit, and total. Pickup date and preferred time appear together; serving sizes awaiting Taylor's confirmation remain unchanged.

- Homepage and menu buttons add to a persistent cart without leaving the page. Legacy item links consume their URL parameter once, so refreshing does not add the same item again.
- Carts persist on the device. Customer details persist only in the current browser tab unless the customer explicitly saves an order for reordering.
- Customers can remove the saved orders for their contact from this device.
- Contact details, quantities, dates, and text lengths are validated before a Square request. Dates use Oklahoma time. The 48–72 hour lead time remains a preference; shorter-notice customers are told to contact Taylor first.
- All items with starting prices, local delivery, and custom requests open an email quote. The customer must send the email in their mail application. Copy Order Details is the fallback; neither action silently submits an order.
- Customer notes allow 1,000 characters with a visible counter. The complete instructions, contact, requested date/time, and occasion are kept on the first Square order line item's note. The shorter payment note points there. Instructions are never silently truncated.
- After payment, the website asks the backend to verify the exact Square order and completed payments. A signed, expiring verification token prevents an arbitrary URL from confirming a payment. Only the unchanged submitted cart is cleared; a cart edited in another tab is preserved.
- If the browser cannot verify a payment, the page asks the customer to check their receipt and provides a retry. It does not claim payment succeeded.

## Test checkout locally

```text
npm run env:setup
```

Edit the generated `.env` locally with Square **sandbox** credentials:

```text
SQUARE_ACCESS_TOKEN=your_sandbox_token
SQUARE_LOCATION_ID=your_sandbox_location_id
SQUARE_ENVIRONMENT=sandbox
SITE_URL=http://localhost:8888
```

Restart the local server after environment changes. The token must allow creating checkout links, reading orders, and reading payments. A personal sandbox token can be used. The `.env` file is ignored by Git and is never included in the static build.

The local server will not use production credentials unless `ALLOW_LIVE_CHECKOUT=true` is explicitly set in `.env`. Without credentials, it still shows the site and returns an honest payment-unavailable message.

## Checks and build

```text
npm ci
npm run check
npm test
npm run build
```

The tests cover the browser cart and checkout behavior in a simulated DOM and Square requests through mocked responses. They do not charge a card or contact a real Square account. Built public files are written to `outputs/`; edit the source files rather than that generated folder. The build includes only public HTML, assets, CNAME, robots.txt, and sitemap.xml.

## Publish with GitHub Pages and Cloudflare

The current public endpoint is configured in `assets/config.js`. Deploy the updated Worker **before** publishing the updated static website, because the new frontend needs its verification token and verification action.

1. Install dependencies with `npm ci`.
2. Set the correct production values in `wrangler.jsonc` and store the production token with `npm run worker:secret` (sign in using `npm run worker:login` if necessary).
3. Deploy the backend using `npm run worker:deploy`.
4. Run the checks and publish the website from the repository's normal GitHub Pages workflow.
5. Complete a Square sandbox checkout through return verification before enabling production use. Confirm how Taylor receives and handles paid orders in Square.

Both `https://theakinsbakehouse.com` and `https://www.theakinsbakehouse.com` are allowed, along with localhost previews and the origin explicitly configured in `SITE_URL`.

This local project was downloaded without a `.git` directory. To publish via GitHub, transfer the reviewed source changes into the real repository or initialize/connect this copy intentionally. Do not upload `node_modules/`, `.env`, or other credential files.

## Netlify alternative

Set `checkoutEndpoint` in `assets/config.js` to `/api/create-square-checkout` and configure the four environment variables in Netlify, using the actual site's URL. The function and Worker both call the same backend module. `netlify.toml` defines the static build and API redirect. `npm run dev:netlify` is available for the Netlify emulator; it serves the built output, so rerun the build after source edits.

## Square API references

- [Create a payment link](https://developer.squareup.com/reference/square/checkout/create-payment-link)
- [Order line item notes](https://developer.squareup.com/reference/square/objects/OrderLineItem)
- [Retrieve payments and find payment IDs from order tenders](https://developer.squareup.com/docs/payments-api/retrieve-payments)
