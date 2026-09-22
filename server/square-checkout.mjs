import rules from "../assets/order-rules.js";

const SQUARE_VERSION = "2026-05-20";
const SOURCE = "The Akins Bake House Website";
const enc = new TextEncoder();
const allowedOrigins = new Set(["https://theakinsbakehouse.com", "https://www.theakinsbakehouse.com"]);
const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
class CheckoutError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

function allowedOrigin(origin, env) {
  try {
    const url = new URL(origin);
    const configured = env.SITE_URL ? new URL(env.SITE_URL).origin : "";
    return allowedOrigins.has(url.origin) || url.origin === configured ||
      (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  } catch { return false; }
}

function bounded(value, label, limit, required = false) {
  if (value !== undefined && typeof value !== "string") throw new CheckoutError(`${label} must be text.`);
  const result = rules.text(value);
  if ((required && !result) || result.length > limit) throw new CheckoutError(`${label} ${!result ? "is required" : `must be ${limit} characters or fewer`}.`);
  return result;
}

function validateOrder(payload) {
  if (!isObject(payload) || !isObject(payload.customer)) throw new CheckoutError("Add your order and contact details before paying.");
  if (!Array.isArray(payload.items) || !payload.items.length || payload.items.length > rules.menuItems.length * rules.limits.quantity) throw new CheckoutError("Choose valid menu items before paying.");
  const counts = new Map();
  const variants = new Map();
  for (const item of payload.items) {
    if (!isObject(item) || !rules.hasItem(item.name) || !Number.isInteger(item.quantity) || item.quantity < 1) throw new CheckoutError("Choose a valid item and whole-number quantity.");
    const selection = rules.normalizeCartItem(item);
    if (!selection) throw new CheckoutError("Choose valid options for each bake.");
    const pricing = rules.priceSelection(selection);
    if (pricing.needsQuote) throw new CheckoutError("This option or extra request needs a quote before payment.");
    const quantity = (counts.get(item.name) || 0) + item.quantity;
    if (quantity > rules.limits.quantity) throw new CheckoutError(`For more than ${rules.limits.quantity} units of one bake, please email us for a quote.`);
    if (rules.priceBook[item.name].starting) throw new CheckoutError("This order needs a final quote before payment.");
    counts.set(item.name, quantity);
    const key = rules.cartKey(selection);
    const previous = variants.get(key);
    if (previous) previous.quantity += item.quantity;
    else variants.set(key, { name: item.name, label: rules.cartLabel(selection), quantity: item.quantity, cents: Math.round(pricing.unitPrice * 100) });
  }
  const details = {
    name: bounded(payload.customer.name, "Name", rules.limits.name, true),
    contact: bounded(payload.customer.contact, "Phone or email", rules.limits.contact, true),
    pickupDate: bounded(payload.pickupDate, "Pickup date", 10, true),
    pickupTime: bounded(payload.pickupTime, "Requested time", rules.limits.pickupTime),
    occasion: bounded(payload.occasion, "Occasion", rules.limits.occasion),
    notes: bounded(payload.notes, "Notes", rules.limits.notes)
  };
  if (!rules.validContact(details.contact)) throw new CheckoutError("Enter a valid email address or phone number with at least 10 digits.");
  if (!rules.validDate(details.pickupDate)) throw new CheckoutError("Choose today or a future date in Oklahoma.");
  if ((payload.fulfillment && payload.fulfillment !== "pickup") || payload.customOrder === true) throw new CheckoutError("Delivery and custom orders need a quote before payment.");
  const items = [...variants.values()];
  const total = items.reduce((sum, item) => sum + item.quantity * item.cents, 0);
  if (!isObject(payload.totals) || typeof payload.totals.dueToday !== "number" || !Number.isFinite(payload.totals.dueToday) || Math.round(payload.totals.dueToday * 100) !== total) throw new CheckoutError("Your total changed. Refresh the menu and try again.");
  return { details, items, total };
}

function base(env) { return env.SQUARE_ENVIRONMENT === "sandbox" ? "https://connect.squareupsandbox.com" : "https://connect.squareup.com"; }
async function square(path, env, fetcher, body) {
  const response = await fetcher(`${base(env)}/v2${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${env.SQUARE_ACCESS_TOKEN}`, "Square-Version": SQUARE_VERSION, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new CheckoutError("Square is temporarily unavailable. Please try again or email the bakery. If you already paid, check your Square receipt before trying again.", 502);
  return data;
}

const hex = bytes => [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join("");
async function signingKey(env) {
  return crypto.subtle.importKey("raw", enc.encode(env.SQUARE_ACCESS_TOKEN), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
async function sign(data, env) {
  const payload = btoa(JSON.stringify(data)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  return `${payload}.${hex(await crypto.subtle.sign("HMAC", await signingKey(env), enc.encode(payload)))}`;
}
async function verifyToken(token, env) {
  if (typeof token !== "string" || token.length > 2048) throw new CheckoutError("This payment check has expired. Please use your Square receipt.");
  const [payload, signature, extra] = token.split(".");
  if (extra || !/^[a-zA-Z0-9_-]+$/.test(payload || "") || !/^[a-f0-9]{64}$/.test(signature || "")) throw new CheckoutError("The payment check is invalid.");
  const bytes = Uint8Array.from(signature.match(/../g), value => parseInt(value, 16));
  if (!await crypto.subtle.verify("HMAC", await signingKey(env), bytes, enc.encode(payload))) throw new CheckoutError("The payment check is invalid.");
  let data;
  try { data = JSON.parse(atob(payload.replaceAll("-", "+").replaceAll("_", "/"))); } catch { throw new CheckoutError("The payment check is invalid."); }
  if (!isObject(data) || !Number.isFinite(data.expires) || data.expires < Date.now() || data.environment !== (env.SQUARE_ENVIRONMENT || "production") || typeof data.orderId !== "string" || !Number.isSafeInteger(data.total) || data.total <= 0) throw new CheckoutError("This payment check has expired. Please use your Square receipt.");
  return data;
}

async function verifyPayment(payload, env, fetcher) {
  const pending = await verifyToken(payload.verificationToken, env);
  const { order } = await square(`/orders/${encodeURIComponent(pending.orderId)}`, env, fetcher);
  if (!order || order.id !== pending.orderId || order.location_id !== pending.locationId || order.total_money?.currency !== "USD" || Number(order.total_money?.amount) !== pending.total || order.state === "CANCELED") return { paid: false };
  const paymentIds = [...new Set((order.tenders || []).map(tender => tender.payment_id).filter(id => typeof id === "string"))];
  let paid = 0;
  for (const id of paymentIds.slice(0, 20)) {
    const { payment } = await square(`/payments/${encodeURIComponent(id)}`, env, fetcher);
    if (payment?.status === "COMPLETED" && payment.order_id === order.id && payment.location_id === pending.locationId && payment.amount_money?.currency === "USD") {
      paid += Number(payment.amount_money.amount) - Number(payment.refunded_money?.amount || 0);
    }
  }
  return { paid: Number.isFinite(paid) && paid >= pending.total, orderId: order.id };
}

async function createPayment(payload, env, fetcher) {
  const { details, items, total } = validateOrder(payload);
  let returnUrl;
  try {
    returnUrl = new URL(payload.returnUrl || "/checkout.html", env.SITE_URL || "https://theakinsbakehouse.com");
    if (!allowedOrigin(returnUrl.origin, env)) throw new Error();
    returnUrl.search = "?square=return";
    returnUrl.hash = "";
  } catch { throw new CheckoutError("Please start checkout from the bakery website."); }
  let locationId = rules.text(env.SQUARE_LOCATION_ID);
  if (!locationId || locationId === "auto") {
    const { locations } = await square("/locations", env, fetcher);
    locationId = locations?.find(location => location.status === "ACTIVE" && location.currency === "USD")?.id;
  }
  if (!locationId) throw new CheckoutError("Checkout is not available yet. Please email the bakery to arrange your order.", 503);
  const fullInstructions = [
    `Customer: ${details.name}`, `Contact: ${details.contact}`, `Pickup / meet-up: ${details.pickupDate}`,
    `Requested time: ${details.pickupTime || "To be arranged"}`, `Occasion: ${details.occasion || "Not specified"}`,
    `Customer notes:\n${details.notes || "None"}`
  ].join("\n");
  if (fullInstructions.length > 2000) throw new CheckoutError("Please shorten your order details before paying.");
  const requestId = bounded(payload.requestId, "Checkout reference", 80, true);
  const idempotencyKey = hex(await crypto.subtle.digest("SHA-256", enc.encode(JSON.stringify({ requestId, details, items, returnUrl: returnUrl.href, locationId }))));
  const data = await square("/online-checkout/payment-links", env, fetcher, {
    idempotency_key: idempotencyKey,
    description: `Website order for ${details.name}`,
    order: {
      location_id: locationId,
      source: { name: SOURCE },
      line_items: items.map((item, index) => ({
        name: item.label, quantity: String(item.quantity), item_type: "ITEM",
        base_price_money: { amount: item.cents, currency: "USD" },
        ...(index === 0 ? { note: fullInstructions } : {})
      }))
    },
    checkout_options: { redirect_url: returnUrl.href },
    payment_note: `${SOURCE} | ${details.name} | ${details.contact} | Pickup: ${details.pickupDate} | Full instructions are in the first order item's note.`
  });
  const link = data.payment_link;
  if (!link?.order_id || !(link.url || link.long_url)) throw new CheckoutError("Square did not return a checkout link. Please try again.", 502);
  const verificationToken = await sign({ orderId: link.order_id, locationId, total, environment: env.SQUARE_ENVIRONMENT || "production", expires: Date.now() + 7 * 86400000 }, env);
  return { checkoutUrl: link.url || link.long_url, orderId: link.order_id, total: total / 100, verificationToken };
}

export async function handleRequest(request, env = {}, fetcher = fetch) {
  const origin = request.headers.get("Origin");
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store", "Vary": "Origin", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
  if (origin && allowedOrigin(origin, env)) headers["Access-Control-Allow-Origin"] = origin;
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers });
  if (origin && !allowedOrigin(origin, env)) return json(403, { message: "Please use the bakery website to check out." });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return json(405, { message: "Use POST for checkout." });
  try {
    const raw = await request.text();
    if (enc.encode(raw).length > 20000) throw new CheckoutError("The order request is too large.", 413);
    let payload;
    try { payload = JSON.parse(raw); } catch { throw new CheckoutError("The checkout request was not valid JSON."); }
    if (!isObject(payload)) throw new CheckoutError("The checkout request must contain an order.");
    if (!env.SQUARE_ACCESS_TOKEN || env.SQUARE_ACCESS_TOKEN.startsWith("paste_")) throw new CheckoutError("Online payment is not available yet. Please email the bakery to arrange your order.", 503);
    if (env.SQUARE_ENVIRONMENT && !["sandbox", "production"].includes(env.SQUARE_ENVIRONMENT)) throw new CheckoutError("Online payment is not available yet. Please contact the bakery.", 503);
    if (payload.action && !["create", "verify"].includes(payload.action)) throw new CheckoutError("Unknown checkout action.");
    return json(200, payload.action === "verify" ? await verifyPayment(payload, env, fetcher) : await createPayment(payload, env, fetcher));
  } catch (error) {
    return json(error instanceof CheckoutError ? error.status : 502, { message: error instanceof CheckoutError ? error.message : "We could not reach Square. Please try again or email the bakery. If you already paid, check your receipt before trying again." });
  }
}
