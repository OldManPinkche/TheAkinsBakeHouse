import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleRequest } from "../server/square-checkout.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
try { process.loadEnvFile(path.join(root, ".env")); } catch (error) { if (error.code !== "ENOENT") throw error; }
const port = Number(process.env.PORT || 8888);
const mime = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml; charset=utf-8" };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${port}`);
    if (url.pathname === "/api/create-square-checkout") {
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (Buffer.byteLength(body) > 20000) { res.writeHead(413); res.end("Order too large"); return; }
      }
      // Local preview never uses a production token unless deliberately enabled.
      const env = { ...process.env };
      if (env.SQUARE_ENVIRONMENT !== "sandbox" && env.ALLOW_LIVE_CHECKOUT !== "true") env.SQUARE_ACCESS_TOKEN = "";
      const request = new Request(url, { method: req.method, headers: req.headers, ...(!["GET", "HEAD"].includes(req.method) ? { body } : {}) });
      const response = await handleRequest(request, env);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(await response.text()); return;
    }
    if (!["GET", "HEAD"].includes(req.method)) { res.writeHead(405); res.end(); return; }
    const name = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    if (!/^\/(?:index\.html|menu\.html|checkout\.html|robots\.txt|sitemap\.xml|assets\/[a-zA-Z0-9_.-]+)$/.test(name)) { res.writeHead(404); res.end("Not found"); return; }
    const file = path.resolve(root, `.${name}`);
    if (!file.startsWith(root + path.sep)) { res.writeHead(404); res.end(); return; }
    const data = await fs.readFile(file);
    res.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    res.end(req.method === "HEAD" ? undefined : data);
  } catch (error) { res.writeHead(error.code === "ENOENT" ? 404 : 500); res.end("Unable to load this page."); }
});
server.listen(port, "127.0.0.1", () => console.log(`Bakery preview: http://localhost:${port}\nEdit the source files, then refresh your browser. Local payment uses Square sandbox by default.`));
