import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const trackedFiles = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);

const forbiddenPaths = trackedFiles.filter((file) =>
  /^(data\/|assets\/restaurant-covers\/)|(^|\/)restaurants(?:-backup)?\.json$/i.test(file)
);

const oversizedFiles = trackedFiles.filter((file) => statSync(file).size > 2_000_000);
const forbiddenContentMarkers = [
  "data/restaurants.json",
  "data/restaurants-backup.json",
  "assets/restaurant-covers/",
  "zradlomapa-web-sync/",
  "zradlomapa-web-image-backup/"
];
const markedFiles = [];

for (const file of trackedFiles.filter(isSourceFile)) {
  const content = readFileSync(file, "utf8");
  if (forbiddenContentMarkers.some((marker) => content.includes(marker))) {
    markedFiles.push(file);
  }
}

const failures = [
  ...forbiddenPaths.map((file) => `forbidden path: ${file}`),
  ...oversizedFiles.map((file) => `tracked file over 2 MB: ${file}`),
  ...markedFiles.map((file) => `forbidden snapshot reference: ${file}`)
];

if (failures.length) {
  console.error("Proprietary-data guard failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("No tracked restaurant snapshots or downloaded covers found.");

function isSourceFile(file) {
  return /\.(?:html|js|mjs|yml|yaml)$/i.test(file) && file !== "scripts/check-no-proprietary-data.mjs";
}
