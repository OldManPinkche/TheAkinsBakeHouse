import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";

const root = new URL("../", import.meta.url);
const sources = ["assets/order-rules.js", "assets/config.js", "assets/site.js"].map(file => fs.readFileSync(new URL(file, root), "utf8"));
const tick = () => new Promise(resolve => setImmediate(resolve));
function setup({ page = "checkout.html", query = "", cart = [], pending, savedHistory, fetcher } = {}) {
  const errors = [];
  const console = new VirtualConsole();
  console.on("jsdomError", error => { if (!error.message.includes("navigation")) errors.push(error); });
  const dom = new JSDOM(fs.readFileSync(new URL(page, root), "utf8"), { url: `http://localhost:8888/${page}${query}`, runScripts: "outside-only", virtualConsole: console });
  const w = dom.window;
  w.AbortSignal = AbortSignal;
  w.localStorage.setItem("akinsBakeHouseCurrentOrder", JSON.stringify(cart));
  if (pending) w.sessionStorage.setItem("akinsPendingPayment", JSON.stringify(pending));
  if (savedHistory) w.localStorage.setItem("akinsBakeHouseOrderHistory", JSON.stringify(savedHistory));
  const requests = [];
  w.fetch = async (url, init) => {
    requests.push({ url, body: JSON.parse(init.body) });
    return fetcher ? fetcher(url, init) : Response.json({ message: "Test backend unavailable" }, { status: 503 });
  };
  sources.forEach(source => w.eval(source));
  const get = selector => w.document.querySelector(selector);
  const fill = (selector, text) => { get(selector).value = text; get(selector).dispatchEvent(new w.Event("input", { bubbles: true })); };
  return { dom, w, get, fill, requests, errors };
}
const details = ui => { ui.fill("#customer-name", "Review Test"); ui.fill("#customer-contact", "test@example.invalid"); ui.fill("#pickup-date", "2099-10-10"); };

test("plain and customized dozens remain separate through quantity changes, refresh, and checkout", async () => {
  const menu = setup({ page: "menu.html" });
  const button = menu.get('[data-item-name="Cinnamon Rolls"]');
  const card = button.closest("article");
  const select = card.querySelector(".bake-options select");
  button.click();
  select.value = "raisins-pecans"; select.dispatchEvent(new menu.w.Event("change")); button.click();
  select.value = "pecans"; select.dispatchEvent(new menu.w.Event("change")); button.click();
  assert.equal(menu.get("#menu-cart-total").textContent, "$104");
  assert.equal(menu.get("#menu-cart-lines").querySelectorAll(".cart-row").length, 3);
  menu.get('button[aria-label="Add one Cinnamon Rolls — Add pecans"]').click();
  assert.equal(menu.get("#menu-cart-total").textContent, "$140");
  menu.get('button[aria-label="Remove one Cinnamon Rolls"]').click();
  assert.equal(menu.get("#menu-cart-total").textContent, "$110");
  const cart = JSON.parse(menu.w.localStorage.getItem("akinsBakeHouseCurrentOrder"));
  assert.deepEqual(cart.map(item => item.option), ["raisins-pecans", "pecans", "pecans"]);
  const checkout = setup({ cart }); details(checkout);
  assert.match(checkout.get("#checkout-lines").textContent, /Add raisins \+ pecans/);
  assert.match(checkout.get("#checkout-lines").textContent, /Add pecans ×2/);
  assert.equal(checkout.get("#square-pay-button").textContent, "Pay $110 With Square");
  checkout.get("#square-pay-button").click(); await tick();
  assert.equal(checkout.requests.length, 1);
  assert.deepEqual(checkout.requests[0].body.items, [
    { name: "Cinnamon Rolls", quantity: 1, option: "raisins-pecans", request: "" },
    { name: "Cinnamon Rolls", quantity: 2, option: "pecans", request: "" }
  ]);
  assert.equal(checkout.requests[0].body.totals.dueToday, 110);
  assert.deepEqual(menu.errors, []); assert.deepEqual(checkout.errors, []);
  menu.dom.window.close(); checkout.dom.window.close();
});

