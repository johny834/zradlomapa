import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";

const API_BASE = "https://api.hejlik.cz/api/v1/restaurants";
const PAGE_SIZE = 100;

async function main() {
  const restaurants = [];
  let offset = 0;

  while (true) {
    const url = `${API_BASE}?limit=${PAGE_SIZE}&offset=${offset}`;
    const response = await fetch(url, {
      headers: {
        "user-agent": "zradlomapa-web-sync/0.1"
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

  const dataDir = new URL("../data/", import.meta.url);
  const primaryPath = new URL("../data/restaurants.json", import.meta.url);
  const backupPath = new URL("../data/restaurants-backup.json", import.meta.url);

  await mergeLocalHeroMetadata(primaryPath, snapshot);
  await mkdir(dataDir, { recursive: true });
  await syncBackupSnapshot(primaryPath, backupPath);
  await writeFile(primaryPath, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
  await ensureBackupExists(primaryPath, backupPath);

  console.log(`\nSaved ${restaurants.length} restaurants to data/restaurants.json`);
}

async function syncBackupSnapshot(primaryPath, backupPath) {
  try {
    await copyFile(primaryPath, backupPath);
    console.log("Updated data/restaurants-backup.json from the last good snapshot");
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

async function ensureBackupExists(primaryPath, backupPath) {
  try {
    await access(backupPath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }

    await copyFile(primaryPath, backupPath);
    console.log("Created initial data/restaurants-backup.json backup");
  }
}

async function mergeLocalHeroMetadata(primaryPath, snapshot) {
  try {
    const raw = await readFile(primaryPath, "utf8");
    const previous = JSON.parse(raw);
    const heroById = new Map(
      (previous.restaurants || [])
        .filter((restaurant) => restaurant.localHero)
        .map((restaurant) => [restaurant.id, restaurant.localHero])
    );

    snapshot.restaurants = snapshot.restaurants.map((restaurant) =>
      heroById.has(restaurant.id)
        ? {
            ...restaurant,
            localHero: heroById.get(restaurant.id)
          }
        : restaurant
    );
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
