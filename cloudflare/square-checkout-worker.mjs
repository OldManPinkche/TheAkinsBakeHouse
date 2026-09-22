import { handleRequest } from "../server/square-checkout.mjs";
export default { fetch: (request, env) => handleRequest(request, env) };