test("custom requests require bounded text and copied orders preserve each bake's request", async () => {
  const menu = setup({ page: "menu.html" });
  const button = menu.get('[data-item-name="Banana Bread"]');
  const card = button.closest("article");
  const select = card.querySelector("select");
  const input = card.querySelector("input");
  select.value = "custom"; select.dispatchEvent(new menu.w.Event("change"));
  button.click();
  assert.equal(menu.get("#menu-cart").classList.contains("is-empty"), true);
  assert.equal(input.getAttribute("aria-invalid"), "true");
  input.value = "x".repeat(201); button.click();
  assert.equal(menu.get("#menu-cart").classList.contains("is-empty"), true);
  const request = "Please add walnuts. ".padEnd(200, "x");
  input.value = request; button.click();
  const cart = JSON.parse(menu.w.localStorage.getItem("akinsBakeHouseCurrentOrder"));
  const checkout = setup({ cart });
  checkout.get("#copy-request").click(); await tick();
  assert.match(checkout.get("#copy-fallback").value, /Banana Bread — Something else/);
  assert.ok(checkout.get("#copy-fallback").value.includes(request));
  assert.match(checkout.get("#copy-fallback").value, /estimate; final quote needed/);
  assert.deepEqual(menu.errors, []); assert.deepEqual(checkout.errors, []);
  menu.dom.window.close(); checkout.dom.window.close();
});

test("saved favorites and checkout quick-add retain ingredient choices", () => {
  const ui = setup(); details(ui);
  const select = ui.get("#menu-item"); select.value = "Pumpkin Bread";
  select.dispatchEvent(new ui.w.Event("change"));
  const options = ui.get(".quick-add-options select"); options.value = "chocolate-chips";
  options.dispatchEvent(new ui.w.Event("change"));
  ui.get("#add-selected-item").click(); ui.get("#save-order-history").click();
  const savedHistory = JSON.parse(ui.w.localStorage.getItem("akinsBakeHouseOrderHistory"));
  const restored = setup({ savedHistory }); details(restored);
  restored.get("#returning-orders button").click();
  assert.match(restored.get("#selected-bakes").textContent, /Add chocolate chips/);
  assert.equal(restored.get("#checkout-total").textContent, "$14");
  assert.equal(restored.get("#square-pay-button").textContent, "Pay $14 With Square");
  assert.deepEqual(ui.errors, []); assert.deepEqual(restored.errors, []);
  ui.dom.window.close(); restored.dom.window.close();
});

test("the item limit applies across all ingredient choices", () => {
  const ui = setup({ page: "menu.html", cart: Array(19).fill("Cinnamon Rolls") });
  const button = ui.get('[data-item-name="Cinnamon Rolls"]');
  const select = button.closest("article").querySelector("select");
  select.value = "pecans"; select.dispatchEvent(new ui.w.Event("change")); button.click();
  select.value = "raisins"; select.dispatchEvent(new ui.w.Event("change")); button.click();
  assert.equal(ui.get("[data-cart-count]").textContent, "20");
  assert.match(ui.get("#menu-cart-status").textContent, /up to 20/);
  assert.equal(JSON.parse(ui.w.localStorage.getItem("akinsBakeHouseCurrentOrder")).filter(item => item.option === "raisins").length, 0);
  ui.dom.window.close();
});

