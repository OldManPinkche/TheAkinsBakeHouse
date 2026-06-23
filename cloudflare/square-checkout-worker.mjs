const SQUARE_VERSION = "2026-05-20";
const CURRENCY = "USD";
const WEBSITE_ORDER_SOURCE = "The Akins Bake House Website";

const MENU_PRICES = {
  "Weekend Favorites Box": 5500,
  "Cozy Morning Box": 3500,
  "Cookie Drop": 2000,
  "Oatmeal Raisin Cookies": 2000,
  "No Bake Cookies": 2000,
  "Peanut Butter Cookies": 2000,
  "Chocolate Chip Cookies": 2000,
  "Cookie Cakes": 3000,
  "Cake Pops": 2800,
  "Butterfinger Cake": 2000,
  Cupcakes: 2500,
  Cheesecake: 2000,
  "Cinnamon Rolls": 2500,
  "Banana Bread": 1000,
  "Pumpkin Bread": 1000,
  "Coconut Cream Pie": 2000,
  "Banana Pudding": 1000
};

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Content-Type": "application/json"
};

function json(statusCode, body) {
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers
  });
}

function empty(statusCode) {
  return new Response(null, {
    status: statusCode,
    headers
  });
}

function cleanText(value, fallback = "") {
  return String(value || fallback).replace(/\s+/g, " ").trim();
}

function asQuantity(value) {
  const quantity = Number.parseInt(value, 10);

  if (!Number.isFinite(quantity) || quantity < 1 || quantity > 20) {
    return null;
  }

  return quantity;
}

function squareApiBase(env) {
  return env.SQUARE_ENVIRONMENT === "sandbox"
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

function hasInvalidLocationError(squareData) {
  return Array.isArray(squareData.errors) && squareData.errors.some((error) => {
    const detail = `${error.code || ""} ${error.detail || ""}`.toLowerCase();
    return detail.includes("invalid location");
  });
}

async function findActiveLocationId(env, accessToken) {
  const response = await fetch(`${squareApiBase(env)}/v2/locations`, {
    method: "GET",
    headers: squareHeaders(accessToken)
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    return {
      errorStatus: response.status,
      errorBody: data
    };
  }

  const locations = Array.isArray(data.locations) ? data.locations : [];
  const activeLocation = locations.find((location) => location.status === "ACTIVE") || locations[0];

  return {
    locationId: activeLocation?.id,
    locationName: activeLocation?.name
  };
}

async function createSquarePaymentLink(env, accessToken, squarePayload) {
  const response = await fetch(`${squareApiBase(env)}/v2/online-checkout/payment-links`, {
    method: "POST",
    headers: squareHeaders(accessToken),
    body: JSON.stringify(squarePayload)
  });
  const data = await response.json().catch(() => ({}));

  return {
    response,
    data
  };
}

async function createCheckout(request, env) {
  const accessToken = env.SQUARE_ACCESS_TOKEN;
  const configuredLocationId = cleanText(env.SQUARE_LOCATION_ID, "auto");

  if (!accessToken) {
    return json(500, {
      message: "Square is not configured yet. Add SQUARE_ACCESS_TOKEN as a Cloudflare Worker secret."
    });
  }

  let payload;

  try {
    payload = await request.json();
  } catch (error) {
    return json(400, { message: "The checkout request was not valid JSON." });
  }

  const requestedItems = Array.isArray(payload.items) ? payload.items : [];

  if (!requestedItems.length) {
    return json(400, { message: "Add at least one item before paying." });
  }

  const lineItems = [];

  for (const requestedItem of requestedItems) {
    const name = cleanText(requestedItem.name);
    const quantity = asQuantity(requestedItem.quantity);
    const price = MENU_PRICES[name];

    if (!price || !quantity) {
      return json(400, { message: `The item "${name || "unknown"}" could not be checked out.` });
    }

    lineItems.push({
      name,
      quantity,
      price,
      total: price * quantity
    });
  }

  const totalCents = lineItems.reduce((sum, item) => sum + item.total, 0);
  const browserTotalCents = Math.round(Number(payload.totals?.dueToday || 0) * 100);

  if (browserTotalCents && browserTotalCents !== totalCents) {
    return json(400, { message: "The Square total did not match the website checkout total. Refresh and try again." });
  }

  const orderReference = cleanText(payload.orderReference, "The Akins Bake House order").slice(0, 120);
  const customerName = cleanText(payload.customer?.name, "Customer");
  const customerContact = cleanText(payload.customer?.contact, "Not provided");
  const pickupDate = cleanText(payload.pickupDate, "Not provided");
  const occasion = cleanText(payload.occasion, "Not provided");
  const notes = cleanText(payload.notes, "None").slice(0, 180);
  const returnUrl = cleanText(payload.returnUrl, env.SITE_URL || "https://theakinsbakehouse.com");
  const paymentNote = [
    WEBSITE_ORDER_SOURCE,
    orderReference,
    `Customer: ${customerName}`,
    `Contact: ${customerContact}`,
    `Pickup: ${pickupDate}`,
    `Occasion: ${occasion}`,
    `Notes: ${notes}`
  ].join(" | ").slice(0, 500);

  const squarePayload = {
    idempotency_key: crypto.randomUUID(),
    description: orderReference,
    order: {
      location_id: configuredLocationId,
      source: {
        name: WEBSITE_ORDER_SOURCE
      },
      line_items: lineItems.map((item) => ({
        name: item.name,
        quantity: String(item.quantity),
        item_type: "ITEM",
        base_price_money: {
          amount: item.price,
          currency: CURRENCY
        }
      }))
    },
    checkout_options: {
      redirect_url: returnUrl
    },
    payment_note: paymentNote
  };

  if (!configuredLocationId || configuredLocationId.toLowerCase() === "auto") {
    const locationResult = await findActiveLocationId(env, accessToken);

    if (!locationResult.locationId) {
      return json(locationResult.errorStatus || 500, {
        message: "Square could not find an active location for this access token.",
        errors: locationResult.errorBody?.errors || locationResult.errorBody || []
      });
    }

    squarePayload.order.location_id = locationResult.locationId;
  }

  let { response: squareResponse, data: squareData } = await createSquarePaymentLink(env, accessToken, squarePayload);

  if (!squareResponse.ok && hasInvalidLocationError(squareData)) {
    const locationResult = await findActiveLocationId(env, accessToken);

    if (locationResult.locationId) {
      squarePayload.idempotency_key = crypto.randomUUID();
      squarePayload.order.location_id = locationResult.locationId;
      ({ response: squareResponse, data: squareData } = await createSquarePaymentLink(env, accessToken, squarePayload));
    }
  }

  if (!squareResponse.ok) {
    return json(squareResponse.status, {
      message: "Square could not create the checkout link.",
      errors: squareData.errors || squareData
    });
  }

  return json(200, {
    checkoutUrl: squareData.payment_link?.url || squareData.payment_link?.long_url,
    orderId: squareData.payment_link?.order_id,
    locationId: squarePayload.order.location_id,
    total: totalCents / 100
  });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return empty(204);
    }

    if (request.method !== "POST") {
      return json(405, { message: "Use POST to create a Square checkout." });
    }

    return createCheckout(request, env);
  }
};
