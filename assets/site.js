const menuItems = [
  { name: "Weekend Favorites Box", price: 55, label: "starting at", starting: true },
  { name: "Cozy Morning Box", price: 35, label: "starting at", starting: true },
  { name: "Cookie Drop", price: 20, label: "per dozen", starting: false },
  { name: "Oatmeal Raisin Cookies", price: 20, label: "per dozen", starting: false },
  { name: "No Bake Cookies", price: 20, label: "per dozen", starting: false },
  { name: "Peanut Butter Cookies", price: 20, label: "per dozen", starting: false },
  { name: "Chocolate Chip Cookies", price: 20, label: "per dozen", starting: false },
  { name: "Cookie Cakes", price: 30, label: "starting at", starting: true },
  { name: "Cake Pops", price: 28, label: "per dozen", starting: false },
  { name: "Butterfinger Cake", price: 20, label: "starting at", starting: true },
  { name: "Cupcakes", price: 25, label: "per dozen", starting: false },
  { name: "Cheesecake", price: 20, label: "starting at", starting: true },
  { name: "Cinnamon Rolls", price: 25, label: "per dozen", starting: false },
  { name: "Banana Bread", price: 10, label: "per loaf", starting: false },
  { name: "Pumpkin Bread", price: 10, label: "per loaf", starting: false },
  { name: "Coconut Cream Pie", price: 20, label: "per pie", starting: false },
  { name: "Banana Pudding", price: 10, label: "starting at", starting: true }
];

const priceBook = Object.fromEntries(menuItems.map((item) => [item.name, item]));
const selectedItems = [];
const bakeHouseEmail = "theakinsbakehouse@yahoo.com";
const dynamicSquareCheckoutEndpoint = "https://akins-square-checkout.cmhawkins29.workers.dev";
const orderHistoryKey = "akinsBakeHouseOrderHistory";
const orderCartKey = "akinsBakeHouseCurrentOrder";
let squareCheckoutInProgress = false;
let checkoutValidationVisible = false;

const requiredCheckoutDetails = [
  { selector: "#customer-name", label: "name" },
  { selector: "#customer-contact", label: "phone or email" },
  { selector: "#pickup-date", label: "pickup date" }
];

function getFieldValue(selector) {
  const field = document.querySelector(selector);
  return field ? field.value.trim() : "";
}

function formatMoney(amount) {
  return `$${amount.toFixed(amount % 1 === 0 ? 0 : 2)}`;
}

function getItemActionLabel(itemName, fallback = "Add") {
  const item = priceBook[itemName];

  return item?.starting ? "Request Quote" : fallback;
}