test("dropdowns disclose per-batch extras and additional notes still require a quote", async () => {
  const menu = setup({ page: "menu.html" });
  const button = menu.get('[data-item-name="Cinnamon Rolls"]');
  const card = button.closest("article");
  const select = card.querySelector("select");
  const input = card.querySelector("input");
  assert.match(select.querySelector('[value="pecans"]').textContent, /\+\$6/);
  assert.match(select.querySelector('[value="maple-pecans"]').textContent, /\+\$8/);
  assert.match(select.querySelector('[value="custom"]').textContent, /quote/);
  select.value = "maple-pecans"; select.dispatchEvent(new menu.w.Event("change"));
  assert.equal(card.querySelector(".price-line").textContent, "$38 per dozen");
  assert.equal(button.textContent, "Add to order");
  assert.match(card.querySelector(".option-help").textContent, /per dozen/);
  input.value = "Add extra chocolate chips too"; input.dispatchEvent(new menu.w.Event("input"));
  assert.equal(button.textContent, "Request quote");
  button.click();
  const checkout = setup({ cart: JSON.parse(menu.w.localStorage.getItem("akinsBakeHouseCurrentOrder")) }); details(checkout);
  assert.equal(checkout.get("#checkout-total").textContent, "$38+");
  assert.equal(checkout.get("#square-pay-button").textContent, "Email Quote Request");
  checkout.get("#square-pay-button").click(); await tick();
  assert.equal(checkout.requests.length, 0);
  checkout.get("#copy-request").click(); await tick();
  assert.match(checkout.get("#copy-fallback").value, /Maple glaze \+ pecans/);
  assert.match(checkout.get("#copy-fallback").value, /extra chocolate chips/);
  assert.match(checkout.get("#copy-fallback").value, /\$38\+/);
  input.value = ""; input.dispatchEvent(new menu.w.Event("input"));
  assert.equal(button.getAttribute("aria-label"), "Add to order Cinnamon Rolls");
  select.value = "original"; select.dispatchEvent(new menu.w.Event("change"));
  assert.equal(card.querySelector(".price-line").textContent, "$30 per dozen");
  assert.deepEqual(menu.errors, []); assert.deepEqual(checkout.errors, []);
  menu.dom.window.close(); checkout.dom.window.close();
});

test("homepage item query is consumed and refreshing cannot charge for another item", () => {
  const first = setup({ query: "?item=Cookie+Drop", cart: ["Cinnamon Rolls"] });
  assert.equal(first.get("#checkout-total").textContent, "$48");
  assert.equal(first.w.location.search, "");
  const stored = JSON.parse(first.w.localStorage.getItem("akinsBakeHouseCurrentOrder"));
  const refreshed = setup({ cart: stored });
  assert.equal(refreshed.get("#checkout-total").textContent, "$48");
  assert.deepEqual(first.errors, []);
  first.dom.window.close(); refreshed.dom.window.close();
});
test("malformed saved cart and order history do not crash checkout", () => {
  const ui = setup({ cart: ["constructor", null, "Cookie Drop"], savedHistory: { "test@example.invalid": [null, { total: 1, lines: [null] }] } });
  details(ui);
  assert.equal(ui.get("#checkout-total").textContent, "$18");
  assert.deepEqual(ui.errors, []); ui.dom.window.close();
});
test("quantity cap is enforced by menu buttons", () => {
  const ui = setup({ page: "menu.html" });
  const button = ui.get('[data-item-name="Cinnamon Rolls"]');
  for (let i = 0; i < 21; i++) button.click();
  assert.equal(ui.get("#menu-cart-total").textContent, "$600");
  assert.match(ui.get("#menu-cart-status").textContent, /up to 20/);
  ui.dom.window.close();
});

test("homepage additions stay in the cart and quantity controls preserve totals, limits, and focus", () => {
  const ui = setup({ page: "index.html" });
  const click = label => ui.get(`button[aria-label="${label}"]`).click();
  ui.get('[data-item-name="Cinnamon Rolls"]').click();
  assert.equal(ui.w.location.pathname, "/index.html");
  assert.equal(ui.get("#menu-cart").classList.contains("is-empty"), false);
  click("Add one Cinnamon Rolls");
  assert.equal(ui.get("#menu-cart-total").textContent, "$60");
  assert.equal(ui.w.document.activeElement.getAttribute("aria-label"), "Add one Cinnamon Rolls");
  for (let i = 0; i < 20; i++) click("Add one Cinnamon Rolls");
  assert.equal(ui.get("#menu-cart-total").textContent, "$600");
  assert.equal(ui.get("[data-cart-count]").textContent, "20");
  for (let i = 0; i < 20; i++) click("Remove one Cinnamon Rolls");
  assert.equal(ui.get("#menu-cart").classList.contains("is-empty"), true);
  assert.equal(ui.get("[data-cart-count]").textContent, "0");
  assert.deepEqual(JSON.parse(ui.w.localStorage.getItem("akinsBakeHouseCurrentOrder")), []);
  assert.equal(ui.w.document.activeElement.className, "nav-order");
  assert.deepEqual(ui.errors, []); ui.dom.window.close();
});

