const configuredEndpoint =
  document.querySelector('meta[name="zradlomapa-api"]')?.content ||
  "./api/restaurants";
const LIVE_API_ENDPOINT = ["localhost", "127.0.0.1"].includes(location.hostname)
  ? "./api/restaurants"
  : configuredEndpoint;
const API_PAGE_SIZE = 100;
const API_MAX_PAGES = 100;
const API_BATCH_SIZE = 2;
const API_MAX_RETRIES = 2;

export async function loadRestaurantsLive(onProgress = () => {}) {
  const restaurants = [];

  for (let page = 0; page < API_MAX_PAGES; page += API_BATCH_SIZE) {
    const pages = await Promise.all(
      Array.from({ length: API_BATCH_SIZE }, (_, batchIndex) => {
        const offset = (page + batchIndex) * API_PAGE_SIZE;
        return loadApiPage(offset);
      }),
    );

    for (const pageData of pages) {
      restaurants.push(...pageData);
      onProgress(restaurants, pageData);
      if (pageData.length < API_PAGE_SIZE) {
        return restaurants;
      }
    }
  }

  throw new Error(
    `Live API překročilo bezpečnostní limit ${API_MAX_PAGES} stránek`,
  );
}

async function loadApiPage(offset) {
  let lastError;

  for (let attempt = 0; attempt <= API_MAX_RETRIES; attempt += 1) {
    const url = new URL(LIVE_API_ENDPOINT, window.location.href);
    url.searchParams.set("limit", String(API_PAGE_SIZE));
    url.searchParams.set("offset", String(offset));

    if (url.hostname === "r.jina.ai") {
      url.searchParams.set("_live", String(Date.now()));
    }

    try {
      const response = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(20000),
        headers: {
          accept: "application/json, text/plain",
          ...(url.hostname === "r.jina.ai" ? { "X-No-Cache": "true" } : {}),
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = await parseApiPayload(
        response,
        url.hostname === "r.jina.ai",
      );
      if (!payload || !Array.isArray(payload.data)) {
        throw new Error("neplatný formát odpovědi");
      }

      return payload.data;
    } catch (error) {
      lastError = error;
      if (attempt < API_MAX_RETRIES) {
        await wait(500 * 2 ** attempt);
      }
    }
  }

  throw new Error(
    `Live API selhalo na offsetu ${offset}: ${lastError?.message || "neznámá chyba"}`,
  );
}

async function parseApiPayload(response, wrappedByJina) {
  if (!wrappedByJina) {
    return response.json();
  }

  const text = await response.text();
  const jsonStart = text.indexOf('{"data":');
  if (jsonStart === -1) {
    throw new Error("CORS bridge nevrátil JSON z Gastromapy");
  }

  return JSON.parse(text.slice(jsonStart).trim());
}

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}
