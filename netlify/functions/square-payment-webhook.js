const crypto = require("node:crypto");

const SQUARE_VERSION = "2026-05-20";
const WEBSITE_ORDER_SOURCE = "The Akins Bake House Website";
const CURRENCY_SYMBOLS = {
  USD: "$"
};

const jsonHeaders = {
  "Content-Type": "application/json"
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: jsonHeaders,
    body: JSON.stringify(body)
  };
}

function cleanText(value, fallback = "") {
  return String(value || fallback).replace(/\s+/g, " ").trim();
}

function truncateText(value, maxLength) {
  const text = cleanText(value);

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 3)}...`;
}

function squareApiBase() {
  return process.env.SQUARE_ENVIRONMENT === "sandbox"
    ? "https://connect.squareupsandbox.com"
    : "https://connect.squareup.com";
}

function squareHeaders(accessToken) {
  return {
    "Square-Version": SQUARE_VERSION,
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json"
  };
}

function getHeader(headers, name) {
  const target = name.toLowerCase();
  const entry = Object.entries(headers || {}).find(([key]) => key.toLowerCase() === target);
  return entry ? entry[1] : "";
}

function getRawBody(event) {
  if (event.isBase64Encoded) {
    return Buffer.from(event.body || "", "base64").toString("utf8");
  }

  return event.body || "";
}

function timingSafeEqualText(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function getWebhookUrl(event) {
  const configuredUrl = cleanText(process.env.SQUARE_WEBHOOK_URL || process.env.SQUARE_NOTIFICATION_URL);

  if (configuredUrl) {
    return configuredUrl;
  }

  const siteUrl = cleanText(process.env.SITE_URL || process.env.URL);

  if (siteUrl) {
    return `${siteUrl.replace(/\/+$/, "")}/api/square-payment-webhook`;
  }

  const host = cleanText(getHeader(event.headers, "host"));
  const protocol = cleanText(getHeader(event.headers, "x-forwarded-proto"), "https");

  return host ? `${protocol}://${host}/api/square-payment-webhook` : "";
}

function verifySquareSignature(event, rawBody) {
  const signatureKey = cleanText(process.env.SQUARE_WEBHOOK_SIGNATURE_KEY);
  const squareSignature = cleanText(getHeader(event.headers, "x-square-hmacsha256-signature"));
  const webhookUrl = getWebhookUrl(event);

  if (!signatureKey) {
    return {
      ok: false,
      statusCode: 500,
      message: "Square webhook signature key is not configured."
    };
  }

  if (!squareSignature || !webhookUrl) {
    return {
      ok: false,
      statusCode: 401,
      message: "Square webhook signature could not be verified."
    };
  }

  const expectedSignature = crypto
    .createHmac("sha256", signatureKey)
    .update(`${webhookUrl}${rawBody}`)
    .digest("base64");

  if (!timingSafeEqualText(expectedSignature, squareSignature)) {
    return {
      ok: false,
      statusCode: 401,
      message: "Square webhook signature did not match."
    };
  }

  return { ok: true };
}

function getPaymentFromWebhook(payload) {
  return payload?.data?.object?.payment || payload?.payment || null;
}

function moneyText(money) {
  const amount = Number(money?.amount);
  const currency = cleanText(money?.currency, "USD");

  if (!Number.isFinite(amount)) {
    return "";
  }

  const symbol = CURRENCY_SYMBOLS[currency] || `${currency} `;
  const value = amount / 100;

  return `${symbol}${value.toFixed(value % 1 === 0 ? 0 : 2)}`;
}

async function squareGet(accessToken, path) {
  const response = await fetch(`${squareApiBase()}${path}`, {
    method: "GET",
    headers: squareHeaders(accessToken)
  });
  const data = await response.json().catch(() => ({}));

  return {
    ok: response.ok,
    status: response.status,
    data
  };
}

async function fetchSquarePayment(accessToken, paymentId) {
  if (!paymentId) {
    return null;
  }

  const result = await squareGet(accessToken, `/v2/payments/${encodeURIComponent(paymentId)}`);

  if (!result.ok) {
    console.error("Square payment lookup failed", result.status, result.data);
    return null;
  }

  return result.data.payment || null;
}

async function fetchSquareOrder(accessToken, orderId) {
  if (!orderId) {
    return null;
  }

  const result = await squareGet(accessToken, `/v2/orders/${encodeURIComponent(orderId)}`);

  if (!result.ok) {
    console.error("Square order lookup failed", result.status, result.data);
    return null;
  }

  return result.data.order || null;
}

function parsePaymentNote(note) {
  const details = {
    reference: "",
    customer: "",
    contact: "",
    pickup: "",
    occasion: "",
    notes: ""
  };
  const parts = String(note || "")
    .split("|")
    .map((part) => cleanText(part))
    .filter(Boolean);

  for (const part of parts) {
    const match = part.match(/^(Customer|Contact|Pickup|Occasion|Notes):\s*(.*)$/i);

    if (match) {
      details[match[1].toLowerCase()] = cleanText(match[2], "Not provided");
    } else if (!details.reference && part !== WEBSITE_ORDER_SOURCE) {
      details.reference = part;
    }
  }

  return details;
}