test("menu category filters include bundles and quote-only items retain their quote flow", () => {
  const ui = setup({ page: "menu.html" });
  ui.get('[data-menu-filter="boxes"]').click();
  assert.equal(ui.get('[data-menu-category="boxes"]').hidden, false);
  assert.equal(ui.get('[data-menu-category="cakes"]').hidden, true);
  assert.equal(ui.get('[data-menu-filter="boxes"]').getAttribute("aria-pressed"), "true");
  ui.get('[data-item-name="Weekend Favorites Box"]').click();
  assert.equal(ui.get("#menu-cart-total").textContent, "$55+");
  const checkout = setup({ cart: JSON.parse(ui.w.localStorage.getItem("akinsBakeHouseCurrentOrder")) });
  assert.equal(checkout.get("#square-pay-button").textContent, "Email Quote Request");
  assert.equal(checkout.get(".quote-payment").hidden, false);
  ui.get('[data-menu-filter="all"]').click();
  assert.equal([...ui.w.document.querySelectorAll('[data-menu-category]')].every(panel => !panel.hidden), true);
  assert.deepEqual(ui.errors, []); assert.deepEqual(checkout.errors, []);
  ui.dom.window.close(); checkout.dom.window.close();
});
test("invalid contacts and whitespace-only names cannot reach the payment backend", async () => {
  const ui = setup({ cart: ["Cookie Drop"] }); details(ui);
  ui.fill("#customer-contact", "x"); ui.get("#square-pay-button").click(); await tick();
  assert.equal(ui.requests.length, 0); assert.equal(ui.get("#customer-contact").getAttribute("aria-invalid"), "true");
  ui.fill("#customer-contact", "test@example.invalid"); ui.fill("#customer-name", "   "); ui.get("#square-pay-button").click(); await tick();
  assert.equal(ui.requests.length, 0); ui.dom.window.close();
});
test("delivery and custom requests use quote mode without contacting Square", async () => {
  const ui = setup({ cart: ["Cookie Drop"] }); details(ui);
  ui.fill("#fulfillment", "delivery");
  assert.equal(ui.get("#due-today-total").textContent, "No payment yet");
  assert.equal(ui.get("#square-pay-button").textContent, "Email Quote Request");
  ui.get("#square-pay-button").click(); await tick();
  assert.equal(ui.requests.length, 0); assert.match(ui.get("#form-status").textContent, /not submitted yet/);
  ui.fill("#fulfillment", "pickup"); ui.get("#custom-order").click();
  assert.equal(ui.get("#due-today-total").textContent, "No payment yet"); ui.dom.window.close();
});

test("editing a batch previews its price, cancels safely, and merges matching recipes without losing quantity", async () => {
  const pecans = { name: "Cinnamon Rolls", option: "pecans", request: "" };
  const cart = ["Cinnamon Rolls", pecans, pecans, "Banana Bread"];
  const ui = setup({ cart }); details(ui);
  assert.equal(ui.get("#checkout-total").textContent, "$114");
  assert.match(ui.get("#selected-bakes").textContent, /Base \$60 \+ add-ons \$12 = \$72/);
  const open = () => [...ui.w.document.querySelectorAll(".edit-options-button")].find(button => button.getAttribute("aria-label") === "Edit options for Cinnamon Rolls — Add pecans").click();
  open();
  const select = ui.get(".cart-options-editor select");
  assert.equal(select.value, "pecans");
  assert.equal(ui.w.document.activeElement, select);
  select.value = "maple-pecans"; select.dispatchEvent(new ui.w.Event("change", { bubbles: true }));
  assert.match(ui.get(".edit-price-preview").textContent, /2 dozen: \$76/);
  assert.equal(ui.get("#checkout-total").textContent, "$114");
  assert.equal(ui.get("#square-pay-button").disabled, false);
  assert.equal(ui.get("#square-pay-button").textContent, "Finish editing options");
  ui.get("#square-pay-button").click();
  assert.equal(ui.w.document.activeElement, ui.get(".save-options-button"));
  ui.get("#order-form").dispatchEvent(new ui.w.Event("submit", { bubbles: true, cancelable: true })); await tick();
  assert.equal(ui.requests.length, 0);
  ui.get(".cancel-options-button").click();
  assert.deepEqual(JSON.parse(ui.w.localStorage.getItem("akinsBakeHouseCurrentOrder")), cart);
  assert.equal(ui.get(".cart-options-editor"), null);
  assert.equal(ui.get("#square-pay-button").disabled, false);
  open();
  const changed = ui.get(".cart-options-editor select");
  changed.value = "original"; changed.dispatchEvent(new ui.w.Event("change", { bubbles: true }));
  ui.get(".save-options-button").click();
  assert.deepEqual(JSON.parse(ui.w.localStorage.getItem("akinsBakeHouseCurrentOrder")), ["Cinnamon Rolls", "Cinnamon Rolls", "Cinnamon Rolls", "Banana Bread"]);
  assert.equal(ui.get("#selected-bakes").querySelectorAll(".cart-row").length, 2);
  assert.equal(ui.get("#checkout-total").textContent, "$102");
  assert.equal(ui.w.document.activeElement.getAttribute("aria-label"), "Edit options for Cinnamon Rolls");
  assert.deepEqual(ui.errors, []); ui.dom.window.close();
});

