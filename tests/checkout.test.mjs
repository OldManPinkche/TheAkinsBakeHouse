import test from "node:test";
import assert from "node:assert/strict";
import { handleRequest } from "../server/square-checkout.mjs";
import rules from "../assets/order-rules.js";

const env = { SQUARE_ACCESS_TOKEN: "test-token-never-sent", SQUARE_LOCATION_ID: "test-location", SQUARE_ENVIRONMENT: "sandbox" };
const order = () => ({ action: "create", requestId: "test-attempt-1", items: [{ name: "Cinnamon Rolls", quantity: 1 }], customer: { name: "Review Test", contact: "test@example.invalid" }, pickupDate: "2099-10-10", pickupTime: "Afternoon", notes: "Please keep these complete instructions.", occasion: "Birthday", fulfillment: "pickup", customOrder: false, totals: { dueToday: 30 }, returnUrl: "http://localhost:8888/checkout.html?item=Cookie%20Drop" });
const request = (payload, origin = "http://localhost:8888") => new Request("https://example.invalid/api", { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(payload) });
function mockSquare(options = {}) {
  const calls = [];
  const fetcher = async (url, init) => {
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url, body });
    if (options.networkError) throw new Error("Offline");
    if (options.apiFailure) return Response.json({ errors: [{ detail: "Private provider failure" }] }, { status: 401 });
    if (url.endsWith("/online-checkout/payment-links")) return Response.json({ payment_link: { order_id: "test-order", url: "https://square.link/u/test" } });
    if (url.endsWith("/locations")) return Response.json({ locations: [{ id: "inactive", currency: "USD", status: "INACTIVE" }, { id: "test-location", currency: "USD", status: "ACTIVE" }] });
    if (url.endsWith("/orders/test-order")) return Response.json({ order: { id: "test-order", location_id: "test-location", total_money: { amount: options.wrongTotal ? 100 : 3000, currency: "USD" }, state: "OPEN", tenders: options.noTender ? [] : [{ payment_id: "test-payment" }] } });
    if (url.endsWith("/payments/test-payment")) return Response.json({ payment: { id: "test-payment", order_id: options.wrongOrder ? "other-order" : "test-order", location_id: "test-location", status: options.paymentStatus || "COMPLETED", amount_money: { amount: options.partial ? 1000 : 3000, currency: "USD" }, refunded_money: { amount: options.refunded ? 3000 : 0, currency: "USD" } } });
    throw new Error(`Unexpected mocked request ${url}`);
  };
  return { calls, fetcher };
}

test("full 1000-character customer notes survive, totals are server-priced, and redirects consume item parameters", async () => {
  const mock = mockSquare(); const payload = order();
  payload.notes = "A".repeat(980) + "ALLERGY DETAILS HERE";
  const response = await handleRequest(request(payload), env, mock.fetcher);
  assert.equal(response.status, 200);
  const sent = mock.calls[0].body;
  assert.ok(sent.order.line_items[0].note.endsWith(payload.notes));
  assert.ok(sent.order.line_items[0].note.length <= 2000);
  assert.ok(sent.payment_note.length <= 500);
  assert.equal(sent.order.line_items[0].base_price_money.amount, 3000);
  assert.equal(sent.checkout_options.redirect_url, "http://localhost:8888/checkout.html?square=return");
  assert.ok((await response.json()).verificationToken);
});

test("identical checkout retries reuse the idempotency key; changed details get a new key", async () => {
  const mock = mockSquare(); const payload = order();
  await handleRequest(request(payload), env, mock.fetcher);
  await handleRequest(request(payload), env, mock.fetcher);
  await handleRequest(request({ ...payload, notes: "Changed instructions" }), env, mock.fetcher);
  assert.equal(mock.calls[0].body.idempotency_key, mock.calls[1].body.idempotency_key);
  assert.notEqual(mock.calls[1].body.idempotency_key, mock.calls[2].body.idempotency_key);
});

