const queryInput = document.querySelector("#query");
const tagFilter = document.querySelector("#tagFilter");
const clearBtn = document.querySelector("#clearBtn");
const quickFilterChips = [...document.querySelectorAll(".quick-filter-chip")];
const themeToggleBtn = document.querySelector("#themeToggleBtn");
const themeToggleLabel = document.querySelector("#themeToggleLabel");
const openMapBtn = document.querySelector("#openMapBtn");
const openMapPreviewBtn = document.querySelector("#openMapPreviewBtn");
const closeMapBtn = document.querySelector("#closeMapBtn");
const locateUserBtn = document.querySelector("#locateUserBtn");
const mapOverlayNode = document.querySelector("#mapOverlay");
const mapMetaNode = document.querySelector("#mapMeta");
const mapCanvasNode = document.querySelector("#mapCanvas");
const mapQueryInput = document.querySelector("#mapQuery");
const mapTagFilter = document.querySelector("#mapTagFilter");
const resultsNode = document.querySelector("#results");
const detailNode = document.querySelector("#detail");
const detailOverlayNode = document.querySelector("#detailOverlay");
const detailBackdropNode = document.querySelector("#detailBackdrop");
const detailCloseBtn = document.querySelector("#detailCloseBtn");
const detailDrawerTitle = document.querySelector("#detailDrawerTitle");
const syncTimeNode = document.querySelector("#syncTime");
const recordCountNode = document.querySelector("#recordCount");
const resultMetaNode = document.querySelector("#resultMeta");
const resultTemplate = document.querySelector("#resultTemplate");
const galleryThumbTemplate = document.querySelector("#galleryThumbTemplate");
const themeColorMeta = document.querySelector('meta[name="theme-color"]');

const dayNames = ["", "Po", "Ut", "St", "Ct", "Pa", "So", "Ne"];
const defaultMapCenter = [49.8175, 15.473];
const defaultMapZoom = 7;
const THEME_CACHE_KEY = "zradlomapa:theme";
const THEME_COLORS = {
  light: "#f5f1eb",
  dark: "#11141b"
};
const DATASET_SOURCES = [
  { url: "./data/restaurants.json", label: "aktuální snapshot" },
  { url: "./data/restaurants-backup.json", label: "GitHub záloha" }
];
const DATASET_CACHE_KEY = "zradlomapa:last-good-snapshot";
const emojiByTagType = {
  brewery: "🍺",
  beer: "🍺",
  pub: "🍺",
  coffee: "☕",
  cafe: "☕",
  bakery: "🥐",
  bistro: "🍽️",
  restaurant: "🍴",
  bar: "🍸",
  wine: "🍷",
  pizza: "🍕",
  burger: "🍔",
  pastry: "🧁",
  dessert: "🍰",
  accommodation: "🛏️",
  shop: "🛍️",
  store: "🛍️"
};

let dataset = [];
let filtered = [];
let selectedRestaurantId = null;
let selectedImageIndex = 0;
let map = null;
let mapTileLayer = null;
let mapLayerGroup = null;
let userLocationMarker = null;
let userCoords = null;
let syncingMapControls = false;

boot();

async function boot() {
  try {
    const { payload, sourceLabel, fromCache } = await loadDatasetWithFallback();
    dataset = payload.restaurants.map(enrichRestaurant);

    syncTimeNode.textContent = formatSyncLabel(payload.syncedAt, sourceLabel, fromCache);
    recordCountNode.textContent = payload.total.toLocaleString("cs-CZ");

    hydrateTagFilter(dataset);
    wireEvents();
    applyTheme(getStoredTheme());
    syncMapControlsFromMain();
    restoreSelectionFromHash();
    runSearch();
  } catch (error) {
    syncTimeNode.textContent = "Chyba";
    resultsNode.innerHTML =
      '<div class="empty-state">Nepodařilo se načíst data. Obnovte stránku nebo spusťte synchronizaci znovu.</div>';
    detailNode.innerHTML =
      '<div class="empty-state">Detail zatím není k dispozici, protože se nepodařilo načíst podklady.</div>';
  }
}