test("editing options validates custom notes, preserves them, and switches between quote and fixed-price checkout", async () => {
  const ui = setup({ cart: ["Pumpkin Bread"] }); details(ui);
  ui.get(".edit-options-button").click();
  const select = ui.get(".cart-options-editor select");
  select.value = "custom"; select.dispatchEvent(new ui.w.Event("change", { bubbles: true }));
  ui.get(".save-options-button").click();
  assert.equal(ui.get(".cart-options-editor input").getAttribute("aria-invalid"), "true");
  assert.deepEqual(JSON.parse(ui.w.localStorage.getItem("akinsBakeHouseCurrentOrder")), ["Pumpkin Bread"]);
  ui.fill(".cart-options-editor input", "Chocolate chips and extra walnuts");
  ui.get(".save-options-button").click();
  assert.equal(ui.get("#square-pay-button").textContent, "Email Quote Request");
  assert.equal(ui.get(".secure-note").hidden, true);
  assert.equal(ui.get("#due-today-total").textContent, "No payment yet");
  ui.get("#square-pay-button").click(); await tick();
  assert.equal(ui.requests.length, 0);
  ui.get(".edit-options-button").click();
  assert.equal(ui.get(".cart-options-editor input").value, "Chocolate chips and extra walnuts");
  const fixed = ui.get(".cart-options-editor select");
  fixed.value = "chocolate-chips"; fixed.dispatchEvent(new ui.w.Event("change", { bubbles: true }));
  ui.fill(".cart-options-editor input", "");
  ui.get(".save-options-button").click();
  assert.equal(ui.get("#checkout-total").textContent, "$14");
  assert.equal(ui.get("#square-pay-button").textContent, "Pay $14 With Square");
  assert.equal(ui.get(".secure-note").hidden, false);
  ui.get("#square-pay-button").click(); await tick();
  assert.deepEqual(ui.requests[0].body.items, [{ name: "Pumpkin Bread", option: "chocolate-chips", request: "", quantity: 1 }]);
  assert.equal(ui.requests[0].body.totals.dueToday, 14);
  assert.deepEqual(ui.errors, []); ui.dom.window.close();
});

