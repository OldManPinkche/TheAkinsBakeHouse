"use strict";
const rules = window.BakeHouseRules;
const { menuItems, priceBook, limits, hasItem, cartName, cartKey, cartDetails, cartLabel } = rules;
const $ = selector => document.querySelector(selector);
const money = amount => `$${amount.toFixed(amount % 1 === 0 ? 0 : 2)}`;
const value = id => $(`#${id}`)?.value.trim() || "";
const keys = { cart: "akinsBakeHouseCurrentOrder", history: "akinsBakeHouseOrderHistory", draft: "akinsCheckoutDraft", pending: "akinsPendingPayment", request: "akinsCheckoutRequest" };
const email = "theakinsbakehouse@yahoo.com";
const localPreview = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
const endpoint = localPreview ? window.BakeHouseConfig.localCheckoutEndpoint : window.BakeHouseConfig.checkoutEndpoint;
let selectedItems = rules.sanitizeCart(readStorage("localStorage", keys.cart, []));
let busy = false;
let checkingPayment = false;
let errorsVisible = false;
let cartMemory = [...selectedItems];
let statusTimer;
let customizerId = 0;
let editingLine = null;
const fieldIds = ["customer-name", "customer-contact", "pickup-date", "pickup-time", "occasion", "notes", "fulfillment", "custom-order"];

