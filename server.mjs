import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number.parseInt(process.env.PORT || "4173", 10);
const API_BASE = "https://api.hejlik.cz/api/v1/restaurants";
const ROOT = fileURLToPath(new URL("./", import.meta.url));
const MAX_PAGE_SIZE = 100;
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".webp": "image/webp"
};

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

    if (requestUrl.pathname === "/api/restaurants") {
      await proxyRestaurants(request, response, requestUrl);
      return;
    }

    await serveStatic(request, response, requestUrl);
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: "Internal server error" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Žrádlomapa běží na http://${HOST}:${PORT}`);
});

async function proxyRestaurants(request, response, requestUrl) {
  if (request.method === "OPTIONS") {
    setCorsHeaders(request, response);
    response.writeHead(204, { "cache-control": "no-store" });
    response.end();
    return;
  }

  if (request.method !== "GET") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  const limit = parseInteger(requestUrl.searchParams.get("limit"), MAX_PAGE_SIZE);
  const offset = parseInteger(requestUrl.searchParams.get("offset"), 0);

  if (limit < 1 || limit > MAX_PAGE_SIZE || offset < 0 || offset > 10000) {
    sendJson(response, 400, { error: "Invalid pagination" });
    return;
  }

  const upstreamUrl = new URL(API_BASE);
  upstreamUrl.searchParams.set("limit", String(limit));
  upstreamUrl.searchParams.set("offset", String(offset));

  const upstream = await fetch(upstreamUrl, {
    headers: {
      accept: "application/json",
      "user-agent": "zradlomapa-live-proxy/1.0"
    },
    signal: AbortSignal.timeout(15000)
  });

  const body = Buffer.from(await upstream.arrayBuffer());
  setCorsHeaders(request, response);
  response.writeHead(upstream.status, {
    "cache-control": "no-store, max-age=0",
    "content-type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
    "x-content-type-options": "nosniff"
  });
  response.end(body);
}

async function serveStatic(request, response, requestUrl) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { allow: "GET, HEAD" });
    response.end();
    return;
  }

  const pathname = requestUrl.pathname === "/" ? "/index.html" : decodeURIComponent(requestUrl.pathname);
  const normalizedPath = normalize(pathname).replace(/^([/\\])+/, "");
  const filePath = resolve(join(ROOT, normalizedPath));
  const blockedPrefixes = [`.git${sep}`, `.github${sep}`, `data${sep}`, `scripts${sep}`];
  const relativePath = filePath.slice(ROOT.length);

  if (!filePath.startsWith(ROOT) || blockedPrefixes.some((prefix) => relativePath.startsWith(prefix))) {
    response.writeHead(404);
    response.end();
    return;
  }

  let fileStats;
  try {
    fileStats = await stat(filePath);
  } catch {
    response.writeHead(404);
    response.end();
    return;
  }

  if (!fileStats.isFile()) {
    response.writeHead(404);
    response.end();
    return;
  }

  response.writeHead(200, {
    "cache-control": "no-cache",
    "content-length": fileStats.size,
    "content-type": MIME_TYPES[extname(filePath).toLowerCase()] || "application/octet-stream",
    "x-content-type-options": "nosniff"
  });

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  createReadStream(filePath).pipe(response);
}

function setCorsHeaders(request, response) {
  const origin = request.headers.origin;
  const configuredOrigin = process.env.ALLOWED_ORIGIN;

  if (configuredOrigin && origin === configuredOrigin) {
    response.setHeader("access-control-allow-origin", origin);
    response.setHeader("vary", "Origin");
  }

  response.setHeader("access-control-allow-methods", "GET, OPTIONS");
  response.setHeader("access-control-allow-headers", "Accept");
}

function parseInteger(value, fallback) {
  if (value === null || value === "") {
    return fallback;
  }

  return /^\d+$/.test(value) ? Number.parseInt(value, 10) : Number.NaN;
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "cache-control": "no-store, max-age=0",
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff"
  });
  response.end(JSON.stringify(payload));
}
