import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const DATA_PATH = new URL("../data/restaurants.json", import.meta.url);
const OUTPUT_DIR = new URL("../assets/restaurant-covers/", import.meta.url);
const OUTPUT_PREFIX = "./assets/restaurant-covers";
const CONCURRENCY = 12;

async function main() {
  const raw = await readFile(DATA_PATH, "utf8");
  const snapshot = JSON.parse(raw);
  const restaurants = snapshot.restaurants || [];

  await mkdir(OUTPUT_DIR, { recursive: true });
  await rm(OUTPUT_DIR, { recursive: true, force: true });
  await mkdir(OUTPUT_DIR, { recursive: true });

  let index = 0;
  let backedUp = 0;
  let missing = 0;

  async function worker() {
    while (index < restaurants.length) {
      const restaurant = restaurants[index++];
      const localHero = await backupRestaurantCover(restaurant);

      if (localHero) {
        restaurant.localHero = localHero;
        backedUp += 1;
      } else {
        delete restaurant.localHero;
        missing += 1;
      }

      if ((backedUp + missing) % 25 === 0) {
        process.stdout.write(`Backed up ${backedUp + missing}/${restaurants.length}\r`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  await writeFile(DATA_PATH, JSON.stringify(snapshot, null, 2) + "\n", "utf8");

  console.log(`\nSaved ${backedUp} local covers, ${missing} places stayed without a working image`);
}

async function backupRestaurantCover(restaurant) {
  const candidates = [];

  for (const image of restaurant.images || []) {
    if (image.thumb800) {
      candidates.push(image.thumb800);
    }

    if (image.original && image.original !== image.thumb800) {
      candidates.push(image.original);
    }
  }

  let attempt = 0;
  for (const url of candidates) {
    attempt += 1;
    const asset = await downloadImage(url, restaurant, attempt);
    if (asset) {
      return asset;
    }
  }

  return null;
}

async function downloadImage(url, restaurant, attempt) {
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "zradlomapa-web-image-backup/0.1"
      }
    });

    if (!response.ok) {
      return null;
    }

    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    const buffer = Buffer.from(await response.arrayBuffer());
    const imageAsset = inferImageAsset(buffer, contentType);

    if (!imageAsset) {
      return null;
    }

    const fileName = `${restaurant.id}-${slugify(restaurant.slug || restaurant.name)}-${attempt}.${imageAsset.ext}`;
    const filePath = join(OUTPUT_DIR.pathname, fileName);

    await writeFile(filePath, buffer);
    return `${OUTPUT_PREFIX}/${fileName}`;
  } catch {
    return null;
  }
}

function inferImageAsset(buffer, contentType) {
  if (contentType.startsWith("image/")) {
    return { ext: extensionFromContentType(contentType) };
  }

  if (hasSignature(buffer, [0xff, 0xd8, 0xff])) return { ext: "jpg" };
  if (hasSignature(buffer, [0x89, 0x50, 0x4e, 0x47])) return { ext: "png" };
  if (hasSignature(buffer, [0x47, 0x49, 0x46, 0x38])) return { ext: "gif" };
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return { ext: "webp" };
  }

  if (buffer.length >= 12 && buffer.toString("ascii", 4, 8) === "ftyp") {
    const brand = buffer.toString("ascii", 8, 12);
    if (brand.startsWith("avif")) {
      return { ext: "avif" };
    }
  }

  return null;
}

function extensionFromContentType(contentType) {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("avif")) return "avif";
  if (contentType.includes("gif")) return "gif";
  return "jpg";
}

function hasSignature(buffer, signature) {
  return signature.every((byte, index) => buffer[index] === byte);
}

function slugify(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