function orderBelongsToWebsite(order, payment) {
  const sourceName = cleanText(order?.source?.name).toLowerCase();
  const note = cleanText(payment?.note).toLowerCase();

  return sourceName === WEBSITE_ORDER_SOURCE.toLowerCase()
    || note.includes("akins bake house")
    || note.includes("website order");
}

function formatLineItems(order) {
  const lineItems = Array.isArray(order?.line_items) ? order.line_items : [];

  if (!lineItems.length) {
    return "Items unavailable in Square order lookup";
  }

  return lineItems.map((item) => {
    const quantity = cleanText(item.quantity, "1");
    const name = cleanText(item.name, "Item");
    const total = moneyText(item.total_money || item.gross_sales_money || item.variation_total_price_money);

    return `${quantity} x ${name}${total ? ` (${total})` : ""}`;
  }).join("; ");
}

function buildOwnerNotificationMessage({ payment, order }) {
  const noteDetails = parsePaymentNote(payment?.note);
  const total = moneyText(payment?.total_money || order?.total_money);
  const receiptUrl = cleanText(payment?.receipt_url);
  const items = formatLineItems(order);
  const lines = [
    "New paid Akins order",
    total ? `Total: ${total}` : "",
    noteDetails.customer ? `Customer: ${noteDetails.customer}` : "",
    noteDetails.contact ? `Contact: ${noteDetails.contact}` : "",
    noteDetails.pickup ? `Pickup: ${noteDetails.pickup}` : "",
    noteDetails.occasion && noteDetails.occasion !== "Not provided" ? `Occasion: ${noteDetails.occasion}` : "",
    `Items: ${items}`,
    noteDetails.notes && noteDetails.notes !== "None" ? `Order notes: ${truncateText(noteDetails.notes, 180)}` : "",
    receiptUrl ? `Receipt: ${receiptUrl}` : "",
    payment?.order_id ? `Square order: ${payment.order_id}` : ""
  ].filter(Boolean);

  return truncateText(lines.join("\n"), 1400);
}

function readNotificationConfig() {
  const discordWebhookUrl = cleanText(process.env.DISCORD_ORDER_WEBHOOK_URL);

  return {
    discordWebhookUrl,
    hasDiscord: Boolean(discordWebhookUrl)
  };
}

async function sendDiscordNotification(config, message) {
  const response = await fetch(config.discordWebhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      username: "The Akins Bake House Orders",
      content: truncateText(message, 1900)
    })
  });
  const data = await response.text().catch(() => "");

  if (!response.ok) {
    console.error("Discord notification failed", response.status, data);
    return {
      sent: false,
      provider: "discord",
      status: response.status,
      error: data || "Discord could not send the order notification."
    };
  }

  return {
    sent: true,
    provider: "discord"
  };
}

async function sendOwnerNotification(message) {
  const config = readNotificationConfig();

  if (!config.hasDiscord) {
    return {
      sent: false,
      skipped: true,
      missing: ["DISCORD_ORDER_WEBHOOK_URL"]
    };
  }

  return sendDiscordNotification(config, message);
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { message: "Use POST for Square payment webhooks." });
  }

  const rawBody = getRawBody(event);
  const verification = verifySquareSignature(event, rawBody);

  if (!verification.ok) {
    return json(verification.statusCode, { message: verification.message });
  }

  let payload;

  try {
    payload = JSON.parse(rawBody || "{}");
  } catch (error) {
    return json(400, { message: "Square webhook request was not valid JSON." });
  }

  if (!String(payload.type || "").startsWith("payment.")) {
    return json(200, { message: "Webhook ignored because it was not a payment event." });
  }

  const accessToken = process.env.SQUARE_ACCESS_TOKEN;

  if (!accessToken) {
    return json(500, { message: "Square access token is not configured for webhook order lookups." });
  }

  const webhookPayment = getPaymentFromWebhook(payload);
  const payment = await fetchSquarePayment(accessToken, webhookPayment?.id) || webhookPayment;

  if (!payment?.id) {
    return json(200, { message: "Webhook ignored because no payment was included." });
  }

  if (payment.status !== "COMPLETED") {
    return json(200, { message: `Payment ${payment.id} is ${payment.status || "not completed"}; no notification sent.` });
  }

  const order = await fetchSquareOrder(accessToken, payment.order_id);

  if (!orderBelongsToWebsite(order, payment)) {
    return json(200, { message: "Payment was not created by the website checkout; no notification sent." });
  }

  const message = buildOwnerNotificationMessage({ payment, order });
  const notificationResult = await sendOwnerNotification(message);

  if (!notificationResult.sent && !notificationResult.skipped) {
    return json(502, {
      message: "Paid order was received, but the free order notification could not be sent.",
      error: notificationResult.error
    });
  }

  if (notificationResult.skipped) {
    return json(200, {
      message: "Paid order was received, but free order notifications are not configured yet.",
      missing: notificationResult.missing
    });
  }

  return json(200, {
    message: "Owner notification sent for paid order.",
    paymentId: payment.id,
    orderId: payment.order_id,
    provider: notificationResult.provider,
    notificationId: notificationResult.id
  });
};