test("empty orders show browsing instead of payment controls and restore checkout when a bake is added", () => {
  const ui = setup();
  assert.equal(ui.get(".order-empty a").getAttribute("href"), "menu.html");
  assert.equal(ui.get(".square-pay-area").hidden, true);
  assert.equal(ui.get(".square-totals").hidden, true);
  assert.equal(ui.get("#copy-request").hidden, true);
  const select = ui.get("#menu-item");
  select.value = "Cinnamon Rolls"; select.dispatchEvent(new ui.w.Event("change"));
  ui.get("#add-selected-item").click();
  assert.equal(ui.get(".order-empty"), null);
  assert.equal(ui.get(".square-pay-area").hidden, false);
  assert.equal(ui.get(".square-totals").hidden, false);
  ui.get('button[aria-label="Remove one Cinnamon Rolls"]').click();
  assert.ok(ui.get(".order-empty a"));
  assert.equal(ui.get(".square-pay-area").hidden, true);
  assert.equal(ui.get("#copy-request").hidden, true);
  assert.deepEqual(ui.errors, []); ui.dom.window.close();
});
test("quantity buttons work while options are open and preserve unsaved recipe changes", () => {
  const raisins = { name: "Cinnamon Rolls", option: "raisins", request: "" };
  const ui = setup({ cart: [raisins] });
  ui.get(".edit-options-button").click();
  const option = ui.get(".cart-options-editor select");
  option.value = "maple-pecans"; option.dispatchEvent(new ui.w.Event("change", { bubbles: true }));
  ui.fill(".cart-options-editor input", "Extra cinnamon");
  for (let quantity = 2; quantity <= 4; quantity++) {
    const plus = ui.get('button[aria-label="Add one Cinnamon Rolls — Add raisins"]');
    assert.equal(plus.disabled, false); plus.click();
    assert.equal(ui.get(".quantity-input").value, String(quantity));
    assert.equal(ui.get("#checkout-total").textContent, `$${quantity * 34}`);
    assert.equal(ui.get(".cart-options-editor select").value, "maple-pecans");
    assert.equal(ui.get(".cart-options-editor input").value, "Extra cinnamon");
    assert.ok(ui.get(".edit-price-preview").textContent.includes(`${quantity} dozen: $${quantity * 38}`));
  }
  ui.get('button[aria-label="Remove one Cinnamon Rolls — Add raisins"]').click();
  ui.get(".save-options-button").click();
  assert.equal(ui.get(".quantity-input").value, "3");
  assert.equal(ui.get("#checkout-total").textContent, "$114+");
  assert.deepEqual(JSON.parse(ui.w.localStorage.getItem("akinsBakeHouseCurrentOrder")), Array(3).fill({ name: "Cinnamon Rolls", option: "maple-pecans", request: "Extra cinnamon" }));
  ui.get(".edit-options-button").click();
  ui.fill(".quantity-input", "1");
  ui.get(".quantity-control button").click();
  assert.ok(ui.get(".order-empty a"));
  assert.equal(ui.get(".cart-options-editor"), null);
  assert.deepEqual(ui.errors, []); ui.dom.window.close();
});

test("typing quantities keeps keyboard focus, saves totals, and sends the correct checkout quantity", async () => {
  const ui = setup({ cart: [{ name: "Cinnamon Rolls", option: "raisins", request: "" }] }); details(ui);
  for (const quantity of [2, 3, 4, 1, 12]) {
    ui.get(".quantity-input").focus();
    ui.fill(".quantity-input", String(quantity));
    assert.equal(ui.get("#checkout-total").textContent, `$${quantity * 34}`);
    assert.equal(ui.w.document.activeElement, ui.get(".quantity-input"));
    assert.equal(ui.get(".quantity-input").selectionStart, String(quantity).length);
    assert.equal(JSON.parse(ui.w.localStorage.getItem("akinsBakeHouseCurrentOrder")).length, quantity);
  }
  const enter = new ui.w.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
  ui.get(".quantity-input").dispatchEvent(enter);
  assert.equal(enter.defaultPrevented, true);
  assert.equal(ui.requests.length, 0);
  ui.get("#square-pay-button").click(); await tick();
  assert.deepEqual(ui.requests[0].body.items, [{ name: "Cinnamon Rolls", option: "raisins", request: "", quantity: 12 }]);
  assert.equal(ui.requests[0].body.totals.dueToday, 408);
  assert.deepEqual(ui.errors, []); ui.dom.window.close();
});

