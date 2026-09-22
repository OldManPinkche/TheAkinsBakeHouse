exports.handler = async event => {
  const { handleRequest } = await import("../../server/square-checkout.mjs");
  const method = event.httpMethod;
  const body = event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf8") : event.body;
  const response = await handleRequest(new Request("https://theakinsbakehouse.com/api/create-square-checkout", {
    method, headers: event.headers,
    ...(!["GET", "HEAD"].includes(method) ? { body: body || "" } : {})
  }), process.env);
  return { statusCode: response.status, headers: Object.fromEntries(response.headers), body: await response.text() };
};
