const queryInput = document.querySelector("#query");
const tagFilter = document.querySelector("#tagFilter");
const clearBtn = document.querySelector("#clearBtn");
const resultsNode = document.querySelector("#results");
const detailNode = document.querySelector("#detail");
const syncTimeNode = document.querySelector("#syncTime");
const recordCountNode = document.querySelector("#recordCount");
const resultMetaNode = document.querySelector("#resultMeta");
const resultTemplate = document.querySelector("#resultTemplate");
const galleryThumbTemplate = document.querySelector("#galleryThumbTemplate");

const dayNames = [
  "",
  "Po",
  "Ut",
  "St",
  "Ct",
  "Pa",
  "So",
  "Ne"
];

let dataset = [];
let filtered = [];
let selectedRestaurantId = null;
let selectedImageIndex = 0;

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
    restoreSelectionFromHash();
    runSearch();
  } catch (error) {
    syncTimeNode.textContent = "Chyba";
    resultsNode.innerHTML =
      '<div class="empty-state">Nepodarilo se nacist dataset. Zkus refresh nebo znovu spust synchronizaci.</div>';
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
  window.addEventListener("hashchange", () => {
    const previousId = selectedRestaurantId;
    restoreSelectionFromHash();
    if (selectedRestaurantId !== previousId) {
      runSearch();
    }
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

  resultMetaNode.textContent = `${filtered.length} vysledku`;
  syncSelection();
  paintResults();

  if (filtered[0]) {
    const current = filtered.find(({ item }) => item.id === selectedRestaurantId)?.item ?? filtered[0].item;
    paintDetail(current);
  } else {
    selectedRestaurantId = null;
    detailNode.className = "detail-empty";
    detailNode.textContent = "Nic. Zkus kratsi dotaz, jine mesto nebo vyhod tag filtr.";
  }
}

function syncSelection() {
  const visibleIds = new Set(filtered.map(({ item }) => item.id));

  if (selectedRestaurantId && visibleIds.has(selectedRestaurantId)) {
    return;
  }

  const next = filtered[0]?.item ?? null;
  selectedRestaurantId = next?.id ?? null;
  selectedImageIndex = 0;
  updateHash(next);
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
      '<div class="empty-state">Nic jsem nenasel. Tady to neni Google, zkus presnejsi jmeno nebo mesto.</div>';
    return;
  }

  for (const { item, score } of filtered) {
    const fragment = resultTemplate.content.cloneNode(true);
    const button = fragment.querySelector(".result-hit");
    fragment.querySelector("h3").textContent = item.name;
    fragment.querySelector(".result-address").textContent = item.address;
    fragment.querySelector(".score-badge").textContent = queryInput.value.trim() ? `score ${score}` : item.mainTag?.name || "tip";

    if (item.id === selectedRestaurantId) {
      button.classList.add("is-active");
      button.setAttribute("aria-current", "true");
    }

    const tagRow = fragment.querySelector(".tag-row");
    for (const tag of item.tags.slice(0, 4)) {
      const pill = document.createElement("span");
      pill.className = "tag-pill";
      pill.textContent = tag.name;
      tagRow.append(pill);
    }

    button.addEventListener("click", () => selectRestaurant(item.id, { scrollToDetail: true }));
    resultsNode.append(fragment);
  }
}

function selectRestaurant(restaurantId, options = {}) {
  const restaurant = dataset.find((item) => item.id === restaurantId);

  if (!restaurant) {
    return;
  }

  selectedRestaurantId = restaurant.id;
  selectedImageIndex = 0;
  updateHash(restaurant);
  paintResults();
  paintDetail(restaurant);

  if (options.scrollToDetail) {
    scrollDetailIntoView();
  }
}

function paintDetail(item) {
  const images = item.images || [];
  const safeIndex = Math.min(selectedImageIndex, Math.max(images.length - 1, 0));
  const activeImage = images[safeIndex];
  selectedImageIndex = safeIndex;

  detailNode.className = "detail-card";
  detailNode.innerHTML = `
    ${renderGallery(item, activeImage)}
    <div class="detail-copy">
      <div class="detail-header">
        <div>
          <h3 class="detail-title">${escapeHtml(item.name)}</h3>
          <p class="detail-address">${escapeHtml(item.address)}</p>
        </div>
        <div class="detail-meta">
          <span>${escapeHtml(item.mainTag?.name || "Podnik")}</span>
          <span>${images.length ? `${images.length} fotek` : "Bez fotek"}</span>
        </div>
      </div>
      <div class="tag-row">
        ${item.tags.map((tag) => `<span class="tag-pill">${escapeHtml(tag.name)}</span>`).join("")}
      </div>
      <div class="detail-links">
        ${item.website ? `<a href="${escapeAttribute(item.website)}" target="_blank" rel="noreferrer">Web</a>` : ""}
        ${item.restaurantFacebookUrl ? `<a href="${escapeAttribute(item.restaurantFacebookUrl)}" target="_blank" rel="noreferrer">Facebook</a>` : ""}
        ${item.facebookPostUrl ? `<a href="${escapeAttribute(item.facebookPostUrl)}" target="_blank" rel="noreferrer">Prispevek</a>` : ""}
        ${item.phone ? `<a href="tel:${escapeAttribute(item.phone)}">${escapeHtml(item.phone)}</a>` : ""}
        <a href="https://www.google.com/maps?q=${item.coordinates.latitude},${item.coordinates.longitude}" target="_blank" rel="noreferrer">Mapa</a>
      </div>
      <div class="detail-description">
        ${renderDescription(item.description)}
      </div>
      <section class="detail-section">
        <h3>Slug / ID</h3>
        <div class="hint">${escapeHtml(item.slug)} · ${item.id}</div>
      </section>
      <section class="detail-section">
        <h3>Oteviracka</h3>
        ${renderOpeningHours(item.openingTimes)}
      </section>
    </div>
  `;

  wireGallery(item);
}

function renderGallery(item, activeImage) {
  if (!activeImage) {
    return '<div class="detail-gallery detail-gallery-empty">Fotky tenhle snapshot nema. Skoda, no.</div>';
  }

  return `
    <div class="detail-gallery">
      <a class="gallery-hero" href="${escapeAttribute(activeImage.original)}" target="_blank" rel="noreferrer">
        <img src="${escapeAttribute(activeImage.thumb800 || activeImage.original)}" alt="Fotka podniku ${escapeAttribute(item.name)}" loading="eager" />
      </a>
      <div class="gallery-strip" id="galleryStrip"></div>
    </div>
  `;
}

function wireGallery(item) {
  const images = item.images || [];
  const strip = detailNode.querySelector("#galleryStrip");

  if (!strip || !images.length) {
    return;
  }

  images.slice(0, 8).forEach((image, index) => {
    const fragment = galleryThumbTemplate.content.cloneNode(true);
    const button = fragment.querySelector(".gallery-thumb");
    const img = fragment.querySelector("img");

    img.src = image.thumb800 || image.original;
    img.alt = `${item.name} foto ${index + 1}`;

    if (index === selectedImageIndex) {
      button.classList.add("is-active");
      button.setAttribute("aria-current", "true");
    }

    button.addEventListener("click", () => {
      selectedImageIndex = index;
      paintDetail(item);
    });

    strip.append(fragment);
  });
}

function renderDescription(description) {
  if (!description) {
    return '<p>Bez popisu.</p>';
  }

  return description
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join("");
}

function renderOpeningHours(openingTimes) {
  if (!openingTimes?.length) {
    return '<p class="hint">Oteviracka v datasetu chybi.</p>';
  }

  const rows = openingTimes
    .map((entry) => {
      const slots = entry.times.map((slot) => `${slot.from}-${slot.to}`).join(", ");
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
    images: item.images || [],
    tags: item.tags || [],
    coordinates: item.coordinates || { latitude: 50.0755, longitude: 14.4378 },
    nameLc: item.name.toLowerCase(),
    addressLc: address.toLowerCase(),
    cityLc: city.toLowerCase(),
    descriptionLc: (item.description || "").toLowerCase(),
    slugLc: (item.slug || "").toLowerCase(),
    tagsLc: (item.tags || []).map((tag) => tag.name.toLowerCase())
  };
}

function restoreSelectionFromHash() {
  const token = decodeURIComponent(window.location.hash.replace(/^#/, "").trim());

  if (!token) {
    return;
  }

  const match = dataset.find((item) => item.slug === token || String(item.id) === token);
  if (match) {
    selectedRestaurantId = match.id;
  }
}

function updateHash(item) {
  const nextHash = item ? `#${encodeURIComponent(item.slug || item.id)}` : "";
  if (window.location.hash !== nextHash) {
    history.replaceState(null, "", nextHash || window.location.pathname + window.location.search);
  }
}

function scrollDetailIntoView() {
  if (!window.matchMedia("(max-width: 1180px)").matches) {
    return;
  }

  document.querySelector(".detail-panel")?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("'", "&#39;");
}