test("typed quantities reject invalid values and respect the cap across recipe variations", async () => {
  const ui = setup({ cart: ["Cinnamon Rolls", { name: "Cinnamon Rolls", option: "pecans", request: "" }] }); details(ui);
  for (const invalid of ["", "0", "-1", "1.5", "abc", "20"]) {
    ui.fill(".quantity-input", invalid);
    assert.equal(ui.get(".quantity-input").checkValidity(), false);
    assert.equal(ui.get(".quantity-input").getAttribute("aria-invalid"), "true");
    assert.equal(ui.get("#checkout-total").textContent, "$66");
    assert.equal(JSON.parse(ui.w.localStorage.getItem("akinsBakeHouseCurrentOrder")).length, 2);
    ui.get("#square-pay-button").click(); await tick();
    assert.equal(ui.requests.length, 0);
  }
  ui.get(".quantity-input").dispatchEvent(new ui.w.Event("blur"));
  assert.equal(ui.get(".quantity-input").value, "1");
  assert.equal(ui.get(".quantity-input").checkValidity(), true);
  ui.fill(".quantity-input", "19");
  assert.equal(ui.get("#checkout-total").textContent, "$606");
  assert.equal(JSON.parse(ui.w.localStorage.getItem("akinsBakeHouseCurrentOrder")).length, 20);
  assert.deepEqual(ui.errors, []); ui.dom.window.close();
});

test("checkout preserves full notes and records only its submitted cart snapshot", async () => {
  const ui = setup({ cart: ["Cookie Drop"], fetcher: async () => Response.json({ checkoutUrl: "https://square.link/u/test", orderId: "test-order", verificationToken: "signed-test-token" }) });
  details(ui); const notes = "x".repeat(1000); ui.fill("#notes", notes); ui.get("#square-pay-button").click();
  await tick(); await tick();
  assert.equal(ui.requests[0].url, "/api/create-square-checkout");
  assert.equal(ui.requests[0].body.notes, notes);
  assert.deepEqual(JSON.parse(ui.w.sessionStorage.getItem("akinsPendingPayment")).items, ["Cookie Drop"]);
  ui.dom.window.close();
});
test("URL alone never displays payment received or clears the cart", async () => {
  const ui = setup({ query: "?square=paid", cart: ["Cookie Drop"] }); await tick();
  assert.match(ui.get("#payment-result-message").textContent, /cannot verify/);
  assert.equal(ui.get("#checkout-total").textContent, "$18"); assert.equal(ui.requests.length, 0); ui.dom.window.close();
});
test("server-confirmed payment clears the matching cart and consumes the return URL", async () => {
  const ui = setup({ query: "?square=return", cart: ["Cookie Drop"], pending: { token: "signed-test-token", orderId: "test-order", items: ["Cookie Drop"] }, fetcher: async () => Response.json({ paid: true, orderId: "test-order" }) });
  await tick(); await tick();
  assert.equal(ui.get("#checkout-total").textContent, "$0"); assert.match(ui.get("#payment-result-message").textContent, /Payment confirmed by Square/);
  assert.equal(ui.w.location.search, ""); assert.equal(ui.w.sessionStorage.getItem("akinsPendingPayment"), null); ui.dom.window.close();
});
test("verification preserves a cart changed while the customer was at Square", async () => {
  const ui = setup({ query: "?square=return", cart: ["Cookie Drop", "Pumpkin Bread"], pending: { token: "signed-test-token", orderId: "test-order", items: ["Cookie Drop"] }, fetcher: async () => Response.json({ paid: true, orderId: "test-order" }) });
  await tick(); await tick();
  assert.equal(ui.get("#checkout-total").textContent, "$30"); assert.match(ui.get("#payment-result-message").textContent, /we kept it/); ui.dom.window.close();
});
test("unpaid and failed verification preserve the cart with a retry option", async () => {
  for (const result of [{ paid: false }, null]) {
    const ui = setup({ query: "?square=return", cart: ["Cookie Drop"], pending: { token: "signed-test-token", orderId: "test-order", items: ["Cookie Drop"] }, fetcher: async () => result ? Response.json(result) : Response.json({}, { status: 502 }) });
    await tick(); await tick();
    assert.equal(ui.get("#checkout-total").textContent, "$18"); assert.equal(ui.get("#check-payment").hidden, false);
    assert.doesNotMatch(ui.get("#payment-result-message").textContent, /Payment confirmed/); ui.dom.window.close();
  }
});