function formatDetailList(details) {
  const labels = details.map((detail) => detail.label);

  if (labels.length <= 1) {
    return labels[0] || "order details";
  }

  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]}`;
  }

  return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
}

function getRequiredCheckoutFields() {
  return requiredCheckoutDetails
    .map((detail) => ({
      ...detail,
      field: document.querySelector(detail.selector)
    }))
    .filter((detail) => detail.field);
}

function getMissingCheckoutDetails() {
  return getRequiredCheckoutFields().filter(({ field }) => {
    if (!field.value.trim()) {
      return true;
    }

    return typeof field.checkValidity === "function" && !field.checkValidity();
  });
}

function updateCheckoutFieldStates(showErrors = checkoutValidationVisible) {
  getRequiredCheckoutFields().forEach(({ field }) => {
    const hasValue = field.value.trim();
    const isInvalid = !hasValue || (typeof field.checkValidity === "function" && !field.checkValidity());
    field.setAttribute("aria-invalid", String(Boolean(showErrors && isInvalid)));
  });
}

function setPickupDateMinimum() {
  const pickupDate = document.querySelector("#pickup-date");

  if (!pickupDate) {
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  pickupDate.min = today.toISOString().slice(0, 10);
}

function buildCheckoutUrl(item) {
  const url = new URL("checkout.html", window.location.href);
  url.searchParams.set("item", item);
  return url.href;
}

function setupStartingPriceButtons() {
  document.querySelectorAll("[data-item-name]").forEach((button) => {
    const itemName = button.dataset.itemName;

    if (priceBook[itemName]?.starting) {
      button.textContent = getItemActionLabel(itemName, button.textContent);
    }
  });
}

function readSavedCart() {
  try {
    const cart = JSON.parse(window.localStorage.getItem(orderCartKey)) || [];

    return Array.isArray(cart) ? cart.filter((item) => priceBook[item]) : [];
  } catch (error) {
    return [];
  }
}

function writeSavedCart() {
  try {
    if (selectedItems.length) {
      window.localStorage.setItem(orderCartKey, JSON.stringify(selectedItems));
    } else {
      window.localStorage.removeItem(orderCartKey);
    }

    return true;
  } catch (error) {
    return false;
  }
}

function loadSavedCart() {
  selectedItems.splice(0, selectedItems.length, ...readSavedCart());
}

function normalizeCustomerKey(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "");
}

function readOrderHistory() {
  try {
    return JSON.parse(window.localStorage.getItem(orderHistoryKey)) || {};
  } catch (error) {
    return {};
  }
}

function writeOrderHistory(history) {
  try {
    window.localStorage.setItem(orderHistoryKey, JSON.stringify(history));
    return true;
  } catch (error) {
    return false;
  }
}

function formatSavedDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Saved order";
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function setupMenuFilters() {
  const filterButtons = document.querySelectorAll("[data-menu-filter]");
  const categoryPanels = document.querySelectorAll("[data-menu-category]");

  if (!filterButtons.length || !categoryPanels.length) {
    return;
  }

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const filter = button.dataset.menuFilter;

      filterButtons.forEach((current) => {
        const isActive = current === button;
        current.classList.toggle("is-active", isActive);
        current.setAttribute("aria-pressed", String(isActive));
      });

      categoryPanels.forEach((panel) => {
        panel.hidden = filter !== "all" && panel.dataset.menuCategory !== filter;
      });
    });
  });
}

function renderMenuCart() {
  const cart = document.querySelector("#menu-cart");
  const countLabel = document.querySelector("#menu-cart-count");
  const totalLabel = document.querySelector("#menu-cart-total");
  const cartLines = document.querySelector("#menu-cart-lines");
  const checkoutLink = document.querySelector("#menu-checkout-link");

  if (!cart || !countLabel || !totalLabel || !cartLines || !checkoutLink) {
    return;
  }

  const summary = getCheckoutSummary();
  const itemCount = selectedItems.length;

  cart.classList.toggle("is-empty", !itemCount);
  countLabel.textContent = itemCount
    ? `${itemCount} ${itemCount === 1 ? "item" : "items"} added`
    : "No items yet";
  totalLabel.textContent = formatMoney(summary.total);
  checkoutLink.classList.toggle("is-disabled", !itemCount);
  checkoutLink.setAttribute("aria-disabled", String(!itemCount));
  checkoutLink.textContent = itemCount ? "Review In Checkout" : "Add Items First";

  cartLines.replaceChildren();

  if (!summary.lines.length) {
    const empty = document.createElement("span");
    empty.className = "empty-state";
    empty.textContent = "Tap Add on any bake, then check out when you are ready.";
    cartLines.append(empty);
    return;
  }

  summary.lines.forEach((line) => {
    const chip = document.createElement("span");
    const label = document.createElement("span");
    const remove = document.createElement("button");

    chip.className = "item-chip";
    label.textContent = `${line.item}${line.quantity > 1 ? ` x${line.quantity}` : ""} - ${formatMoney(line.lineTotal)}`;
    remove.type = "button";
    remove.textContent = "Remove";
    remove.setAttribute("aria-label", `Remove one ${line.item}`);
    remove.addEventListener("click", () => removeSelectedItem(line.item));

    chip.append(label, remove);
    cartLines.append(chip);
  });
}

function setupMenuCart() {
  const cart = document.querySelector("#menu-cart");

  if (!cart) {
    return;
  }

  document.querySelector("#menu-clear-cart")?.addEventListener("click", () => {
    const statusMessage = document.querySelector("#menu-cart-status");

    selectedItems.splice(0, selectedItems.length);
    writeSavedCart();
    renderMenuCart();

    if (statusMessage) {
      statusMessage.textContent = "Current order cleared.";
    }
  });

  document.querySelector("#menu-checkout-link")?.addEventListener("click", (event) => {
    if (!selectedItems.length) {
      event.preventDefault();
    }
  });

  renderMenuCart();
}

function getCheckoutSummary() {
  const counts = new Map();

  selectedItems.forEach((item) => {
    counts.set(item, (counts.get(item) || 0) + 1);
  });

  const lines = [...counts.entries()].map(([item, quantity]) => {
    const info = priceBook[item] || { price: 0, label: "pricing pending", starting: true };

    return {
      item,
      quantity,
      info,
      lineTotal: info.price * quantity
    };
  });

  const total = lines.reduce((sum, line) => sum + line.lineTotal, 0);

  return {
    lines,
    total,
    dueToday: total,
    hasStartingPrice: lines.some((line) => line.info.starting)
  };
}

function buildOrderNote(summary = getCheckoutSummary()) {
  const name = getFieldValue("#customer-name") || "Akins order";
  const itemText = summary.lines.length
    ? summary.lines.map((line) => `${line.item}${line.quantity > 1 ? ` x${line.quantity}` : ""}`).join(", ")
    : "No items selected";

  return `${name} - ${itemText}`;
}

function buildSquareCheckoutPayload(summary = getCheckoutSummary()) {
  return {
    items: summary.lines.map((line) => ({
      name: line.item,
      quantity: line.quantity
    })),
    customer: {
      name: getFieldValue("#customer-name"),
      contact: getFieldValue("#customer-contact")
    },
    pickupDate: getFieldValue("#pickup-date"),
    occasion: getFieldValue("#occasion"),
    notes: getFieldValue("#notes"),
    orderReference: buildOrderNote(summary),
    totals: {
      total: summary.total,
      dueToday: summary.dueToday
    },
    returnUrl: `${window.location.origin}${window.location.pathname}?square=paid`
  };
}

function buildQuoteRequestUrl() {
  const subject = encodeURIComponent("The Akins Bake House Final Total Request");
  const body = encodeURIComponent(buildRequestMessage());

  return `mailto:${bakeHouseEmail}?subject=${subject}&body=${body}`;
}

function updateSquareCheckout(summary = getCheckoutSummary()) {
  const squarePaymentAmount = document.querySelector("#square-payment-amount");
  const squareOrderNote = document.querySelector("#square-order-note");
  const squarePayButton = document.querySelector("#square-pay-button");
  const squarePayNote = document.querySelector("#square-pay-note");
  const squareStatus = document.querySelector("#square-status");

  if (!squarePaymentAmount || !squareOrderNote || !squarePayButton || !squareStatus) {
    return;
  }

  const missingDetails = getMissingCheckoutDetails();
  const needsFinalTotal = summary.hasStartingPrice;
  const canStartSquare = Boolean(summary.lines.length && !missingDetails.length && !needsFinalTotal);
  const canRequestFinalTotal = Boolean(summary.lines.length && !missingDetails.length && needsFinalTotal);
  const buttonDisabled = (!canStartSquare && !canRequestFinalTotal) || squareCheckoutInProgress;

  updateCheckoutFieldStates();
  squarePaymentAmount.textContent = needsFinalTotal
    ? `${formatMoney(summary.total)} starter estimate`
    : `${formatMoney(summary.dueToday)} due today`;
  squareOrderNote.textContent = summary.lines.length ? buildOrderNote(summary) : "Add items to generate a note";

  squarePayButton.classList.toggle("is-disabled", buttonDisabled);
  squarePayButton.setAttribute("aria-disabled", String(buttonDisabled));
  squarePayButton.href = canStartSquare
    ? dynamicSquareCheckoutEndpoint
    : canRequestFinalTotal
      ? buildQuoteRequestUrl()
      : "#";
  squarePayButton.removeAttribute("target");
  squarePayButton.removeAttribute("rel");
  squarePayButton.textContent = squareCheckoutInProgress
    ? "Creating Square Checkout..."
    : summary.lines.length
      ? missingDetails.length
        ? "Complete Details First"
        : needsFinalTotal
          ? "Request Final Total"
          : `Pay ${formatMoney(summary.dueToday)} With Square`
      : "Add Items First";
  squareStatus.textContent = summary.lines.length
    ? missingDetails.length
      ? "Details needed"
      : needsFinalTotal
        ? "Quote needed"
        : "Ready to pay"
    : "Add items";

  if (squarePayNote) {
    squarePayNote.textContent = !summary.lines.length
      ? "Add at least one bake before opening Square checkout."
      : missingDetails.length
        ? `Add ${formatDetailList(missingDetails)} before opening Square checkout.`
        : needsFinalTotal
          ? "This order includes starter pricing. Send the details first so the final total can be confirmed before payment."
          : "Square will open with the exact Pay today total for this order.";
  }
}

function updateCheckoutSummary() {
  const checkoutLines = document.querySelector("#checkout-lines");
  const checkoutTotal = document.querySelector("#checkout-total");
  const dueTodayTotal = document.querySelector("#due-today-total");
  const balanceTotal = document.querySelector("#balance-total");
  const checkoutNote = document.querySelector("#checkout-note");

  if (!checkoutLines || !checkoutTotal || !dueTodayTotal || !checkoutNote) {
    return;
  }

  const summary = getCheckoutSummary();
  updateSquareCheckout(summary);
  checkoutLines.replaceChildren();

  if (!summary.lines.length) {
    const empty = document.createElement("div");
    empty.className = "summary-line";
    empty.innerHTML = "<span>No items selected yet</span><strong>$0</strong>";
    checkoutLines.append(empty);
    checkoutTotal.textContent = "$0";
    dueTodayTotal.textContent = "$0";
    if (balanceTotal) {
      balanceTotal.textContent = "$0";
    }
    checkoutNote.textContent = "Add items to see what is due today.";
    return;
  }

  summary.lines.forEach((line) => {
    const row = document.createElement("div");
    const label = document.createElement("span");
    const price = document.createElement("strong");

    row.className = "summary-line";
    label.textContent = `${line.item}${line.quantity > 1 ? ` x${line.quantity}` : ""} (${line.info.label})`;
    price.textContent = formatMoney(line.lineTotal);

    row.append(label, price);
    checkoutLines.append(row);
  });

  checkoutTotal.textContent = summary.hasStartingPrice ? `${formatMoney(summary.total)}+` : formatMoney(summary.total);
  dueTodayTotal.textContent = summary.hasStartingPrice ? "After quote" : formatMoney(summary.dueToday);
  if (balanceTotal) {
    balanceTotal.textContent = summary.hasStartingPrice ? "TBD" : "$0";
  }
  checkoutNote.textContent = summary.hasStartingPrice
    ? "Estimated total uses starter pricing. Send the order details first so the final total can be confirmed before payment."
    : "Total is based on selected menu prices. Full payment is due when the order is confirmed.";
}

function updateEmailLink() {
  const emailLink = document.querySelector("#email-request");

  if (!emailLink) {
    return;
  }

  const subject = encodeURIComponent("The Akins Bake House Checkout");
  const body = encodeURIComponent(buildRequestMessage());
  emailLink.href = `mailto:${bakeHouseEmail}?subject=${subject}&body=${body}`;
}

function renderSelectedItems() {
  const selectedBakes = document.querySelector("#selected-bakes");

  if (!selectedBakes) {
    return;
  }

  selectedBakes.replaceChildren();

  if (!selectedItems.length) {
    const empty = document.createElement("span");
    empty.className = "empty-state";
    empty.textContent = "Selected bakes will appear here. Click Add once per menu unit.";
    selectedBakes.append(empty);
    updateCheckoutSummary();
    updateEmailLink();
    return;
  }

  const counts = new Map();
  selectedItems.forEach((item) => {
    counts.set(item, (counts.get(item) || 0) + 1);
  });

  counts.forEach((quantity, item) => {
    const chip = document.createElement("span");
    const label = document.createElement("span");
    const remove = document.createElement("button");
    const info = priceBook[item] || { price: 0 };

    chip.className = "item-chip";
    label.textContent = `${item}${quantity > 1 ? ` x${quantity}` : ""} - ${formatMoney(info.price * quantity)}`;
    remove.type = "button";
    remove.textContent = "Remove";
    remove.setAttribute("aria-label", `Remove one ${item}`);
    remove.addEventListener("click", () => removeSelectedItem(item));

    chip.append(label, remove);
    selectedBakes.append(chip);
  });

  updateCheckoutSummary();
  updateEmailLink();
}

function addSelectedItem(item, sourceButton) {
  const statusMessage = document.querySelector("#form-status");
  const menuStatusMessage = document.querySelector("#menu-cart-status");
  const itemSelect = document.querySelector("#menu-item");
  const alreadySelected = selectedItems.includes(item);

  if (!document.querySelector("#order-form")) {
    if (!document.querySelector("#menu-cart")) {
      window.location.href = buildCheckoutUrl(item);
      return;
    }

    selectedItems.push(item);
    writeSavedCart();

    if (menuStatusMessage) {
      menuStatusMessage.textContent = alreadySelected ? `Another ${item} added.` : `${item} added.`;
    }

    if (sourceButton) {
      const originalText = sourceButton.dataset.originalText || sourceButton.textContent;
      sourceButton.dataset.originalText = originalText;
      sourceButton.classList.add("is-added");
      sourceButton.textContent = "Added";
      window.setTimeout(() => {
        sourceButton.classList.remove("is-added");
        sourceButton.textContent = originalText;
      }, 900);
    }

    renderMenuCart();
    return;
  }

  selectedItems.push(item);
  writeSavedCart();

  if (statusMessage) {
    statusMessage.textContent = alreadySelected ? `Another ${item} added to checkout.` : `${item} added to checkout.`;
  }

  if (itemSelect) {
    itemSelect.value = item;
  }

  if (sourceButton) {
    const originalText = sourceButton.dataset.originalText || sourceButton.textContent;
    sourceButton.dataset.originalText = originalText;
    sourceButton.classList.add("is-added");
    sourceButton.textContent = "Added";
    window.setTimeout(() => {
      sourceButton.classList.remove("is-added");
      sourceButton.textContent = originalText;
    }, 900);
  }

  renderSelectedItems();
}

function removeSelectedItem(item) {
  const statusMessage = document.querySelector("#form-status");
  const menuStatusMessage = document.querySelector("#menu-cart-status");
  const index = selectedItems.indexOf(item);

  if (index >= 0) {
    selectedItems.splice(index, 1);
    writeSavedCart();

    if (statusMessage) {
      statusMessage.textContent = `${item} removed.`;
    }

    if (menuStatusMessage) {
      menuStatusMessage.textContent = `${item} removed.`;
    }

    renderSelectedItems();
    renderMenuCart();
  }
}

function buildRequestMessage() {
  const summary = getCheckoutSummary();
  const checkoutItems = summary.lines.length
    ? summary.lines.map((line) => `- ${line.item} x${line.quantity}: ${formatMoney(line.lineTotal)} (${line.info.label})`)
    : ["- Not selected"];
  const name = getFieldValue("#customer-name") || "Not provided";
  const contact = getFieldValue("#customer-contact") || "Not provided";
  const date = getFieldValue("#pickup-date") || "Not provided";
  const occasion = getFieldValue("#occasion") || "Not provided";
  const notes = getFieldValue("#notes") || "None";

  return [
    "The Akins Bake House checkout request",
    "",
    `Name: ${name}`,
    `Contact: ${contact}`,
    "Items:",
    ...checkoutItems,
    `Pickup date: ${date}`,
    `Occasion: ${occasion}`,
    `Estimated total: ${formatMoney(summary.total)}${summary.hasStartingPrice ? " (starter pricing)" : ""}`,
    summary.hasStartingPrice
      ? "Payment: Final total should be confirmed before payment because this order includes starter pricing."
      : `Full payment due: ${formatMoney(summary.dueToday)}`,
    summary.hasStartingPrice
      ? "Square checkout: Send a final total first, then pay after confirmation."
      : "Square checkout: Exact checkout link created at payment time",
    `Square order note: ${buildOrderNote(summary)}`,
    "Payment options: card, digital wallet, or Cash App Pay when enabled in Square",
    "Bake schedule: start after full payment is confirmed received",
    "",
    "Notes:",
    notes
  ].join("\n");
}

async function copyText(value, successMessage) {
  const statusMessage = document.querySelector("#form-status");

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
    } else {
      const helper = document.createElement("textarea");
      helper.value = value;
      helper.setAttribute("readonly", "");
      helper.style.position = "fixed";
      helper.style.left = "-9999px";
      document.body.appendChild(helper);
      helper.select();
      document.execCommand("copy");
      helper.remove();
    }

    if (statusMessage) {
      statusMessage.textContent = successMessage;
    }
  } catch (error) {
    if (statusMessage) {
      statusMessage.textContent = "Copy did not work here. You can copy it manually.";
    }
  }
}

async function createExactSquareCheckout() {
  const statusMessage = document.querySelector("#form-status");
  const squarePayButton = document.querySelector("#square-pay-button");
  const summary = getCheckoutSummary();

  if (!summary.lines.length) {
    if (statusMessage) {
      statusMessage.textContent = "Add at least one item before opening Square checkout.";
    }
    return;
  }

  checkoutValidationVisible = true;
  const missingDetails = getMissingCheckoutDetails();

  if (missingDetails.length) {
    updateCheckoutFieldStates(true);
    updateSquareCheckout(summary);

    if (statusMessage) {
      statusMessage.textContent = `Add ${formatDetailList(missingDetails)} before opening Square checkout.`;
    }

    missingDetails[0].field.focus();

    if (typeof missingDetails[0].field.reportValidity === "function") {
      missingDetails[0].field.reportValidity();
    }

    return;
  }

  if (summary.hasStartingPrice) {
    if (statusMessage) {
      statusMessage.textContent = "Opening an email request so the final total can be confirmed before payment.";
    }

    window.location.href = buildQuoteRequestUrl();
    return;
  }

  if (squareCheckoutInProgress) {
    return;
  }

  squareCheckoutInProgress = true;
  updateSquareCheckout(summary);

  if (statusMessage) {
    statusMessage.textContent = "Creating a secure Square checkout for the exact total...";
  }

  try {
    const response = await fetch(dynamicSquareCheckoutEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(buildSquareCheckoutPayload(summary))
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.checkoutUrl) {
      const squareDetails = Array.isArray(data.errors)
        ? data.errors.map((entry) => entry.detail || entry.code).filter(Boolean).join(" ")
        : "";
      throw new Error(squareDetails || data.message || data.error || "Square checkout is not configured yet.");
    }

    window.location.href = data.checkoutUrl;
  } catch (error) {
    squareCheckoutInProgress = false;
    updateSquareCheckout(summary);

    if (statusMessage) {
      const errorText = String(error?.message || "");

      if (/authorized|authorization|authentication|unauthorized/i.test(errorText)) {
        statusMessage.textContent = "Square is connected, but the Square access token in Netlify is not authorized. Check that Netlify has the Production access token, Production location ID, and no quotes or extra spaces.";
      } else if (/not configured|environment/i.test(errorText)) {
        statusMessage.textContent = "Square backend is deployed, but the Netlify environment variables are missing. Add SQUARE_ACCESS_TOKEN, SQUARE_LOCATION_ID, SQUARE_ENVIRONMENT, and SITE_URL.";
      } else {
        statusMessage.textContent = `Square checkout could not open yet. ${errorText || "Check the Square setup in Netlify."}`;
      }
    }
  }
}

function showSquareReturnStatus() {
  const statusMessage = document.querySelector("#form-status");
  const squareStatus = new URLSearchParams(window.location.search).get("square");

  if (statusMessage && squareStatus === "paid") {
    statusMessage.textContent = "Payment received. Square will keep the paid order details for The Akins Bake House.";
  }
}

function buildSavedOrder(summary = getCheckoutSummary()) {
  return {
    savedAt: new Date().toISOString(),
    name: getFieldValue("#customer-name"),
    contact: getFieldValue("#customer-contact"),
    pickupDate: getFieldValue("#pickup-date"),
    occasion: getFieldValue("#occasion"),
    notes: getFieldValue("#notes"),
    total: summary.total,
    dueToday: summary.dueToday,
    hasStartingPrice: summary.hasStartingPrice,
    lines: summary.lines.map((line) => ({
      item: line.item,
      quantity: line.quantity,
      label: line.info.label,
      lineTotal: line.lineTotal
    }))
  };
}

function renderReturningOrders(contactValue = getFieldValue("#customer-contact")) {
  const returningOrders = document.querySelector("#returning-orders");

  if (!returningOrders) {
    return;
  }

  const appendEmpty = (message) => {
    const empty = document.createElement("span");
    empty.className = "empty-state";
    empty.textContent = message;
    returningOrders.append(empty);
  };

  returningOrders.replaceChildren();

  const customerKey = normalizeCustomerKey(contactValue);

  if (!customerKey) {
    appendEmpty("Past orders saved on this device will show here.");
    return;
  }

  const history = readOrderHistory();
  const orders = history[customerKey] || [];

  if (!orders.length) {
    appendEmpty("No saved orders found on this device for that phone or email yet.");
    return;
  }

  orders.slice(0, 5).forEach((order) => {
    const card = document.createElement("article");
    const copy = document.createElement("div");
    const label = document.createElement("span");
    const title = document.createElement("strong");
    const details = document.createElement("p");
    const addAgain = document.createElement("button");
    const orderItems = order.lines
      .map((line) => `${line.item}${line.quantity > 1 ? ` x${line.quantity}` : ""}`)
      .join(", ");

    card.className = "saved-order";
    label.textContent = formatSavedDate(order.savedAt);
    title.textContent = `${formatMoney(order.total)} saved order`;
    details.textContent = orderItems || "No items saved";
    addAgain.className = "add-button";
    addAgain.type = "button";
    addAgain.textContent = "Add Again";
    addAgain.addEventListener("click", () => {
      const statusMessage = document.querySelector("#form-status");

      order.lines.forEach((line) => {
        if (!priceBook[line.item]) {
          return;
        }

        for (let index = 0; index < line.quantity; index += 1) {
          selectedItems.push(line.item);
        }
      });
      writeSavedCart();

      const nameField = document.querySelector("#customer-name");
      const contactField = document.querySelector("#customer-contact");
      const occasionField = document.querySelector("#occasion");
      const notesField = document.querySelector("#notes");

      if (nameField && !nameField.value && order.name) {
        nameField.value = order.name;
      }

      if (contactField && order.contact) {
        contactField.value = order.contact;
      }

      if (occasionField && !occasionField.value && order.occasion) {
        occasionField.value = order.occasion;
      }

      if (notesField && !notesField.value && order.notes) {
        notesField.value = order.notes;
      }

      if (statusMessage) {
        statusMessage.textContent = "Past order added to checkout.";
      }

      renderSelectedItems();
      renderReturningOrders(order.contact);
    });

    copy.append(label, title, details);
    card.append(copy, addAgain);
    returningOrders.append(card);
  });
}

function saveCurrentOrderHistory() {
  const statusMessage = document.querySelector("#form-status");
  const contact = getFieldValue("#customer-contact");
  const customerKey = normalizeCustomerKey(contact);
  const summary = getCheckoutSummary();

  if (!customerKey) {
    if (statusMessage) {
      statusMessage.textContent = "Add a phone or email before saving this order.";
    }
    return;
  }

  if (!summary.lines.length) {
    if (statusMessage) {
      statusMessage.textContent = "Add at least one item before saving this order.";
    }
    return;
  }

  const history = readOrderHistory();
  const savedOrder = buildSavedOrder(summary);
  history[customerKey] = [savedOrder, ...(history[customerKey] || [])].slice(0, 5);

  if (!writeOrderHistory(history)) {
    if (statusMessage) {
      statusMessage.textContent = "This browser could not save the order history.";
    }
    return;
  }

  renderReturningOrders(contact);

  if (statusMessage) {
    statusMessage.textContent = "Order saved on this device for faster reordering.";
  }
}

function setupCheckout() {
  const orderForm = document.querySelector("#order-form");
  const itemSelect = document.querySelector("#menu-item");
  const squarePayButton = document.querySelector("#square-pay-button");
  const copyRequestButton = document.querySelector("#copy-request");
  const checkReturningButton = document.querySelector("#check-returning-order");
  const saveOrderButton = document.querySelector("#save-order-history");

  if (!orderForm) {
    return;
  }

  setPickupDateMinimum();

  new URLSearchParams(window.location.search).getAll("item").forEach((item) => {
    if (priceBook[item]) {
      selectedItems.push(item);
    }
  });
  writeSavedCart();

  document.querySelector("#add-selected-item")?.addEventListener("click", () => {
    const statusMessage = document.querySelector("#form-status");

    if (!itemSelect || !itemSelect.value) {
      if (statusMessage) {
        statusMessage.textContent = "Choose an item first.";
      }
      return;
    }

    addSelectedItem(itemSelect.value);
  });

  orderForm.querySelectorAll("input, select, textarea").forEach((field) => {
    field.addEventListener("input", () => {
      updateCheckoutFieldStates(checkoutValidationVisible);
      updateCheckoutSummary();
      updateEmailLink();

      if (field.id === "customer-contact") {
        renderReturningOrders(field.value);
      }
    });
    field.addEventListener("change", () => {
      updateCheckoutFieldStates(checkoutValidationVisible);
      updateCheckoutSummary();
      updateEmailLink();

      if (field.id === "customer-contact") {
        renderReturningOrders(field.value);
      }
    });
  });

  checkReturningButton?.addEventListener("click", () => {
    const statusMessage = document.querySelector("#form-status");
    renderReturningOrders();

    if (statusMessage) {
      statusMessage.textContent = getFieldValue("#customer-contact")
        ? "Past orders checked on this device."
        : "Enter a phone or email first.";
    }
  });

  saveOrderButton?.addEventListener("click", saveCurrentOrderHistory);

  squarePayButton?.addEventListener("click", (event) => {
    event.preventDefault();
    createExactSquareCheckout();
  });

  copyRequestButton?.addEventListener("click", async () => {
    await copyText(buildRequestMessage(), "Checkout copied.");
  });

  renderSelectedItems();
  renderReturningOrders();
  showSquareReturnStatus();
}

document.querySelectorAll("[data-item-name]").forEach((button) => {
  button.addEventListener("click", () => {
    addSelectedItem(button.dataset.itemName, button);
  });
});

loadSavedCart();
setupStartingPriceButtons();
setupMenuFilters();
setupMenuCart();
setupCheckout();