async function loadDatasetWithFallback() {
  const failures = [];

  for (const source of DATASET_SOURCES) {
    try {
      const response = await fetch(source.url, { cache: "no-store" });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = await response.json();
      assertValidPayload(payload, source.label);
      rememberPayload(payload);
      return { payload, sourceLabel: source.label, fromCache: false };
    } catch (error) {
      failures.push(`${source.label}: ${error.message}`);
    }
  }

  const cachedPayload = readCachedPayload();
  if (cachedPayload) {
    return { payload: cachedPayload, sourceLabel: "místní záloha", fromCache: true };
  }

  throw new Error(failures.join(" | "));
}

function assertValidPayload(payload, label) {
  if (!payload || !Array.isArray(payload.restaurants)) {
    throw new Error(`${label} má neplatný formát`);
  }
}

function rememberPayload(payload) {
  try {
    window.localStorage.setItem(DATASET_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage failures; remote backup is still the primary safeguard.
  }
}

function readCachedPayload() {
  try {
    const raw = window.localStorage.getItem(DATASET_CACHE_KEY);
    if (!raw) {
      return null;
    }

    const payload = JSON.parse(raw);
    assertValidPayload(payload, "místní záloha");
    return payload;
  } catch {
    return null;
  }
}

function formatSyncLabel(syncedAt, sourceLabel, fromCache) {
  const timeLabel = new Date(syncedAt).toLocaleString("cs-CZ");
  if (fromCache) {
    return `${timeLabel} · místní záloha`;
  }

  if (sourceLabel !== "aktuální snapshot") {
    return `${timeLabel} · ${sourceLabel}`;
  }

  return timeLabel;
}

function wireEvents() {
  queryInput.addEventListener("input", () => {
    syncMapControlsFromMain();
    runSearch();
  });
  tagFilter.addEventListener("change", () => {
    syncMapControlsFromMain();
    runSearch();
  });
  clearBtn.addEventListener("click", () => {
    queryInput.value = "";
    tagFilter.value = "";
    syncMapControlsFromMain();
    runSearch();
  });
  themeToggleBtn?.addEventListener("click", () => {
    applyTheme(getCurrentTheme() === "light" ? "dark" : "light");
  });
  quickFilterChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const nextQuery = chip.dataset.query || "";
      queryInput.value = queryInput.value.trim().toLowerCase() === nextQuery.toLowerCase() ? "" : nextQuery;
      syncMapControlsFromMain();
      runSearch();
      scrollToFirstResult();
      queryInput.focus();
      queryInput.setSelectionRange(queryInput.value.length, queryInput.value.length);
    });
  });

  mapQueryInput.addEventListener("input", () => {
    if (syncingMapControls) {
      return;
    }

    queryInput.value = mapQueryInput.value;
    runSearch();
  });

  mapTagFilter.addEventListener("change", () => {
    if (syncingMapControls) {
      return;
    }

    tagFilter.value = mapTagFilter.value;
    runSearch();
  });

  openMapBtn.addEventListener("click", openMap);
  openMapPreviewBtn.addEventListener("click", openMap);
  closeMapBtn.addEventListener("click", closeMap);
  locateUserBtn.addEventListener("click", () => focusUserLocation(true));
  mapOverlayNode.addEventListener("click", (event) => {
    if (event.target === mapOverlayNode) {
      closeMap();
    }
  });

  detailBackdropNode.addEventListener("click", closeDetail);
  detailCloseBtn.addEventListener("click", closeDetail);

  window.addEventListener("hashchange", () => {
    const previousId = selectedRestaurantId;
    restoreSelectionFromHash();
    if (selectedRestaurantId !== previousId) {
      runSearch();
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (!mapOverlayNode.hidden) {
        closeMap();
        return;
      }

      if (!detailOverlayNode.hidden) {
        closeDetail();
      }
    }
  });
}

function getStoredTheme() {
  try {
    return window.localStorage.getItem(THEME_CACHE_KEY) || document.documentElement.dataset.theme || "light";
  } catch {
    return document.documentElement.dataset.theme || "light";
  }
}

function getCurrentTheme() {
  return document.documentElement.dataset.theme || "light";
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try {
    window.localStorage.setItem(THEME_CACHE_KEY, theme);
  } catch {
    // Ignore storage failures; the UI can still switch for the current session.
  }

  if (themeToggleLabel) {
    themeToggleLabel.textContent = theme === "light" ? "Light" : "Dark";
  }

  if (themeToggleBtn) {
    themeToggleBtn.setAttribute("aria-label", theme === "light" ? "Přepnout na dark mode" : "Přepnout na light mode");
    themeToggleBtn.setAttribute("title", theme === "light" ? "Přepnout na dark mode" : "Přepnout na light mode");
  }

  if (themeColorMeta) {
    themeColorMeta.setAttribute("content", THEME_COLORS[theme] || THEME_COLORS.light);
  }

  syncMapTheme();
}

