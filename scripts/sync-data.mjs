import { mkdir, writeFile } from "node:fs/promises";

const API_BASE = "https://api.hejlik.cz/api/v1/restaurants";
const PAGE_SIZE = 100;

async function main() {
  const restaurants = [];
  let offset = 0;

  while (true) {
    const url = `${API_BASE}?limit=${PAGE_SIZE}&offset=${offset}`;
    const response = await fetch(url, {
      headers: {
        "user-agent": "gastromapa-web-sync/0.1"
      }
    });

    if (!response.ok) {
      throw new Error(`API failed at offset ${offset}: ${response.status}`);
    }

    const payload = await response.json();
    const batch = payload.data || [];

    if (!batch.length) {
      break;
    }

    restaurants.push(...batch);
    offset += PAGE_SIZE;
    process.stdout.write(`Fetched ${restaurants.length} restaurants\r`);
  }

  const snapshot = {
    source: API_BASE,
    syncedAt: new Date().toISOString(),
    total: restaurants.length,
    restaurants
  };

  await mkdir(new URL("../data/", import.meta.url), { recursive: true });
  await writeFile(
    new URL("../data/restaurants.json", import.meta.url),
    JSON.stringify(snapshot, null, 2) + "\n",
    "utf8"
  );

  console.log(`\nSaved ${restaurants.length} restaurants to data/restaurants.json`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