for (const [label, change] of [
  ["null body", () => null], ["array body", () => []],
  ["null item", p => ({ ...p, items: [null] })],
  ["unknown item", p => ({ ...p, items: [{ name: "constructor", quantity: 1 }] })],
  ["fractional quantity", p => ({ ...p, items: [{ name: "Cinnamon Rolls", quantity: 1.5 }] })],
  ["string quantity", p => ({ ...p, items: [{ name: "Cinnamon Rolls", quantity: "1x" }] })],
  ["duplicate items over cap", p => ({ ...p, items: [{ name: "Cinnamon Rolls", quantity: 15 }, { name: "Cinnamon Rolls", quantity: 6 }], totals: { dueToday: 630 } })],
  ["quote-only item", p => ({ ...p, items: [{ name: "Weekend Favorites Box", quantity: 1 }], totals: { dueToday: 55 } })],
  ["add-ins cannot be charged as the original recipe", p => ({ ...p, items: [{ name: "Cinnamon Rolls", quantity: 1, option: "pecans", request: "" }] })],
  ["an unpriced custom request cannot be charged", p => ({ ...p, items: [{ name: "Cinnamon Rolls", quantity: 1, option: "custom", request: "Please add walnuts" }] })],
  ["a priced add-on with extra requests still needs a quote", p => ({ ...p, items: [{ name: "Cinnamon Rolls", quantity: 1, option: "pecans", request: "Add chocolate chips too" }], totals: { dueToday: 36 } })],
  ["unpriced flavor choices stay quote-only", p => ({ ...p, items: [{ name: "Cake Pops", quantity: 1, option: "mixed-flavors" }], totals: { dueToday: 30 } })],
  ["forged add-on prices cannot bypass server pricing", p => ({ ...p, items: [{ name: "Cinnamon Rolls", quantity: 1, option: "maple-pecans", price: 0, extra: 0, unitPrice: 30, needsQuote: false }] })],
  ["unknown ingredient choice", p => ({ ...p, items: [{ name: "Cinnamon Rolls", quantity: 1, option: "unlisted" }] })],
  ["custom details cannot be hidden under original recipe", p => ({ ...p, items: [{ name: "Cinnamon Rolls", quantity: 1, option: "original", request: "Add pecans" }] })],
  ["non-text custom details", p => ({ ...p, items: [{ name: "Cinnamon Rolls", quantity: 1, option: "pecans", request: {} }] })],
  ["cookie cake needs its size quoted", p => ({ ...p, items: [{ name: "Cookie Cakes", quantity: 1 }], totals: { dueToday: 30 } })],
  ["Butterfinger cake needs its size quoted", p => ({ ...p, items: [{ name: "Butterfinger Cake", quantity: 1 }], totals: { dueToday: 28 } })],
  ["cheesecake needs its size quoted", p => ({ ...p, items: [{ name: "Cheesecake", quantity: 1 }], totals: { dueToday: 35 } })],
  ["pudding needs its portions quoted", p => ({ ...p, items: [{ name: "Banana Pudding", quantity: 1 }], totals: { dueToday: 20 } })],
  ["delivery requires quote", p => ({ ...p, fulfillment: "delivery" })],
  ["custom order requires quote", p => ({ ...p, customOrder: true })],
  ["invalid contact", p => ({ ...p, customer: { ...p.customer, contact: "xxxxx" } })],
  ["impossible date", p => ({ ...p, pickupDate: "2099-02-31" })],
  ["past date", p => ({ ...p, pickupDate: "2020-01-01" })],
  ["notes too long", p => ({ ...p, notes: "x".repeat(1001) })],
  ["wrong total", p => ({ ...p, totals: { dueToday: 1 } })],
  ["zero total", p => ({ ...p, totals: { dueToday: 0 } })],
  ["untrusted redirect", p => ({ ...p, returnUrl: "https://example.invalid/steal" })]
]) test(`rejects ${label} before contacting Square`, async () => {
  const mock = mockSquare();
  const response = await handleRequest(request(change(order())), env, mock.fetcher);
  assert.equal(response.status, 400);
  assert.equal(mock.calls.length, 0);
});

test("approved add-ons are server-priced and distinct recipes reach Square as separate lines", async () => {
  const mock = mockSquare();
  const payload = { ...order(), items: [
    { name: "Cinnamon Rolls", quantity: 1 },
    { name: "Cinnamon Rolls", quantity: 1, option: "pecans" },
    { name: "Cinnamon Rolls", quantity: 1, option: "maple-pecans" },
    { name: "Cinnamon Rolls", quantity: 1, option: "pecans" },
    { name: "Banana Bread", quantity: 1, option: "chocolate-chips" }
  ], totals: { dueToday: 154 } };
  const response = await handleRequest(request(payload), env, mock.fetcher);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).total, 154);
  const lines = mock.calls[0].body.order.line_items;
  assert.deepEqual(lines.map(line => [line.name, line.quantity, line.base_price_money.amount]), [
    ["Cinnamon Rolls", "1", 3000],
    ["Cinnamon Rolls — Add pecans", "2", 3600],
    ["Cinnamon Rolls — Maple glaze + pecans", "1", 3800],
    ["Banana Bread — Add chocolate chips", "1", 1400]
  ]);
  assert.ok(lines[0].note.includes(payload.notes));
  const changed = structuredClone(payload);
  changed.items[2].option = "raisins-pecans"; // Same price, different recipe.
  await handleRequest(request(changed), env, mock.fetcher);
  assert.notEqual(mock.calls[0].body.idempotency_key, mock.calls[1].body.idempotency_key);
});