function hydrateTagFilter(restaurants) {
  const tags = new Set();

  for (const item of restaurants) {
    for (const tag of item.tags) {
      tags.add(tag.name);
    }
  }

  const sortedTags = [...tags].sort((a, b) => a.localeCompare(b, "cs"));
  const selects = [tagFilter, mapTagFilter];

  for (const select of selects) {
    select.innerHTML = '<option value="">Všechny typy</option>';

    for (const tagName of sortedTags) {
      const option = document.createElement("option");
      option.value = tagName;
      option.textContent = tagName;
      select.append(option);
    }
  }
}

function syncMapControlsFromMain() {
  syncingMapControls = true;
  mapQueryInput.value = queryInput.value;
  mapTagFilter.value = tagFilter.value;
  syncingMapControls = false;
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
  paintQuickFilters();
  syncSelection();
  paintResults();
  refreshMapMarkers();

  if (selectedRestaurantId) {
    const current = filtered.find(({ item }) => item.id === selectedRestaurantId)?.item;
    if (current) {
      paintDetail(current);
      openDetail();
    }
  } else {
    closeDetail({ clearHash: false });
  }
}

function paintQuickFilters() {
  const activeQuery = queryInput.value.trim().toLowerCase();

  quickFilterChips.forEach((chip) => {
    const chipQuery = (chip.dataset.query || "").trim().toLowerCase();
    const isActive = Boolean(activeQuery) && chipQuery === activeQuery;
    chip.classList.toggle("is-active", isActive);
    chip.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

function scrollToFirstResult() {
  const firstResult = resultsNode.querySelector(".result-card");

  if (!firstResult) {
    return;
  }

  requestAnimationFrame(() => {
    firstResult.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function syncSelection() {
  const visibleIds = new Set(filtered.map(({ item }) => item.id));

  if (selectedRestaurantId && visibleIds.has(selectedRestaurantId)) {
    return;
  }

  if (window.location.hash) {
    selectedRestaurantId = null;
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
      '<div class="empty-state">Nic jsem nenašel. Zkuste přesnější název, město nebo jiný filtr.</div>';
    return;
  }

  for (const { item, score } of filtered) {
    const fragment = resultTemplate.content.cloneNode(true);
    const button = fragment.querySelector(".result-hit");
    const address = fragment.querySelector(".result-address");

    fragment.querySelector("h3").textContent = `${pickEmoji(item)} ${item.name}`;
    address.textContent = item.address;
    fragment.querySelector(".score-badge").textContent =
      item.mainTag?.name || (queryInput.value.trim() ? "Shoda" : "Výběr");

    if (item.id === selectedRestaurantId) {
      button.classList.add("is-active");
      button.setAttribute("aria-current", "true");
    }

    if (item.images?.length) {
      address.insertAdjacentHTML(
        "afterend",
        `<p class="result-meta">${item.images.length} fotografií · ${escapeHtml(item.city || "Neznámé místo")}</p>`
      );
    } else {
      address.insertAdjacentHTML(
        "afterend",
        `<p class="result-meta">${escapeHtml(item.city || "Neznámé místo")}</p>`
      );
    }

    const tagRow = fragment.querySelector(".tag-row");
    for (const tag of item.tags.slice(0, 4)) {
      const pill = document.createElement("span");
      pill.className = "tag-pill";
      pill.textContent = tag.name;
      tagRow.append(pill);
    }

    button.addEventListener("click", () => selectRestaurant(item.id));
    resultsNode.append(fragment);
  }
}

function selectRestaurant(restaurantId) {
  const restaurant = dataset.find((item) => item.id === restaurantId);

  if (!restaurant) {
    return;
  }

  selectedRestaurantId = restaurant.id;
  selectedImageIndex = 0;
  updateHash(restaurant);
  paintResults();
  paintDetail(restaurant);
  openDetail();
}

function paintDetail(item) {
  const images = getGalleryImages(item);
  const remoteImageCount = item.images?.length || 0;
  const safeIndex = Math.min(selectedImageIndex, Math.max(images.length - 1, 0));
  const activeImage = images[safeIndex];
  selectedImageIndex = safeIndex;
  detailDrawerTitle.textContent = `${pickEmoji(item)} ${item.name}`;

  detailNode.className = "detail-card";
  detailNode.innerHTML = `
    ${renderGallery(item, activeImage)}
    <div class="detail-copy">
      <div class="detail-header">
        <div>
          <h3 class="detail-title">${escapeHtml(pickEmoji(item))} ${escapeHtml(item.name)}</h3>
          <p class="detail-address">${escapeHtml(item.address)}</p>
        </div>
        <div class="detail-meta">
          <span>${escapeHtml(item.mainTag?.name || "Podnik")}</span>
          <span>${remoteImageCount ? `${remoteImageCount} fotografií` : images.length ? "1 záložní fotka" : "Bez fotografií"}</span>
        </div>
      </div>
      <div class="tag-row">
        ${item.tags.map((tag) => `<span class="tag-pill">${escapeHtml(tag.name)}</span>`).join("")}
      </div>
      <div class="detail-links">
        ${item.website ? `<a href="${escapeAttribute(item.website)}" target="_blank" rel="noreferrer">Web</a>` : ""}
        ${item.restaurantFacebookUrl ? `<a href="${escapeAttribute(item.restaurantFacebookUrl)}" target="_blank" rel="noreferrer">Facebook</a>` : ""}
        ${item.facebookPostUrl ? `<a href="${escapeAttribute(item.facebookPostUrl)}" target="_blank" rel="noreferrer">Příspěvek</a>` : ""}
        ${item.phone ? `<a href="tel:${escapeAttribute(item.phone)}">${escapeHtml(item.phone)}</a>` : ""}
        <a href="https://www.google.com/maps?q=${item.coordinates.latitude},${item.coordinates.longitude}" target="_blank" rel="noreferrer">Google Mapy</a>
      </div>
      <div class="detail-description">
        ${renderDescription(item.description)}
      </div>
      <section class="detail-section">
        <h3>Identifikace místa</h3>
        <div class="hint">${escapeHtml(item.slug)} · ${item.id}</div>
      </section>
      <section class="detail-section">
        <h3>Otevírací doba</h3>
        ${renderOpeningHours(item.openingTimes)}
      </section>
    </div>
  `;

  wireGallery(item);
}

function renderGallery(item, activeImage) {
  if (!activeImage) {
    return '<div class="detail-gallery detail-gallery-empty">U tohoto podniku zatím ve snapshotu nejsou žádné fotografie.</div>';
  }

  return `
    <div class="detail-gallery">
      <a class="gallery-hero" href="${escapeAttribute(getImageOriginalSrc(activeImage))}" target="_blank" rel="noreferrer">
        <img src="${escapeAttribute(getImageThumbSrc(activeImage))}" alt="Fotka podniku ${escapeAttribute(item.name)}" loading="eager" />
      </a>
      <div class="gallery-strip" id="galleryStrip"></div>
    </div>
  `;
}

function wireGallery(item) {
  const images = getGalleryImages(item);
  const strip = detailNode.querySelector("#galleryStrip");
  const heroLink = detailNode.querySelector(".gallery-hero");
  const heroImage = heroLink?.querySelector("img");

  if (!strip || !images.length) {
    return;
  }

  if (heroImage && heroLink) {
    heroImage.addEventListener(
      "error",
      () => {
        if (selectedImageIndex !== 0 && item.localHero) {
          selectedImageIndex = 0;
          paintDetail(item);
          return;
        }

        const fallback = images.findIndex((image, index) => index !== selectedImageIndex && getImageThumbSrc(image));
        if (fallback > -1 && fallback !== selectedImageIndex) {
          selectedImageIndex = fallback;
          paintDetail(item);
          return;
        }

        detailNode.querySelector(".detail-gallery")?.classList.add("detail-gallery-empty");
      },
      { once: true }
    );
  }

  images.slice(0, 8).forEach((image, index) => {
    const fragment = galleryThumbTemplate.content.cloneNode(true);
    const button = fragment.querySelector(".gallery-thumb");
    const img = fragment.querySelector("img");

    img.src = getImageThumbSrc(image);
    img.alt = `${item.name} foto ${index + 1}`;
    img.addEventListener("error", () => {
      button.remove();
    });

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
    return "<p>Popis zatím chybí.</p>";
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
    return '<p class="hint">Otevírací doba v dostupných datech zatím chybí.</p>';
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

function getGalleryImages(item) {
  const images = item.images || [];

  if (!item.localHero) {
    return images;
  }

  return [{ thumb800: item.localHero, original: item.localHero, isLocalHero: true }, ...images];
}

function getImageThumbSrc(image) {
  return image.thumb800 || image.original || "";
}

function getImageOriginalSrc(image) {
  return image.original || image.thumb800 || "";
}

function restoreSelectionFromHash() {
  const token = decodeURIComponent(window.location.hash.replace(/^#/, "").trim());

  if (!token) {
    selectedRestaurantId = null;
    return;
  }

  const match = dataset.find((item) => item.slug === token || String(item.id) === token);
  selectedRestaurantId = match?.id ?? null;
}

function updateHash(item) {
  const nextHash = item ? `#${encodeURIComponent(item.slug || item.id)}` : "";
  if (window.location.hash !== nextHash) {
    history.replaceState(null, "", nextHash || window.location.pathname + window.location.search);
  }
}

function openDetail() {
  document.body.classList.remove("map-open");
  mapOverlayNode.hidden = true;
  document.body.classList.add("detail-open");
  detailOverlayNode.hidden = false;
}

function closeDetail(options = {}) {
  document.body.classList.remove("detail-open");
  detailOverlayNode.hidden = true;

  if (options.clearHash !== false) {
    selectedRestaurantId = null;
    updateHash(null);
    paintResults();
  }
}

function openMap() {
  document.body.classList.remove("detail-open");
  detailOverlayNode.hidden = true;
  document.body.classList.add("map-open");
  mapOverlayNode.hidden = false;
  syncMapControlsFromMain();
  initMapIfNeeded();
  refreshMapMarkers();
  requestMapResize();
  focusUserLocation(false);
}

function closeMap() {
  document.body.classList.remove("map-open");
  mapOverlayNode.hidden = true;
}

function initMapIfNeeded() {
  if (map || !window.L) {
    return;
  }

  map = window.L.map(mapCanvasNode, {
    zoomControl: true,
    minZoom: 6
  }).setView(defaultMapCenter, defaultMapZoom);

  mapTileLayer = window.L.tileLayer(getMapTileUrl(), {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
  }).addTo(map);

  mapLayerGroup = window.L.layerGroup().addTo(map);
  window.addEventListener("resize", requestMapResize);
}

function getMapTileUrl() {
  return getCurrentTheme() === "dark"
    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
    : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
}

function syncMapTheme() {
  if (!map || !window.L) {
    return;
  }

  const nextUrl = getMapTileUrl();
  const currentUrl = mapTileLayer?._url;

  if (currentUrl === nextUrl) {
    return;
  }

  if (mapTileLayer) {
    map.removeLayer(mapTileLayer);
  }

  mapTileLayer = window.L.tileLayer(nextUrl, {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
  }).addTo(map);

  if (mapLayerGroup) {
    mapLayerGroup.bringToFront();
  }

  if (userLocationMarker) {
    userLocationMarker.bringToFront();
  }
}

function requestMapResize() {
  window.requestAnimationFrame(() => {
    map?.invalidateSize();
    window.setTimeout(() => map?.invalidateSize(), 180);
  });
}

function focusUserLocation(forcePrompt) {
  if (userCoords && !forcePrompt) {
    applyUserCenteredMapView();
    return;
  }

  if (!navigator.geolocation) {
    mapMetaNode.textContent = "Tento prohlížeč geolokaci nepodporuje.";
    return;
  }

  locateUserBtn.disabled = true;
  locateUserBtn.textContent = "Hledám polohu…";

  navigator.geolocation.getCurrentPosition(
    (position) => {
      userCoords = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      };
      paintUserLocation();
      applyUserCenteredMapView();
      locateUserBtn.disabled = false;
      locateUserBtn.textContent = "Moje poloha";
    },
    () => {
      locateUserBtn.disabled = false;
      locateUserBtn.textContent = "Moje poloha";
      mapMetaNode.textContent = "Polohu se nepodařilo zjistit. Zůstávám u pohledu na celé Česko.";
    },
    {
      enableHighAccuracy: true,
      timeout: 7000,
      maximumAge: 300000
    }
  );
}

function paintUserLocation() {
  if (!map || !userCoords || !window.L) {
    return;
  }

  if (userLocationMarker) {
    userLocationMarker.setLatLng([userCoords.latitude, userCoords.longitude]);
    return;
  }

  userLocationMarker = window.L.circleMarker([userCoords.latitude, userCoords.longitude], {
    radius: 8,
    weight: 2,
    color: "#ffffff",
    fillColor: "#58d6ff",
    fillOpacity: 0.95
  })
    .bindTooltip("Vaše poloha", {
      direction: "top",
      offset: [0, -8]
    })
    .addTo(map);
}

function applyUserCenteredMapView() {
  if (!map || !userCoords) {
    return;
  }

  const source = filtered.length ? filtered.map(({ item }) => item) : dataset;
  const nearby = source
    .map((item) => ({
      item,
      distanceKm: haversineKm(
        userCoords.latitude,
        userCoords.longitude,
        item.coordinates.latitude,
        item.coordinates.longitude
      )
    }))
    .filter((entry) => Number.isFinite(entry.distanceKm))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 40);

  const closeEnough = nearby.filter((entry) => entry.distanceKm <= 20);
  const selection = closeEnough.length ? closeEnough : nearby.slice(0, 20);
  const bounds = selection.map((entry) => [entry.item.coordinates.latitude, entry.item.coordinates.longitude]);
  bounds.push([userCoords.latitude, userCoords.longitude]);

  paintUserLocation();

  if (bounds.length > 1) {
    map.fitBounds(bounds, {
      padding: [40, 40],
      maxZoom: 15
    });
  } else {
    map.setView([userCoords.latitude, userCoords.longitude], 15);
  }

  const nearestCount = selection.length;
  mapMetaNode.textContent = nearestCount
    ? `Zobrazuji ${nearestCount} nejbližších podniků v okolí vaší polohy`
    : "Polohu jsem našel, ale v blízkém okolí zatím nic není.";
}

function refreshMapMarkers() {
  if (!map || !mapLayerGroup) {
    return;
  }

  const source = filtered.length ? filtered.map(({ item }) => item) : dataset;
  const bounds = paintMarkers(mapLayerGroup, source, { clickable: true });
  paintUserLocation();

  if (userCoords) {
    applyUserCenteredMapView();
    return;
  }

  mapMetaNode.textContent =
    filtered.length && filtered.length !== dataset.length
      ? `Zobrazuji ${filtered.length} podniků podle aktuálního filtru`
      : `Zobrazuji ${source.length} podniků napříč Českem`;

  fitMapToBounds(map, bounds);
}

function paintMarkers(layerGroup, source, options = {}) {
  layerGroup.clearLayers();
  const bounds = [];

  for (const item of source) {
    const { latitude, longitude } = item.coordinates;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      continue;
    }

    const marker = window.L.marker([latitude, longitude], {
      icon: window.L.divIcon({
        className: "emoji-map-marker",
        html: `<span>${pickEmoji(item)}</span>`,
        iconSize: options.iconSize || [24, 24],
        iconAnchor: options.iconAnchor || [12, 12]
      })
    });

    if (options.clickable !== false) {
      marker.bindTooltip(`<strong>${escapeHtml(pickEmoji(item))} ${escapeHtml(item.name)}</strong><br>${escapeHtml(item.city || item.address)}`, {
        direction: "top",
        offset: [0, -8]
      });

      marker.on("click", () => {
        closeMap();
        selectRestaurant(item.id);
      });
    }

    marker.addTo(layerGroup);
    bounds.push([latitude, longitude]);
  }

  return bounds;
}

function pickEmoji(item) {
  const tagTypes = item.tags.map((tag) => String(tag.type || "").toLowerCase());

  for (const tagType of tagTypes) {
    if (emojiByTagType[tagType]) {
      return emojiByTagType[tagType];
    }
  }

  if (item.accommodation) {
    return "🛏️";
  }

  return "📍";
}

function fitMapToBounds(instance, bounds, maxZoom = 13) {
  if (!instance) {
    return;
  }

  if (bounds.length) {
    instance.fitBounds(bounds, {
      padding: [40, 40],
      maxZoom
    });
  } else {
    instance.setView(defaultMapCenter, defaultMapZoom);
  }
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (value) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
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