function readStorage(storage, key, fallback) {
  try { return JSON.parse(window[storage].getItem(key)) ?? fallback; } catch { return fallback; }
}
function saveStorage(storage, key, data) {
  try { window[storage].setItem(key, JSON.stringify(data)); return true; } catch { return false; }
}
function removeStorage(storage, key) { try { window[storage].removeItem(key); } catch {} }
function status(message) {
  const target = $("#form-status") || $("#menu-cart-status");
  if (target) {
    target.textContent = message;
    window.clearTimeout(statusTimer);
    if (target.id === "menu-cart-status") statusTimer = window.setTimeout(() => { target.textContent = ""; }, 4000);
  }
}
function persistCart() {
  cartMemory = [...selectedItems];
  if (!saveStorage("localStorage", keys.cart, selectedItems)) {
    status("This browser cannot save your cart. Keep this page open, or enable site storage before leaving the page.");
  }
}
function summary() {
  const counts = new Map();
  selectedItems.forEach(entry => {
    const key = cartKey(entry);
    const previous = counts.get(key);
    if (previous) previous.quantity++;
    else counts.set(key, { entry, key, name: cartName(entry), label: cartLabel(entry), quantity: 1, info: priceBook[cartName(entry)] });
  });
  const lines = [...counts.values()].map(line => {
    const pricing = rules.priceSelection(line.entry);
    return { ...line, ...pricing, total: pricing.unitPrice * line.quantity };
  });
  const starting = lines.some(line => line.needsQuote);
  return { lines, total: lines.reduce((sum, line) => sum + line.total, 0), starting, needsQuote: starting || value("fulfillment") === "delivery" || Boolean($("#custom-order")?.checked) };
}
function appendText(parent, tag, text, className) {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  parent.append(element);
  return element;
}
function createCustomizer(name, button, entry = name) {
  const wrapper = document.createElement("div");
  wrapper.className = "bake-options";
  wrapper.dataset.bakeName = name;
  const id = `bake-option-${++customizerId}`;
  const label = appendText(wrapper, "label", "Make it yours");
  label.htmlFor = id;
  const select = appendText(label, "select", "");
  select.id = id;
  select.setAttribute("aria-label", `${name} options`);
  select.setAttribute("aria-describedby", `${id}-help`);
  rules.optionsFor(name).forEach(option => select.add(new Option(`${option.label}${option.id === "original" ? "" : option.price === null ? " — quote" : ` +${money(option.price)}`}`, option.id)));
  const requestLabel = appendText(wrapper, "label", "Additional changes — quote required (optional)", "item-request-label");
  requestLabel.htmlFor = `${id}-request`;
  const input = appendText(requestLabel, "input", "");
  input.id = `${id}-request`;
  input.maxLength = limits.itemRequest;
  input.placeholder = "Tell Taylor what you have in mind";
  input.setAttribute("aria-label", `${name} request details`);
  const helper = appendText(wrapper, "p", "", "option-help");
  helper.id = `${id}-help`;
  if (typeof entry !== "string") { select.value = entry.option; input.value = entry.request; }
  const update = () => {
    const customized = select.value !== "original";
    requestLabel.hidden = !customized;
    helper.hidden = !customized;
    requestLabel.firstChild.textContent = select.value === "custom" ? "Describe your request — quote required" : "Additional changes — quote required (optional)";
    input.removeAttribute("aria-invalid");
    if (!customized) input.value = "";
    const pricing = rules.priceSelection({ name, option: select.value, request: input.value });
    const needsQuote = !pricing || pricing.needsQuote;
    helper.textContent = needsQuote
      ? "This request needs a quote. Taylor confirms availability and the final price before payment."
      : `Add-on prices are ${priceBook[name].label}. Additional changes in the note need a quote.`;
    if (button) {
      const text = needsQuote ? "Request quote" : "Add to order";
      button.dataset.originalText = text;
      button.textContent = text;
      button.setAttribute("aria-label", `${text} ${name}`);
      const price = button.closest("article")?.querySelector("[data-price-name]");
      if (price) price.textContent = `${needsQuote ? "Starting at " : ""}${money(pricing?.unitPrice ?? priceBook[name].price)}${needsQuote ? "" : ` ${priceBook[name].label}`}`;
    }
  };
  select.addEventListener("change", update);
  input.addEventListener("input", update);
  update();
  return wrapper;
}
function readCustomizer(wrapper) {
  const name = wrapper.dataset.bakeName;
  const option = wrapper.querySelector("select").value;
  const input = wrapper.querySelector("input");
  const entry = rules.normalizeCartItem({ name, option, request: option === "original" ? "" : input.value });
  if (!entry) {
    input.setAttribute("aria-invalid", "true");
    status(option === "custom" && !input.value.trim() ? "Tell Taylor what you would like before adding this request." : `Keep each bake's request to ${limits.itemRequest} characters or fewer.`);
    input.focus();
  }
  return entry;
}
function lineUnits(line) {
  const units = { "per dozen": ["dozen", "dozen"], "per loaf": ["loaf", "loaves"], "per pie": ["pie", "pies"] };
  const unit = units[line.info.label] || ["item", "items"];
  return `${line.quantity} ${unit[line.quantity === 1 ? 0 : 1]}`;
}
function priceBreakdown(line) {
  const base = `Base ${money(line.info.price * line.quantity)}`;
  if (line.extra === null) return `${base} + add-ons quoted`;
  return `${base}${line.extra ? ` + add-ons ${money(line.extra * line.quantity)} = ${money(line.total)}` : ""}${line.needsQuote ? " · estimate" : ""}`;
}
function focusEdit(key) {
  [...document.querySelectorAll(".edit-options-button")].find(button => button.dataset.cartKey === key)?.focus({ preventScroll: true });
}
function appendEditor(row, line) {
  const panel = appendText(row, "div", "", "cart-options-editor");
  panel.setAttribute("role", "group");
  panel.setAttribute("aria-label", `Edit ${line.label}`);
  appendText(panel, "p", `Changes apply to ${lineUnits(line)} in this line.`, "edit-scope");
  const customizer = createCustomizer(line.name, null, editingLine.draft);
  panel.append(customizer);
  const preview = appendText(panel, "p", "", "edit-price-preview");
  const updatePreview = () => {
    const option = customizer.querySelector("select").value;
    const request = option === "original" ? "" : customizer.querySelector("input").value;
    editingLine.draft = { name: line.name, option, request };
    const pricing = rules.priceSelection(editingLine.draft);
    preview.textContent = pricing ? `New total for ${lineUnits(line)}: ${money(pricing.unitPrice * line.quantity)}${pricing.needsQuote ? "+ · quote required" : ""}` : "Describe your request so Taylor can prepare a quote.";
    renderPayment();
  };
  customizer.addEventListener("input", updatePreview);
  customizer.addEventListener("change", updatePreview);
  const actions = appendText(panel, "div", "", "edit-options-actions");
  const save = appendText(actions, "button", "Save options", "add-button save-options-button");
  const cancel = appendText(actions, "button", "Cancel", "text-button cancel-options-button");
  save.type = cancel.type = "button";
  save.addEventListener("click", () => {
    const entry = readCustomizer(customizer);
    if (!entry) return;
    selectedItems = selectedItems.map(item => cartKey(item) === line.key ? entry : item);
    editingLine = null;
    persistCart(); renderCart();
    status(`Options updated for ${lineUnits(line)} of ${line.name}.`);
    focusEdit(cartKey(entry));
  });
  cancel.addEventListener("click", () => {
    editingLine = null; renderCart(); focusEdit(line.key);
    status("Option changes canceled. Your quantity is kept.");
  });
  updatePreview();
}
function renderChips(target) {
  if (!target) return;
  target.replaceChildren();
  const order = summary();
  if (!order.lines.length) {
    if (target.id === "selected-bakes") {
      const empty = appendText(target, "div", "", "order-empty");
      appendText(empty, "h3", "Your order is waiting for something sweet.");
      appendText(empty, "p", "Choose your favorites, then come back to arrange pickup.");
      const browse = appendText(empty, "a", "Browse the menu", "button");
      browse.href = "menu.html";
    } else appendText(target, "span", "Choose a bake from the menu to get started.", "empty-state");
    return;
  }
  for (const line of order.lines) {
    const row = appendText(target, "div", "", "cart-row");
    const copy = appendText(row, "div", "", "cart-row-copy");
    appendText(copy, "strong", line.name);
    if (cartDetails(line.entry)) appendText(copy, "span", cartDetails(line.entry), "cart-option-description");
    appendText(copy, "small", `${lineUnits(line)} · ${money(line.unitPrice)}${line.needsQuote ? "+ · quote required" : ` ${line.info.label}`}`);
    appendText(copy, "small", priceBreakdown(line), "price-breakdown");
    if (target.id === "selected-bakes") {
      const edit = appendText(copy, "button", "Edit options", "text-button edit-options-button");
      edit.type = "button";
      edit.dataset.cartKey = line.key;
      edit.setAttribute("aria-label", `Edit options for ${line.label}`);
      edit.disabled = Boolean(editingLine) || busy || checkingPayment;
      edit.addEventListener("click", () => {
        editingLine = { key: line.key, draft: line.entry };
        renderCart();
        $(".cart-options-editor select")?.focus({ preventScroll: true });
      });
    }
    const quantity = appendText(row, "div", "", "quantity-control");
    quantity.setAttribute("role", "group");
    quantity.setAttribute("aria-label", `${line.label} quantity`);
    const decrease = appendText(quantity, "button", "−");
    const count = appendText(quantity, "input", "", "quantity-input");
    count.type = "text";
    count.inputMode = "numeric";
    count.pattern = "[0-9]+";
    count.required = true;
    count.maxLength = 3;
    count.value = String(line.quantity);
    count.dataset.cartKey = line.key;
    count.setAttribute("aria-label", `Quantity for ${line.label}`);
    count.disabled = busy || checkingPayment;
    const commitQuantity = () => {
      if (!count.isConnected) return;
      const nextQuantity = Number(count.value);
      const otherQuantity = selectedItems.filter(item => cartName(item) === line.name && cartKey(item) !== line.key).length;
      const maximum = limits.quantity - otherQuantity;
      if (!/^[0-9]+$/.test(count.value) || !Number.isInteger(nextQuantity) || nextQuantity < 1 || nextQuantity > maximum) {
        const message = `Enter a whole-number quantity from 1 to ${maximum}. The limit is ${limits.quantity} units of each bake across all options.`;
        count.setCustomValidity(message);
        count.setAttribute("aria-invalid", "true");
        renderPayment(); status(message); return;
      }
      count.setCustomValidity("");
      count.setAttribute("aria-invalid", "false");
      if (nextQuantity === line.quantity) { renderPayment(); return; }
      const focused = document.activeElement === count;
      const caret = count.selectionStart;
      let kept = 0;
      selectedItems = selectedItems.filter(item => cartKey(item) !== line.key || ++kept <= nextQuantity);
      for (let i = kept; i < nextQuantity; i++) selectedItems.push(line.entry);
      persistCart(); renderCart();
      status(`Quantity updated to ${lineUnits({ ...line, quantity: nextQuantity })} of ${line.name}.`);
      if (focused) {
        const replacement = [...target.querySelectorAll(".quantity-input")].find(input => input.dataset.cartKey === line.key);
        replacement?.focus({ preventScroll: true });
        if (replacement && caret !== null) replacement.setSelectionRange(Math.min(caret, replacement.value.length), Math.min(caret, replacement.value.length));
      }
    };
    count.addEventListener("input", commitQuantity);
    count.addEventListener("change", commitQuantity);
    count.addEventListener("keydown", event => {
      if (event.key === "Enter") { event.preventDefault(); commitQuantity(); }
    });
    count.addEventListener("blur", () => {
      if (count.isConnected && !count.checkValidity()) {
        count.value = String(line.quantity);
        count.setCustomValidity(""); count.setAttribute("aria-invalid", "false");
        renderPayment();
      }
    });
    const increase = appendText(quantity, "button", "+");
    for (const [button, delta] of [[decrease, -1], [increase, 1]]) {
      button.type = "button";
      button.disabled = busy || checkingPayment;
      const label = `${delta > 0 ? "Add" : "Remove"} one ${line.label}`;
      button.setAttribute("aria-label", label);
      button.addEventListener("click", () => {
        if (delta > 0) addItem(line.entry);
        else {
          selectedItems.splice(selectedItems.findIndex(entry => cartKey(entry) === line.key), 1);
          status(`One ${line.label} removed.`);
          persistCart(); renderCart();
        }
        // Keep keyboard focus on the quantity control after its row is rebuilt.
        const next = [...target.querySelectorAll("button")].find(candidate => candidate.getAttribute("aria-label") === label);
        const fallback = target.querySelector("button") || $(".quick-add-details summary") || $(".nav-order");
        (next || fallback)?.focus({ preventScroll: true });
      });
    }
    appendText(row, "strong", `${money(line.total)}${line.needsQuote ? "+" : ""}`);
    if (target.id === "selected-bakes" && editingLine?.key === line.key) appendEditor(row, line);
  }
}
function renderCart() {
  if (editingLine && !selectedItems.some(item => cartKey(item) === editingLine.key)) editingLine = null;
  const order = summary();
  document.querySelectorAll("[data-cart-count]").forEach(counter => { counter.textContent = selectedItems.length; });
  renderChips($("#menu-cart-lines"));
  renderChips($("#selected-bakes"));
  if ($("#menu-cart")) {
    $("#menu-cart").classList.toggle("is-empty", !selectedItems.length);
    $("#menu-cart-count").textContent = `${selectedItems.length || "No"} ${selectedItems.length === 1 ? "item" : "items"} added`;
    $("#menu-cart-total").textContent = `${money(order.total)}${order.starting ? "+" : ""}`;
    const link = $("#menu-checkout-link");
    link.textContent = selectedItems.length ? "Checkout ↗" : "Add Items First";
    link.setAttribute("aria-disabled", String(!selectedItems.length));
    link.classList.toggle("is-disabled", !selectedItems.length);
  }
  renderPayment();
}
function addItem(item, button) {
  const entry = rules.normalizeCartItem(item);
  if (!entry) return false;
  const name = cartName(entry);
  if (selectedItems.filter(item => cartName(item) === name).length >= limits.quantity) {
    status(`You can add up to ${limits.quantity} units of each bake online. Email us for a larger order.`); return false;
  }
  selectedItems.push(entry);
  status(`${cartLabel(entry)} added${rules.priceSelection(entry).needsQuote ? " as a quote request." : "."}`); persistCart(); renderCart();
  if (button) {
    const label = button.dataset.originalText || button.textContent;
    button.dataset.originalText = label;
    button.textContent = "Added"; button.classList.add("is-added");
    window.setTimeout(() => { button.textContent = button.dataset.originalText; button.classList.remove("is-added"); }, 900);
  }
  return true;
}
function validateFields(show = errorsVisible) {
  if (!$("#order-form")) return [];
  for (const [id, limit] of [["customer-name", limits.name], ["occasion", limits.occasion], ["notes", limits.notes], ["pickup-time", limits.pickupTime]]) {
    const field = $(`#${id}`);
    field.setCustomValidity(field.value.trim().length > limit ? `Use ${limit} characters or fewer.` : field.required && !field.value.trim() ? "Please enter your name." : "");
  }
  $("#pickup-date").min = rules.todayInOklahoma();
  const contact = $("#customer-contact");
  contact.setCustomValidity(contact.value && !rules.validContact(contact.value) ? "Enter a valid email or a phone number with at least 10 digits." : "");
  const date = $("#pickup-date");
  date.setCustomValidity(date.value && !rules.validDate(date.value) ? "Choose today or a future date in Oklahoma." : "");
  const invalid = [];
  $("#order-form").querySelectorAll("input, select, textarea").forEach(field => {
    const valid = field.checkValidity();
    field.setAttribute("aria-invalid", String((show || field.classList.contains("quantity-input")) && !valid));
    if (!valid) invalid.push(field);
  });
  $("#notes-count").textContent = `${value("notes").length} / ${limits.notes} characters`;
  return invalid;
}
function renderPayment() {
  if (!$("#order-form")) return;
  const order = summary();
  const empty = !order.lines.length;
  const invalid = validateFields();
  const lines = $("#checkout-lines"); lines.replaceChildren();
  if (!order.lines.length) {
    appendText(lines, "p", "Your order summary will appear here.", "empty-state");
  } else {
    order.lines.forEach(line => {
      const row = appendText(lines, "div", "", "summary-line");
      const copy = appendText(row, "span", `${line.label}${line.quantity > 1 ? ` ×${line.quantity}` : ""} (${lineUnits(line)})`);
      appendText(copy, "small", priceBreakdown(line), "summary-breakdown");
      appendText(row, "strong", `${money(line.total)}${line.needsQuote ? "+" : ""}`);
    });
  }
  $("#checkout-total").textContent = `${money(order.total)}${order.starting ? "+" : ""}`;
  $("#due-today-total").textContent = order.needsQuote ? "No payment yet" : money(order.total);
  $(".square-totals").hidden = empty;
  $(".square-pay-area").hidden = empty;
  $("#checkout-note").hidden = empty;
  $("#copy-request").hidden = empty;
  $("#copy-request").disabled = Boolean(editingLine);
  $("#save-order-history").disabled = empty || Boolean(editingLine);
  $(".secure-note").hidden = empty || order.needsQuote;
  if (empty) $("#copy-fallback").hidden = true;
  $(".quote-payment").hidden = empty || !order.needsQuote;
  $("#checkout-note").textContent = editingLine ? "Save or cancel your option changes before continuing." : order.needsQuote ? "Quote required — no payment yet. This estimate includes listed add-ons. Taylor confirms availability and the final price for your request before payment." : "Your total includes the selected add-ons. Taylor will confirm your requested pickup arrangements.";
  $("#square-status").textContent = checkingPayment ? "Checking payment" : empty ? "Choose your bakes" : editingLine ? "Finish editing" : order.needsQuote ? "Quote required" : invalid.length ? "Details needed" : "Ready to pay";
  const button = $("#square-pay-button");
  button.disabled = empty || busy || checkingPayment;
  button.classList.toggle("is-disabled", button.disabled);
  button.textContent = busy ? "Opening Square…" : empty ? "Add Items First" : editingLine ? "Finish editing options" : order.needsQuote ? "Email Quote Request" : `Pay ${money(order.total)} With Square`;
  $("#square-pay-note").textContent = order.needsQuote ? "Opens your email app with the order details. Press Send there to request a quote. If email does not open, use Copy Order Request below." : "Add your contact details and requested date. Card details are entered securely on Square.";
}
function draft() {
  return Object.fromEntries(fieldIds.map(id => [id, id === "custom-order" ? Boolean($(`#${id}`)?.checked) : value(id)]));
}
function saveDraft() { saveStorage("sessionStorage", keys.draft, draft()); }
function restoreDraft() {
  const saved = readStorage("sessionStorage", keys.draft, {});
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) return;
  fieldIds.forEach(id => {
    const field = $(`#${id}`);
    if (id === "custom-order") field.checked = saved[id] === true;
    else if (typeof saved[id] === "string") field.value = saved[id];
  });
}
function requestMessage() {
  const order = summary();
  return ["The Akins Bake House order request", "", `Name: ${value("customer-name") || "Not provided"}`, `Contact: ${value("customer-contact") || "Not provided"}`, "Items:",
    ...order.lines.map(line => `- ${line.label} ×${line.quantity}: ${money(line.total)}${line.needsQuote ? "+ (estimate; final quote needed)" : ""} (${line.info.label})`),
    `Menu total: ${money(order.total)}${order.starting ? "+" : ""}`, `Date requested: ${value("pickup-date") || "To be arranged"}`,
    `Time requested: ${value("pickup-time") || "To be arranged"}`, `Fulfillment: ${value("fulfillment") === "delivery" ? "Local delivery — quote first" : "Pickup / meet-up"}`,
    `Custom request: ${$("#custom-order")?.checked || order.lines.some(line => line.needsQuote) ? "Yes — quote first" : "No"}`, `Occasion: ${value("occasion") || "Not specified"}`,
    "Please confirm availability and the final total before payment.", "", "Notes:", value("notes") || "None"].join("\n");
}
async function api(payload) {
  const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(25000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || (localPreview ? "This preview needs the local checkout server. Start it with npm run dev and open http://localhost:8888." : "Checkout is unavailable. Please try again or email the bakery."));
  return data;
}
async function checkout() {
  if (busy || checkingPayment) return;
  if (editingLine) { status("Save or cancel your option changes before continuing."); $(".save-options-button")?.focus(); return; }
  if (!selectedItems.length) { status("Add at least one bake first."); return; }
  errorsVisible = true;
  const invalid = validateFields(true);
  if (invalid.length) {
    status("Please check the highlighted order details.");
    const details = invalid[0].closest("details");
    if (details) details.open = true;
    invalid[0].focus(); invalid[0].reportValidity(); return;
  }
  const order = summary();
  if (order.needsQuote) {
    status("Your email app will open. Send the message there to request your quote; your order is not submitted yet.");
    location.href = `mailto:${email}?subject=${encodeURIComponent("The Akins Bake House Quote Request")}&body=${encodeURIComponent(requestMessage())}`;
    return;
  }
  const payload = {
    action: "create", items: order.lines.map(line => ({ name: line.name, quantity: line.quantity, ...(typeof line.entry === "string" ? {} : { option: line.entry.option, request: line.entry.request }) })),
    customer: { name: value("customer-name"), contact: value("customer-contact") }, pickupDate: value("pickup-date"), pickupTime: value("pickup-time"),
    occasion: value("occasion"), notes: value("notes"), fulfillment: value("fulfillment"), customOrder: $("#custom-order").checked,
    totals: { dueToday: order.total }, returnUrl: new URL("checkout.html", location.href).href
  };
  const signature = JSON.stringify(payload);
  const previous = readStorage("sessionStorage", keys.request, {});
  payload.requestId = previous?.signature === signature && typeof previous.id === "string" ? previous.id : crypto.randomUUID();
  saveStorage("sessionStorage", keys.request, { signature, id: payload.requestId });
  const cartSnapshot = [...selectedItems];
  busy = true; renderPayment(); status("Opening secure Square checkout…");
  try {
    const data = await api(payload);
    const target = new URL(data.checkoutUrl);
    if (target.protocol !== "https:" || !["square.link", "checkout.square.site", "connect.squareupsandbox.com", "squareupsandbox.com"].includes(target.hostname)) throw new Error("Square returned an unexpected checkout link. Please contact the bakery.");
    if (!data.verificationToken || !data.orderId) throw new Error("Checkout is being updated. Please email the bakery to arrange your order.");
    if (!saveStorage("sessionStorage", keys.pending, { token: data.verificationToken, orderId: data.orderId, items: cartSnapshot })) throw new Error("Please allow site storage so we can confirm your payment when you return from Square.");
    saveDraft();
    location.assign(target.href);
  } catch (error) {
    busy = false; renderPayment();
    status(error.name === "TimeoutError" || error.name === "TypeError" ? "We could not reach checkout. Please try again, or email your order. If you already paid, check your Square receipt before trying again." : error.message);
  }
}
async function checkPayment() {
  const panel = $("#payment-result");
  if (!panel || checkingPayment) return;
  const pending = readStorage("sessionStorage", keys.pending, null);
  panel.hidden = false;
  const message = $("#payment-result-message");
  const retry = $("#check-payment");
  if (!pending?.token || !pending?.orderId) {
    message.textContent = "We cannot verify a payment from this page alone. If you paid, check your Square receipt or contact Taylor before paying again.";
    retry.hidden = true; return;
  }
  checkingPayment = true; retry.disabled = true; retry.hidden = false; renderPayment();
  message.textContent = "Checking your payment with Square…";
  try {
    const result = await api({ action: "verify", verificationToken: pending.token });
    if (!result.paid || result.orderId !== pending.orderId) {
      message.textContent = "Square has not confirmed this payment yet. Check your receipt and try Check Payment Again before making another payment.";
      return;
    }
    // A different tab may have changed the cart while this customer was at Square.
    const currentCart = rules.sanitizeCart(readStorage("localStorage", keys.cart, cartMemory));
    const unchanged = JSON.stringify(currentCart) === JSON.stringify(pending.items);
    selectedItems = unchanged ? [] : currentCart;
    if (unchanged) { persistCart(); removeStorage("sessionStorage", keys.draft); }
    removeStorage("sessionStorage", keys.pending); removeStorage("sessionStorage", keys.request);
    message.textContent = `Payment confirmed by Square. Thank you for your order! ${unchanged ? "Your paid items have been cleared from the cart." : "Your cart changed while you were paying, so we kept it for you."} Keep your Square receipt; pickup or meet-up details are arranged with Taylor.`;
    retry.hidden = true;
    const url = new URL(location.href); url.searchParams.delete("square"); history.replaceState(null, "", url.href);
    renderCart();
  } catch (error) {
    message.textContent = "We could not verify the payment right now. Check your Square receipt or contact Taylor before paying again. You can also try Check Payment Again.";
  } finally { checkingPayment = false; retry.disabled = false; renderPayment(); }
}
function contactKey(contact) {
  return contact.includes("@") ? contact.trim().toLowerCase() : contact.replace(/\D/g, "");
}
function readHistory() {
  const stored = readStorage("localStorage", keys.history, {});
  const clean = Object.create(null);
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return clean;
  Object.entries(stored).slice(0, 100).forEach(([key, orders]) => {
    if (!Array.isArray(orders)) return;
    const valid = orders.filter(order => order && Array.isArray(order.lines) && Number.isFinite(order.total)).slice(0, 5);
    clean[contactKey(key)] = valid.map(order => ({ ...order, lines: order.lines.filter(line => line && rules.normalizeCartItem(line.item) && Number.isInteger(line.quantity) && line.quantity > 0 && line.quantity <= limits.quantity).map(line => ({ item: rules.normalizeCartItem(line.item), quantity: line.quantity })) }));
  });
  return clean;
}
function renderHistory() {
  const container = $("#returning-orders"); if (!container) return;
  container.replaceChildren();
  const orders = readHistory()[contactKey(value("customer-contact"))] || [];
  if (!orders.length) { appendText(container, "span", "Saved orders on this device will appear when you enter the same phone or email.", "empty-state"); return; }
  orders.forEach(order => {
    const card = appendText(container, "article", "", "saved-order");
    const copy = appendText(card, "div", "");
    const date = new Date(order.savedAt);
    appendText(copy, "span", Number.isNaN(date.getTime()) ? "Saved order" : date.toLocaleDateString());
    appendText(copy, "strong", "Your saved favorites");
    appendText(copy, "p", order.lines.map(line => `${cartLabel(line.item)} ×${line.quantity}`).join(", "));
    const add = appendText(card, "button", "Add Again", "add-button"); add.type = "button";
    add.addEventListener("click", () => {
      const additions = order.lines.flatMap(line => Array(line.quantity).fill(line.item));
      const next = [...selectedItems, ...additions];
      const capped = rules.sanitizeCart(next);
      if (next.length !== capped.length) { status(`This would exceed ${limits.quantity} units of a bake. Remove some items first or email us for a larger order.`); return; }
      selectedItems = next;
      // Restore only fields that are empty; never reuse a past pickup date.
      for (const [id, source, max] of [["customer-name", "name", limits.name], ["occasion", "occasion", limits.occasion], ["notes", "notes", limits.notes]]) {
        if (!value(id) && typeof order[source] === "string") $(`#${id}`).value = order[source].slice(0, max);
      }
      status("Saved bakes added at current menu prices. Choose a new date and check your details.");
      persistCart(); saveDraft(); renderCart();
    });
  });
}
function saveOrder() {
  if (!rules.validContact(value("customer-contact"))) { status("Enter a valid phone or email before saving."); $("#customer-contact").focus(); return; }
  if (!selectedItems.length) { status("Add at least one bake before saving."); return; }
  if (validateFields().some(field => ["customer-name", "occasion", "notes"].includes(field.id) && field.value)) { status("Please check the length of your order details before saving."); return; }
  const history = readHistory(); const order = summary();
  const key = contactKey(value("customer-contact"));
  const saved = { savedAt: new Date().toISOString(), name: value("customer-name"), occasion: value("occasion"), notes: value("notes"), total: order.total, lines: order.lines.map(line => ({ item: line.entry, quantity: line.quantity })) };
  history[key] = [saved, ...(history[key] || [])].slice(0, 5);
  status(saveStorage("localStorage", keys.history, history) ? "Saved on this device for next time. This does not submit or pay for your order." : "Your browser could not save this order.");
  renderHistory();
}
async function copyOrder() {
  const text = requestMessage();
  try { await navigator.clipboard.writeText(text); status("Order copied. Paste it into an email or message to Taylor to send it."); }
  catch {
    const fallback = $("#copy-fallback"); fallback.hidden = false; fallback.value = text; fallback.focus(); fallback.select();
    status("Select and copy the order text below, then paste it into your email.");
  }
}
function setupCheckout() {
  const form = $("#order-form"); if (!form) return;
  const select = $("#menu-item");
  select.replaceChildren(new Option("Choose an item", ""));
  menuItems.forEach(item => select.add(new Option(`${item.name} — ${money(item.price)}${item.starting ? "+ (quote)" : ` ${item.label}`}`, item.name)));
  const optionsContainer = appendText($(".quick-add-details"), "div", "", "quick-add-options");
  const quickAddButton = $("#add-selected-item");
  quickAddButton.before(optionsContainer);
  select.addEventListener("change", () => {
    optionsContainer.replaceChildren();
    quickAddButton.textContent = "Add to order";
    if (hasItem(select.value)) optionsContainer.append(createCustomizer(select.value, quickAddButton));
  });
  restoreDraft();
  if (["occasion", "notes"].some(id => value(id))) $(".optional-details").open = true;
  const url = new URL(location.href);
  const items = url.searchParams.getAll("item");
  // Consume the URL before rendering or saving so refresh/back cannot add it again.
  if (url.searchParams.has("item")) { url.searchParams.delete("item"); history.replaceState(null, "", url.href); }
  items.forEach(item => { if (hasItem(item)) addItem(item); });
  form.addEventListener("submit", event => { event.preventDefault(); checkout(); });
  quickAddButton.addEventListener("click", () => {
    if (!value("menu-item")) { status("Choose a bake first."); return; }
    const customizer = optionsContainer.querySelector(".bake-options");
    const entry = customizer ? readCustomizer(customizer) : value("menu-item");
    if (entry) addItem(entry);
  });
  form.querySelectorAll("input, select, textarea").forEach(field => {
    const changed = () => { saveDraft(); renderPayment(); if (field.id === "customer-contact") renderHistory(); };
    field.addEventListener("input", changed); field.addEventListener("change", changed);
  });
  $("#square-pay-button").addEventListener("click", checkout);
  $("#copy-request").addEventListener("click", copyOrder);
  $("#save-order-history").addEventListener("click", saveOrder);
  $("#check-returning-order").addEventListener("click", renderHistory);
  $("#clear-saved-orders").addEventListener("click", () => {
    const history = readHistory();
    delete history[contactKey(value("customer-contact"))];
    status(saveStorage("localStorage", keys.history, history) ? "Saved orders for this contact have been removed from this device." : "Your browser could not update saved orders.");
    renderHistory();
  });
  $("#check-payment").addEventListener("click", checkPayment);
  renderHistory(); renderCart();
  if (new URLSearchParams(location.search).has("square")) checkPayment();
}
document.querySelectorAll("[data-item-name]").forEach(button => {
  const customizer = createCustomizer(button.dataset.itemName, button);
  button.closest(".product-bottom").before(customizer);
  button.addEventListener("click", () => {
    const entry = readCustomizer(customizer);
    if (entry) addItem(entry, button);
  });
});
document.querySelectorAll("[data-price-name]").forEach(element => {
  const item = priceBook[element.dataset.priceName];
  if (item) element.textContent = item.starting ? `Starting at ${money(item.price)}` : `${money(item.price)} ${item.label}`;
});
document.querySelectorAll("[data-menu-filter]").forEach(button => button.addEventListener("click", () => {
  document.querySelectorAll("[data-menu-filter]").forEach(other => { other.classList.toggle("is-active", other === button); other.setAttribute("aria-pressed", String(other === button)); });
  document.querySelectorAll("[data-menu-category]").forEach(panel => { panel.hidden = button.dataset.menuFilter !== "all" && panel.dataset.menuCategory !== button.dataset.menuFilter; });
}));
$("#menu-clear-cart")?.addEventListener("click", () => { selectedItems = []; status("Current order cleared."); persistCart(); renderCart(); });
$("#menu-checkout-link")?.addEventListener("click", event => { if (!selectedItems.length) event.preventDefault(); });
window.addEventListener("storage", event => { if (event.key === keys.cart) { selectedItems = rules.sanitizeCart(readStorage("localStorage", keys.cart, [])); cartMemory = [...selectedItems]; renderCart(); } });
setupCheckout();
renderCart();