test("more than seventeen priced variants are supported without losing per-bake quantity limits", async () => {
  const items = rules.menuItems.flatMap(item => rules.optionsFor(item.name)
    .filter(option => option.id !== "original" && !rules.priceSelection({ name: item.name, option: option.id })?.needsQuote && option.price !== null)
    .map(option => ({ name: item.name, option: option.id, quantity: 1 }))).slice(0, 18);
  assert.equal(items.length, 18);
  const total = items.reduce((sum, item) => sum + rules.priceSelection(item).unitPrice, 0);
  const mock = mockSquare();
  const response = await handleRequest(request({ ...order(), items, totals: { dueToday: total } }), env, mock.fetcher);
  assert.equal(response.status, 200);
  assert.equal(mock.calls[0].body.order.line_items.length, 18);
  const tooMany = { ...order(), items: [{ name: "Cinnamon Rolls", option: "pecans", quantity: 15 }, { name: "Cinnamon Rolls", option: "maple-pecans", quantity: 6 }], totals: { dueToday: 768 } };
  const rejected = await handleRequest(request(tooMany), env, mock.fetcher);
  assert.equal(rejected.status, 400);
  assert.equal(mock.calls.length, 1);
});

test("date validation uses Oklahoma's date around UTC midnight and rejects rollover dates", () => {
  const now = new Date("2026-09-22T02:30:00Z");
  assert.equal(rules.todayInOklahoma(now), "2026-09-21");
  assert.equal(rules.validDate("2026-09-21", now), true);
  assert.equal(rules.validDate("2027-02-29", now), false);
});
test("contact and saved-cart input is sanitized", () => {
  assert.equal(rules.validContact("(405) 555-0123"), true);
  assert.equal(rules.validContact("x"), false);
  assert.equal(rules.validContact("name@domain"), false);
  assert.equal(rules.sanitizeCart(["constructor", null, ...Array(25).fill("Cookie Drop")]).length, 20);
  assert.deepEqual(rules.sanitizeCart({}), []);
});

test("old carts and valid options survive sanitizing; invalid options never become plain orders", () => {
  const pecans = { name: "Cinnamon Rolls", option: "pecans", request: "" };
  const sanitized = rules.sanitizeCart(["Cinnamon Rolls", pecans, { name: "Banana Bread", option: "raisins-pecans", request: "Extra raisins, please" }, { name: "Cinnamon Rolls", option: "unlisted" }, { name: "Banana Bread", option: "custom", request: "" }, { name: "Banana Bread", option: "custom", request: "x".repeat(201) }]);
  assert.equal(sanitized.length, 3);
  assert.deepEqual(sanitized[0], "Cinnamon Rolls");
  assert.deepEqual(sanitized[1], pecans);
  assert.equal(sanitized[2].request, "Extra raisins, please");
  assert.equal(rules.sanitizeCart([...Array(19).fill("Cinnamon Rolls"), pecans, pecans]).length, 20);
});
test("preflight permits both bakery hosts and localhost, and rejects unrelated origins", async () => {
  for (const origin of ["http://localhost:8888", "http://127.0.0.1:5500", "https://theakinsbakehouse.com", "https://www.theakinsbakehouse.com"]) {
    const response = await handleRequest(new Request("https://example.invalid", { method: "OPTIONS", headers: { Origin: origin } }), env);
    assert.equal(response.status, 204); assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);
  }
  const mock = mockSquare();
  const response = await handleRequest(request(order(), "https://example.invalid"), env, mock.fetcher);
  assert.equal(response.status, 403); assert.equal(mock.calls.length, 0);
});
test("missing setup and provider failures return customer-friendly messages", async () => {
  const unavailable = await handleRequest(request(order()), {}, mockSquare().fetcher);
  assert.equal(unavailable.status, 503);
  const failure = await handleRequest(request(order()), env, mockSquare({ apiFailure: true }).fetcher);
  assert.equal(failure.status, 502); assert.ok(!(await failure.text()).includes("Private provider"));
});
test("automatic location lookup chooses an active USD location", async () => {
  const mock = mockSquare();
  assert.equal((await handleRequest(request(order()), { ...env, SQUARE_LOCATION_ID: "auto" }, mock.fetcher)).status, 200);
  assert.equal(mock.calls[1].body.order.location_id, "test-location");
});

for (const [label, options, paid] of [
  ["completed payment", {}, true], ["unpaid order", { noTender: true }, false],
  ["authorization only", { paymentStatus: "APPROVED" }, false],
  ["partial payment", { partial: true }, false], ["refunded payment", { refunded: true }, false],
  ["different order's payment", { wrongOrder: true }, false], ["changed order total", { wrongTotal: true }, false]
]) test(`verification handles ${label}`, async () => {
  const mock = mockSquare(options);
  const created = await (await handleRequest(request(order()), env, mock.fetcher)).json();
  const response = await handleRequest(request({ action: "verify", verificationToken: created.verificationToken }), env, mock.fetcher);
  assert.equal(response.status, 200); assert.equal((await response.json()).paid, paid);
});
test("forged verification tokens never contact Square", async () => {
  const mock = mockSquare();
  const created = await (await handleRequest(request(order()), env, mock.fetcher)).json();
  const [payload, signature] = created.verificationToken.split(".");
  const forged = `${payload}.${signature[0] === "0" ? "1" : "0"}${signature.slice(1)}`;
  const before = mock.calls.length;
  const response = await handleRequest(request({ action: "verify", verificationToken: forged }), env, mock.fetcher);
  assert.equal(response.status, 400); assert.equal(mock.calls.length, before);
});
