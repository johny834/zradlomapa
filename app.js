const queryInput = document.querySelector("#query");
const tagFilter = document.querySelector("#tagFilter");
const clearBtn = document.querySelector("#clearBtn");
const resultsNode = document.querySelector("#results");
const detailNode = document.querySelector("#detail");
const syncTimeNode = document.querySelector("#syncTime");
const recordCountNode = document.querySelector("#recordCount");
const resultMetaNode = document.querySelector("#resultMeta");
const resultTemplate = document.querySelector("#resultTemplate");

const dayNames = [
  "",
  "Po",
  "Út",
  "St",
  "Čt",
  "Pá",
  "So",
  "Ne"
];

let dataset = [];
let filtered = [];

boot();

async function boot() {
  try {
    const response = await fetch("./data/restaurants.json", { cache: "no-store" });
    const payload = await response.json();
    dataset = payload.restaurants.map(enrichRestaurant);

    syncTimeNode.textContent = new Date(payload.syncedAt).toLocaleString("cs-CZ");
    recordCountNode.textContent = payload.total.toLocaleString("cs-CZ");

    hydrateTagFilter(dataset);
    wireEvents();
    runSearch();
  } catch (error) {
    syncTimeNode.textContent = "Chyba";
    resultsNode.innerHTML =
      '<div class="empty-state">Nepodařilo se načíst dataset. Zkus refresh nebo znovu spusť synchronizaci.</div>';
    detailNode.textContent = error.message;
  }
}

function wireEvents() {
  queryInput.addEventListener("input", runSearch);
  tagFilter.addEventListener("change", runSearch);
  clearBtn.addEventListener("click", () => {
    queryInput.value = "";
    tagFilter.value = "";
    runSearch();
  });
}

function hydrateTagFilter(restaurants) {
  const tags = new Set();

  for (const item of restaurants) {
    for (const tag of item.tags) {
      tags.add(tag.name);
    }
  }

  for (const tagName of [...tags].sort((a, b) => a.localeCompare(b, "cs"))) {
    const option = document.createElement("option");
    option.value = tagName;
    option.textContent = tagName;
    tagFilter.append(option);
  }
}

function runSearch() {
  const query = queryInput.value.trim().toLowerCase();
  const activeTag = tagFilter.value;

  filtered = dataset
    .map((item) => ({ item, score: scoreItem(item, query) }))
    .filter(({ item, score }) => {
      const tagMatches = !activeTag || item.tags.some((tag) => tag.name === activeTag);
      const queryMatches = !query || score > 0;
      return tagMatches && queryMatches;
    })
    .sort((left, right) => right.score - left.score || left.item.name.localeCompare(right.item.name, "cs"))
    .slice(0, 120);

  resultMetaNode.textContent = `${filtered.length} výsledků`;
  paintResults();

  if (filtered[0]) {
    paintDetail(filtered[0].item);
  } else {
    detailNode.className = "detail-empty";
    detailNode.textContent = "Nic. Zkus kratší dotaz, jiné město nebo vyhoď tag filtr.";
  }
}

function scoreItem(item, query) {
  if (!query) {
    return 1;
  }

  let score = 0;
  if (item.nameLc.includes(query)) score += 120;
  if (item.addressLc.includes(query)) score += 55;
  if (item.cityLc.includes(query)) score += 40;
  if (item.tagsLc.some((tag) => tag.includes(query))) score += 35;
  if (item.descriptionLc.includes(query)) score += 14;
  if (item.slugLc.includes(query)) score += 18;
  return score;
}

function paintResults() {
  resultsNode.innerHTML = "";

  if (!filtered.length) {
    resultsNode.innerHTML =
      '<div class="empty-state">Nic jsem nenašel. Tady to není Google, zkus přesnější jméno nebo město.</div>';
    return;
  }

  for (const { item, score } of filtered) {
    const fragment = resultTemplate.content.cloneNode(true);
    const button = fragment.querySelector(".result-hit");
    fragment.querySelector("h3").textContent = item.name;
    fragment.querySelector(".result-address").textContent = item.address;
    fragment.querySelector(".score-badge").textContent = queryInput.value.trim() ? `score ${score}` : item.mainTag?.name || "tip";

    const tagRow = fragment.querySelector(".tag-row");
    for (const tag of item.tags.slice(0, 4)) {
      const pill = document.createElement("span");
      pill.className = "tag-pill";
      pill.textContent = tag.name;
      tagRow.append(pill);
    }

    button.addEventListener("click", () => paintDetail(item));
    resultsNode.append(fragment);
  }
}

function paintDetail(item) {
  detailNode.className = "detail-card";
  detailNode.innerHTML = `
    <h3 class="detail-title">${escapeHtml(item.name)}</h3>
    <p class="detail-address">${escapeHtml(item.address)}</p>
    <div class="tag-row">
      ${item.tags.map((tag) => `<span class="tag-pill">${escapeHtml(tag.name)}</span>`).join("")}
    </div>
    <div class="detail-links">
      ${item.website ? `<a href="${item.website}" target="_blank" rel="noreferrer">Web</a>` : ""}
      ${item.restaurantFacebookUrl ? `<a href="${item.restaurantFacebookUrl}" target="_blank" rel="noreferrer">Facebook</a>` : ""}
      ${item.phone ? `<a href="tel:${item.phone}">${escapeHtml(item.phone)}</a>` : ""}
      <a href="https://www.google.com/maps?q=${item.coordinates.latitude},${item.coordinates.longitude}" target="_blank" rel="noreferrer">Mapa</a>
    </div>
    <p>${escapeHtml(item.description || "Bez popisu.")}</p>
    <section class="detail-section">
      <h3>Slug / ID</h3>
      <div class="hint">${escapeHtml(item.slug)} · ${item.id}</div>
    </section>
    <section class="detail-section">
      <h3>Otvíračka</h3>
      ${renderOpeningHours(item.openingTimes)}
    </section>
  `;
}

function renderOpeningHours(openingTimes) {
  if (!openingTimes?.length) {
    return '<p class="hint">Otvíračka v datasetu chybí.</p>';
  }

  const rows = openingTimes
    .map((entry) => {
      const slots = entry.times.map((slot) => `${slot.from}–${slot.to}`).join(", ");
      return `<li>${dayNames[entry.day] || entry.day}: ${slots}</li>`;
    })
    .join("");

  return `<ul class="hours-list">${rows}</ul>`;
}

function enrichRestaurant(item) {
  const address = item.address || "";
  const city = address.split(",")[1]?.trim() || "";
  return {
    ...item,
    address,
    city,
    nameLc: item.name.toLowerCase(),
    addressLc: address.toLowerCase(),
    cityLc: city.toLowerCase(),
    descriptionLc: (item.description || "").toLowerCase(),
    slugLc: (item.slug || "").toLowerCase(),
    tagsLc: (item.tags || []).map((tag) => tag.name.toLowerCase())
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
