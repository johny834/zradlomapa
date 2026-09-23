import { loadRestaurantsLive } from "./api.js";
const queryInput = document.querySelector("#query");
const locationInput = document.querySelector("#locationQuery");
const tagFilter = document.querySelector("#tagFilter");
const clearBtn = document.querySelector("#clearBtn");
const quickFilterChips = [...document.querySelectorAll(".quick-filter-chip")];
const cityFilterChips = quickFilterChips.filter((chip) => chip.dataset.query);
const nearMeBtn = document.querySelector("#nearMeBtn");
const themeToggleBtn = document.querySelector("#themeToggleBtn");
const themeToggleIcon = document.querySelector("#themeToggleIcon");
const openMapBtn = document.querySelector("#openMapBtn");
const closeMapBtn = document.querySelector("#closeMapBtn");
const locateUserBtn = document.querySelector("#locateUserBtn");
const mapOverlayNode = document.querySelector("#mapOverlay");
const mapMetaNode = document.querySelector("#mapMeta");
const mapCanvasNode = document.querySelector("#mapCanvas");
const mapLocationInput = document.querySelector("#mapLocationQuery");
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

const dayNames = ["", "Po", "Út", "St", "Čt", "Pá", "So", "Ne"];
const defaultMapCenter = [49.8175, 15.473];
const defaultMapZoom = 7;
const THEME_CACHE_KEY = "zradlomapa:theme";
const RESULTS_PAGE_SIZE = 24;
let renderLimit = RESULTS_PAGE_SIZE;
let returnFocus = null;
let loading = false;
const loadMoreBtn = document.querySelector("#loadMoreBtn");
const retryBtn = document.querySelector("#retryBtn");
const THEME_COLORS = {
  light: "#f8f6f1",
  dark: "#171b17",
};
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
  store: "🛍️",
};

let dataset = [];
let filtered = [];
let selectedRestaurantId = null;
let selectedImageIndex = 0;
let map = null;
let mapTileLayer = null;
let mapLayerGroup = null;
let mapMarkerSource = [];
let userLocationMarker = null;
let userCoords = null;
let syncingMapControls = false;
let locationMode = "text";

if (!window.location.hash && !locationInput.value) {
  locationInput.value = cityFilterChips[0]?.dataset.query || "Praha";
}

wireEvents();
applyTheme(getStoredTheme());
boot();

async function boot() {
  if (loading) return;
  loading = true;
  retryBtn.hidden = true;
  dataset = [];
  filtered = [];
  resultsNode.replaceChildren();
  loadMoreBtn.hidden = true;
  resultsNode.setAttribute("aria-busy", "true");
  syncTimeNode.textContent = "Načítám podniky…";
  try {
    const restaurants = await loadRestaurantsLive((restaurants, page) => {
      dataset.push(...page.map(enrichRestaurant));
      syncTimeNode.textContent = `Načítám další podniky… ${restaurants.length}`;
      const activeTag = tagFilter.value;
      hydrateTagFilter(dataset);
      tagFilter.value = activeTag;
      syncMapControlsFromMain();
      if (!selectedRestaurantId) restoreSelectionFromHash();
      runSearch({ progressive: true });
    });
    dataset = restaurants.map(enrichRestaurant);

    syncTimeNode.textContent = `Aktualizováno v ${new Date().toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}`;
    recordCountNode.textContent = dataset.length.toLocaleString("cs-CZ");

    const activeTag = tagFilter.value;
    hydrateTagFilter(dataset);
    tagFilter.value = activeTag;
    applyTheme(getStoredTheme());
    syncMapControlsFromMain();
    restoreSelectionFromHash();
    runSearch();
  } catch (error) {
    console.error(error);
    syncTimeNode.textContent = dataset.length
      ? `Načítání se přerušilo. K dispozici je ${dataset.length} podniků.`
      : "Podniky se nepodařilo načíst.";
    resultMetaNode.textContent = dataset.length
      ? `${filtered.length} podniků · neúplný seznam`
      : "Nedostupné připojení";
    retryBtn.hidden = false;
    if (!dataset.length)
      resultsNode.innerHTML =
        '<div class="empty-state">Nepodařilo se načíst živá data. Zkuste stránku obnovit později.</div>';
    if (!dataset.length)
      detailNode.innerHTML =
        '<div class="empty-state">Detail není k dispozici, protože živé API neodpovědělo.</div>';
  } finally {
    loading = false;
    if (retryBtn.hidden)
      resultMetaNode.textContent = `${filtered.length} podniků`;
    resultsNode.setAttribute("aria-busy", "false");
  }
}

function wireEvents() {
  retryBtn.addEventListener("click", boot);
  loadMoreBtn.addEventListener("click", () => {
    const previous = renderLimit;
    renderLimit += RESULTS_PAGE_SIZE;
    paintResults();
    resultsNode.querySelectorAll(".result-hit")[previous]?.focus();
  });
  queryInput.addEventListener("input", () => {
    syncMapControlsFromMain();
    runSearch();
  });
  locationInput.addEventListener("input", () => {
    locationMode = "text";
    syncMapControlsFromMain();
    runSearch();
  });
  tagFilter.addEventListener("change", () => {
    syncMapControlsFromMain();
    runSearch();
  });
  clearBtn.addEventListener("click", () => {
    queryInput.value = "";
    locationInput.value = "";
    tagFilter.value = "";
    locationMode = "text";
    syncMapControlsFromMain();
    runSearch();
    locationInput.focus();
  });
  themeToggleBtn?.addEventListener("click", () => {
    applyTheme(getCurrentTheme() === "light" ? "dark" : "light");
  });
  cityFilterChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const nextQuery = chip.dataset.query || "";
      locationMode = "text";
      locationInput.value =
        locationInput.value.trim().toLowerCase() === nextQuery.toLowerCase()
          ? ""
          : nextQuery;
      syncMapControlsFromMain();
      runSearch();
      locationInput.blur();
    });
  });
  nearMeBtn.addEventListener("click", () => requestUserLocation(true));

  mapLocationInput.addEventListener("input", () => {
    if (syncingMapControls) {
      return;
    }

    locationMode = "text";
    locationInput.value = mapLocationInput.value;
    runSearch();
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

  closeMapBtn.addEventListener("click", closeMap);
  locateUserBtn.addEventListener("click", () => requestUserLocation(true));
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
    if (event.key === "Tab") {
      const overlay = !detailOverlayNode.hidden
        ? detailOverlayNode
        : !mapOverlayNode.hidden
          ? mapOverlayNode
          : null;
      if (overlay) {
        const nodes = [
          ...overlay.querySelectorAll(
            'button, a[href], input, select, [tabindex="0"]',
          ),
        ].filter((node) => !node.disabled && node.getClientRects().length);
        const first = nodes[0],
          last = nodes.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    }
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
    return (
      window.localStorage.getItem(THEME_CACHE_KEY) ||
      document.documentElement.dataset.theme ||
      "light"
    );
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

  if (themeToggleIcon) {
    themeToggleIcon.textContent = theme === "light" ? "☀" : "☾";
  }

  if (themeToggleBtn) {
    themeToggleBtn.setAttribute(
      "aria-label",
      theme === "light" ? "Přepnout na dark mode" : "Přepnout na light mode",
    );
    themeToggleBtn.setAttribute(
      "title",
      theme === "light" ? "Přepnout na dark mode" : "Přepnout na light mode",
    );
  }

  if (themeColorMeta) {
    themeColorMeta.setAttribute(
      "content",
      THEME_COLORS[theme] || THEME_COLORS.light,
    );
  }
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
  mapLocationInput.value = locationInput.value;
  mapQueryInput.value = queryInput.value;
  mapTagFilter.value = tagFilter.value;
  syncingMapControls = false;
}

function runSearch({ progressive = false } = {}) {
  if (!progressive) renderLimit = RESULTS_PAGE_SIZE;
  const query = normalizeText(queryInput.value.trim());
  const locationQuery = normalizeText(locationInput.value.trim());
  const activeTag = tagFilter.value;

  filtered = dataset
    .map((item) => ({
      item,
      score: scoreItem(item, query),
      distanceKm: userCoords
        ? haversineKm(
            userCoords.latitude,
            userCoords.longitude,
            item.coordinates.latitude,
            item.coordinates.longitude,
          )
        : Number.POSITIVE_INFINITY,
    }))
    .filter(({ item, score }) => {
      const tagMatches =
        !activeTag || item.tags.some((tag) => tag.name === activeTag);
      const queryMatches = !query || score > 0;
      const locationMatches =
        locationMode === "nearby" ||
        !locationQuery ||
        item.addressLc.includes(locationQuery) ||
        item.cityLc.includes(locationQuery);
      return tagMatches && queryMatches && locationMatches;
    })
    .sort((left, right) => {
      if (locationMode === "nearby") {
        return (
          left.distanceKm - right.distanceKm ||
          right.score - left.score ||
          left.item.name.localeCompare(right.item.name, "cs")
        );
      }

      return (
        right.score - left.score ||
        left.item.name.localeCompare(right.item.name, "cs")
      );
    });

  resultMetaNode.textContent = `${filtered.length} podniků${loading ? " · načítání pokračuje" : ""}`;
  openMapBtn.textContent = `Mapa · ${filtered.length}`;
  openMapBtn.setAttribute(
    "aria-label",
    `Zobrazit ${filtered.length} podniků na mapě`,
  );
  paintQuickFilters();
  syncSelection();
  paintResults();
  refreshMapMarkers(progressive);

  if (progressive && !detailOverlayNode.hidden) return;
  if (selectedRestaurantId) {
    const current = dataset.find((item) => item.id === selectedRestaurantId);
    if (current) {
      paintDetail(current);
      openDetail();
    }
  } else {
    closeDetail({ clearHash: false });
  }
}

function paintQuickFilters() {
  const activeQuery = locationInput.value.trim().toLowerCase();

  cityFilterChips.forEach((chip) => {
    const chipQuery = (chip.dataset.query || "").trim().toLowerCase();
    const isActive =
      locationMode === "text" &&
      Boolean(activeQuery) &&
      chipQuery === activeQuery;
    chip.classList.toggle("is-active", isActive);
    chip.setAttribute("aria-pressed", isActive ? "true" : "false");
  });

  nearMeBtn.classList.toggle("is-active", locationMode === "nearby");
  nearMeBtn.setAttribute(
    "aria-pressed",
    locationMode === "nearby" ? "true" : "false",
  );
}

function syncSelection() {
  if (!dataset.some((item) => item.id === selectedRestaurantId))
    selectedRestaurantId = null;
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function scoreItem(item, query) {
  if (!query) {
    return 1;
  }

  let score = 0;
  if (item.nameLc.includes(query)) score += 120;
  if (item.tagsLc.some((tag) => tag.includes(query))) score += 35;
  if (item.descriptionLc.includes(query)) score += 14;
  if (item.slugLc.includes(query)) score += 18;
  return score;
}

function paintResults() {
  resultsNode.innerHTML = "";
  loadMoreBtn.hidden = filtered.length <= renderLimit;

  if (!filtered.length) {
    resultsNode.innerHTML =
      '<div class="empty-state">Nic jsem nenašel. Zkuste přesnější název, město nebo jiný filtr.</div>';
    return;
  }

  for (const { item, distanceKm } of getRenderableResults()) {
    const fragment = resultTemplate.content.cloneNode(true);
    const button = fragment.querySelector(".result-hit");
    button.dataset.restaurantId = String(item.id);
    const address = fragment.querySelector(".result-address");
    const availability = getOpeningSummary(item.openingTimes);
    const availabilityBadge = fragment.querySelector(".availability-badge");
    const distanceNode = fragment.querySelector(".result-distance");

    fragment.querySelector("h3").textContent =
      `${pickEmoji(item)} ${item.name}`;
    fragment.querySelector(".result-locality").textContent =
      `⌖ ${getLocality(item)}`;
    address.textContent = item.address;
    availabilityBadge.textContent = availability.statusLabel;
    availabilityBadge.dataset.state = availability.state;
    availabilityBadge.hidden = availability.state === "unknown";
    distanceNode.textContent =
      locationMode === "nearby" && Number.isFinite(distanceKm)
        ? formatDistance(distanceKm)
        : "";

    if (item.id === selectedRestaurantId) {
      button.classList.add("is-active");
      button.setAttribute("aria-current", "true");
    }

    const tagRow = fragment.querySelector(".tag-row");
    for (const tag of item.tags.slice(0, 3)) {
      const pill = document.createElement("span");
      pill.className = "tag-pill";
      pill.textContent = tag.name;
      tagRow.append(pill);
    }

    button.addEventListener("click", () => selectRestaurant(item.id));
    resultsNode.append(fragment);
  }
}

function getRenderableResults() {
  const visible = filtered.slice(0, renderLimit);

  if (!selectedRestaurantId) {
    return visible;
  }

  const alreadyVisible = visible.some(
    ({ item }) => item.id === selectedRestaurantId,
  );
  if (alreadyVisible) {
    return visible;
  }

  const selectedEntry = filtered.find(
    ({ item }) => item.id === selectedRestaurantId,
  );
  if (!selectedEntry) {
    return visible;
  }

  return [...visible.slice(0, Math.max(renderLimit - 1, 0)), selectedEntry];
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
  const opening = getOpeningSummary(item.openingTimes);
  const descriptionIsLong = (item.description || "").length > 320;
  const safeIndex = Math.min(
    selectedImageIndex,
    Math.max(images.length - 1, 0),
  );
  const activeImage = images[safeIndex];
  selectedImageIndex = safeIndex;
  detailDrawerTitle.textContent = `${pickEmoji(item)} ${item.name}`;

  detailNode.className = "detail-card";
  detailNode.innerHTML = `
    <div class="detail-copy detail-copy-primary">
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
      <div class="detail-hours-summary" data-state="${opening.state}">
        <strong>${escapeHtml(opening.statusLabel)}</strong>
        <span>${escapeHtml(opening.scheduleLabel)}</span>
      </div>
      <div class="tag-row">
        ${item.tags.map((tag) => `<span class="tag-pill">${escapeHtml(tag.name)}</span>`).join("")}
      </div>
      <div class="detail-links">
        <a class="detail-primary-action" href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(Number.isFinite(item.coordinates.latitude) && Number.isFinite(item.coordinates.longitude) ? `${item.coordinates.latitude},${item.coordinates.longitude}` : `${item.name} ${item.address}`)}" target="_blank" rel="noreferrer">Navigovat ↗</a>
        ${item.phone ? `<a href="tel:${escapeAttribute(item.phone)}">Zavolat</a>` : ""}
        ${item.website ? `<a href="${escapeAttribute(item.website)}" target="_blank" rel="noreferrer">Web</a>` : ""}
        ${item.restaurantFacebookUrl ? `<a href="${escapeAttribute(item.restaurantFacebookUrl)}" target="_blank" rel="noreferrer">Facebook</a>` : ""}
        ${item.facebookPostUrl ? `<a href="${escapeAttribute(item.facebookPostUrl)}" target="_blank" rel="noreferrer">Gastromapa příspěvek</a>` : ""}
      </div>
    </div>
    ${renderGallery(item, activeImage)}
    <div class="detail-copy detail-copy-secondary">
      <section class="detail-section">
        <h3>O podniku</h3>
        <div id="detailDescription" class="detail-description${descriptionIsLong ? " is-collapsed" : ""}">
          ${renderDescription(item.description)}
        </div>
        ${descriptionIsLong ? '<button id="detailDescriptionToggle" class="detail-description-toggle" type="button" aria-expanded="false">Zobrazit více</button>' : ""}
      </section>
      <section class="detail-section">
        <h3>Otevírací doba</h3>
        ${renderOpeningHours(item.openingTimes)}
      </section>
    </div>
  `;

  wireGallery(item);
  wireDetailDescription();
}

function renderGallery(item, activeImage) {
  if (!activeImage) {
    return '<div class="detail-gallery detail-gallery-empty">U tohoto podniku živé API nevrátilo žádné fotografie.</div>';
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
        const gallery = detailNode.querySelector(".detail-gallery");
        gallery.classList.add("detail-gallery-empty");
        gallery.textContent = "Fotografie není dostupná.";
      },
      { once: true },
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

function wireDetailDescription() {
  const description = detailNode.querySelector("#detailDescription");
  const toggle = detailNode.querySelector("#detailDescriptionToggle");

  if (!description || !toggle) {
    return;
  }

  toggle.addEventListener("click", () => {
    const expanded = toggle.getAttribute("aria-expanded") === "true";
    description.classList.toggle("is-collapsed", expanded);
    toggle.setAttribute("aria-expanded", expanded ? "false" : "true");
    toggle.textContent = expanded ? "Zobrazit více" : "Zobrazit méně";
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
      const slots = (entry.times || [])
        .map((slot) => `${escapeHtml(slot.from)}–${escapeHtml(slot.to)}`)
        .join(", ");
      return `<li>${dayNames[entry.day] || escapeHtml(entry.day)}: ${slots}</li>`;
    })
    .join("");

  return `<ul class="hours-list">${rows}</ul>`;
}

function getOpeningSummary(openingTimes, now = new Date()) {
  if (!openingTimes?.length) {
    return {
      state: "unknown",
      statusLabel: "Otevírací doba neuvedena",
      scheduleLabel: "Zdroj dnes neuvádí otevírací dobu",
    };
  }

  const { day, minutes } = getPragueClock(now);
  const today = openingTimes.find((entry) => Number(entry.day) === day);
  const previousDay = day === 1 ? 7 : day - 1;
  const previous = openingTimes.find(
    (entry) => Number(entry.day) === previousDay,
  );
  const todaySlots = today?.times || [];
  const scheduleLabel = todaySlots.length
    ? `Dnes ${todaySlots.map((slot) => `${slot.from}–${slot.to}`).join(", ")}`
    : "Dnes zavřeno";

  const overnightPrevious = (previous?.times || []).find((slot) => {
    const from = parseTimeMinutes(slot.from);
    const to = parseTimeMinutes(slot.to);
    return Number.isFinite(from) && Number.isFinite(to) && to < from && minutes < to;
  });
  if (overnightPrevious) {
    return {
      state: "open",
      statusLabel: `Otevřeno do ${overnightPrevious.to}`,
      scheduleLabel,
    };
  }

  const activeSlot = todaySlots.find((slot) => {
    const from = parseTimeMinutes(slot.from);
    const to = parseTimeMinutes(slot.to);
    if (!Number.isFinite(from) || !Number.isFinite(to)) return false;
    return to < from
      ? minutes >= from || minutes < to
      : minutes >= from && minutes < to;
  });

  return activeSlot
    ? {
        state: "open",
        statusLabel: `Otevřeno do ${activeSlot.to}`,
        scheduleLabel,
      }
    : {
        state: "closed",
        statusLabel: "Teď zavřeno",
        scheduleLabel,
      };
}

function getPragueClock(date) {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Prague",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(date)
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, value]),
  );
  const weekdays = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return {
    day: weekdays[values.weekday],
    minutes: (Number(values.hour) % 24) * 60 + Number(values.minute),
  };
}

function parseTimeMinutes(value) {
  const [hour, minute] = String(value || "")
    .split(":")
    .map(Number);
  return Number.isFinite(hour) && Number.isFinite(minute)
    ? hour * 60 + minute
    : Number.NaN;
}

function getLocality(item) {
  const parts = String(item.address || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts[1] || parts[0] || "Česko";
}

function formatDistance(distanceKm) {
  if (distanceKm < 1) {
    return `${Math.max(50, Math.round((distanceKm * 1000) / 50) * 50)} m`;
  }
  return `${distanceKm < 10 ? distanceKm.toFixed(1) : Math.round(distanceKm)} km`;
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
    coordinates: item.coordinates || { latitude: null, longitude: null },
    website: safeUrl(item.website),
    restaurantFacebookUrl: safeUrl(item.restaurantFacebookUrl),
    facebookPostUrl: safeUrl(item.facebookPostUrl),
    nameLc: normalizeText(item.name),
    addressLc: normalizeText(address),
    cityLc: normalizeText(city),
    descriptionLc: normalizeText(item.description || ""),
    slugLc: normalizeText(item.slug || ""),
    tagsLc: (item.tags || []).map((tag) => normalizeText(tag.name)),
  };
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function getGalleryImages(item) {
  return item.images || [];
}

function getImageThumbSrc(image) {
  return safeUrl(image.thumb800) || safeUrl(image.original);
}

function getImageOriginalSrc(image) {
  return safeUrl(image.original) || safeUrl(image.thumb800);
}

function restoreSelectionFromHash() {
  let token;
  try {
    token = decodeURIComponent(window.location.hash.slice(1).trim());
  } catch {
    return;
  }

  if (!token) {
    selectedRestaurantId = null;
    return;
  }

  const match = dataset.find(
    (item) => item.slug === token || String(item.id) === token,
  );
  selectedRestaurantId = match?.id ?? null;
}

function updateHash(item) {
  const nextHash = item ? `#${encodeURIComponent(item.slug || item.id)}` : "";
  if (window.location.hash !== nextHash) {
    history.replaceState(
      null,
      "",
      nextHash || window.location.pathname + window.location.search,
    );
  }
}

function openDetail() {
  if (detailOverlayNode.hidden) returnFocus = document.activeElement;
  document.body.classList.remove("map-open");
  mapOverlayNode.hidden = true;
  document.body.classList.add("detail-open");
  detailOverlayNode.hidden = false;
  detailCloseBtn.focus();
}

function closeDetail(options = {}) {
  const wasOpen = !detailOverlayNode.hidden;
  document.body.classList.remove("detail-open");
  detailOverlayNode.hidden = true;
  const previousId = selectedRestaurantId;

  if (options.clearHash !== false) {
    selectedRestaurantId = null;
    updateHash(null);
    paintResults();
  }
  if (wasOpen) {
    const result = [...resultsNode.querySelectorAll(".result-hit")].find(
      (node) => node.dataset.restaurantId === String(previousId),
    );
    (returnFocus?.isConnected ? returnFocus : result || queryInput).focus();
  }
}

function openMap() {
  selectedRestaurantId = null;
  updateHash(null);
  document.body.classList.remove("detail-open");
  detailOverlayNode.hidden = true;
  document.body.classList.add("map-open");
  mapOverlayNode.hidden = false;
  syncMapControlsFromMain();
  initMapIfNeeded();
  if (!map)
    mapMetaNode.textContent =
      "Mapu se nepodařilo načíst. Použijte seznam nebo obnovte stránku.";
  refreshMapMarkers();
  requestMapResize();
  closeMapBtn.focus();
}

function closeMap() {
  document.body.classList.remove("map-open");
  mapOverlayNode.hidden = true;
  openMapBtn.focus();
}

function initMapIfNeeded() {
  if (map || !window.L?.maplibreGL || !window.maplibregl) {
    return;
  }

  map = window.L.map(mapCanvasNode, {
    zoomControl: true,
    minZoom: 2,
  }).setView(defaultMapCenter, defaultMapZoom);

  // OpenFreeMap's public vector tiles require no registration or API key.
  try {
    mapTileLayer = window.L.maplibreGL({
      style: "https://tiles.openfreemap.org/styles/liberty",
      attribution:
        '<a href="https://openfreemap.org/">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    mapTileLayer.getMaplibreMap().on("error", () => {
      mapMetaNode.textContent =
        "Mapový podklad se nepodařilo načíst. Obnovte stránku nebo použijte seznam.";
    });
  } catch {
    map.remove();
    map = null;
    mapTileLayer = null;
    return;
  }

  mapLayerGroup = window.L.layerGroup().addTo(map);
  map.on("zoomend", () => {
    paintMarkers(mapLayerGroup, mapMarkerSource, {
      clickable: true,
      cluster: true,
    });
  });
  window.addEventListener("resize", requestMapResize);
}

function requestMapResize() {
  window.requestAnimationFrame(() => {
    map?.invalidateSize();
    window.setTimeout(() => map?.invalidateSize(), 180);
  });
}

function requestUserLocation(forcePrompt = false) {
  if (userCoords && !forcePrompt) {
    locationMode = "nearby";
    locationInput.value = "";
    syncMapControlsFromMain();
    runSearch();
    applyUserCenteredMapView();
    return;
  }

  if (!navigator.geolocation) {
    setLocationStatus("Tento prohlížeč geolokaci nepodporuje.");
    return;
  }

  locateUserBtn.disabled = true;
  locateUserBtn.textContent = "Hledám polohu…";
  nearMeBtn.disabled = true;
  nearMeBtn.textContent = "Hledám…";

  navigator.geolocation.getCurrentPosition(
    (position) => {
      userCoords = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      locationMode = "nearby";
      locationInput.value = "";
      syncMapControlsFromMain();
      runSearch();
      paintUserLocation();
      if (!mapOverlayNode.hidden) applyUserCenteredMapView();
      locateUserBtn.disabled = false;
      locateUserBtn.textContent = "Moje poloha";
      nearMeBtn.disabled = false;
      nearMeBtn.textContent = "◎ Okolí";
      locationInput.blur();
    },
    () => {
      locateUserBtn.disabled = false;
      locateUserBtn.textContent = "Moje poloha";
      nearMeBtn.disabled = false;
      nearMeBtn.textContent = "◎ Okolí";
      setLocationStatus(
        "Polohu se nepodařilo zjistit. Zůstávám u pohledu na celé Česko.",
      );
    },
    {
      enableHighAccuracy: true,
      timeout: 7000,
      maximumAge: 300000,
    },
  );
}

function setLocationStatus(message) {
  mapMetaNode.textContent = message;
  if (mapOverlayNode.hidden) syncTimeNode.textContent = message;
}

function paintUserLocation() {
  if (!map || !userCoords || !window.L) {
    return;
  }

  if (userLocationMarker) {
    userLocationMarker.setLatLng([userCoords.latitude, userCoords.longitude]);
    return;
  }

  userLocationMarker = window.L.circleMarker(
    [userCoords.latitude, userCoords.longitude],
    {
      radius: 8,
      weight: 2,
      color: "#ffffff",
      fillColor: "#58d6ff",
      fillOpacity: 0.95,
    },
  )
    .bindTooltip("Vaše poloha", {
      direction: "top",
      offset: [0, -8],
    })
    .addTo(map);
}

function applyUserCenteredMapView() {
  if (!map || !userCoords) {
    return;
  }

  const sourceEntries =
    locationMode === "nearby" && userCoords
      ? filtered.filter(({ distanceKm }) => Number.isFinite(distanceKm)).slice(0, 40)
      : filtered;
  const source = sourceEntries.map(({ item }) => item);
  const nearby = source
    .map((item) => ({
      item,
      distanceKm: haversineKm(
        userCoords.latitude,
        userCoords.longitude,
        item.coordinates.latitude,
        item.coordinates.longitude,
      ),
    }))
    .filter((entry) => Number.isFinite(entry.distanceKm))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 40);

  const closeEnough = nearby.filter((entry) => entry.distanceKm <= 20);
  const selection = closeEnough.length ? closeEnough : nearby.slice(0, 20);
  const bounds = selection.map((entry) => [
    entry.item.coordinates.latitude,
    entry.item.coordinates.longitude,
  ]);
  bounds.push([userCoords.latitude, userCoords.longitude]);

  paintUserLocation();

  if (bounds.length > 1) {
    map.fitBounds(bounds, {
      padding: [40, 40],
      maxZoom: 15,
    });
  } else {
    map.setView([userCoords.latitude, userCoords.longitude], 15);
  }

  const nearestCount = selection.length;
  mapMetaNode.textContent = nearestCount
    ? `Zobrazuji ${nearestCount} nejbližších podniků v okolí vaší polohy`
    : "Polohu jsem našel, ale v blízkém okolí zatím nic není.";
}

function refreshMapMarkers(preserveView = false) {
  if (!map || !mapLayerGroup) {
    return;
  }

  const sourceEntries =
    locationMode === "nearby" && userCoords
      ? filtered
          .filter(({ distanceKm }) => Number.isFinite(distanceKm))
          .slice(0, 40)
      : filtered;
  const source = sourceEntries.map(({ item }) => item);
  mapMarkerSource = source;
  const bounds = paintMarkers(mapLayerGroup, source, {
    clickable: true,
    cluster: true,
  });
  paintUserLocation();

  if (locationMode === "nearby" && userCoords) {
    applyUserCenteredMapView();
    return;
  }

  mapMetaNode.textContent =
    filtered.length && filtered.length !== dataset.length
      ? `Zobrazuji ${filtered.length} podniků podle aktuálního filtru`
      : `Zobrazuji ${source.length} podniků napříč Českem`;

  if (!preserveView || mapOverlayNode.hidden) fitMapToBounds(map, bounds);
}

function paintMarkers(layerGroup, source, options = {}) {
  layerGroup.clearLayers();
  const entries = source
    .map((item) => ({
      item,
      point: [item.coordinates.latitude, item.coordinates.longitude],
    }))
    .filter(({ point }) => point.every(Number.isFinite));
  const bounds = entries.map(({ point }) => point);
  const groups =
    options.cluster === false ? entries.map((entry) => [entry]) : clusterEntries(entries);

  for (const group of groups) {
    if (group.length === 1) {
      addRestaurantMarker(layerGroup, group[0].item, options);
    } else {
      addClusterMarker(layerGroup, group);
    }
  }

  return bounds;
}

function clusterEntries(entries) {
  if (!map || map.getZoom() >= 15) return entries.map((entry) => [entry]);

  const cellSize = map.getZoom() <= 8 ? 72 : 56;
  const groups = new Map();
  for (const entry of entries) {
    const point = map.project(entry.point, map.getZoom());
    const key = `${Math.floor(point.x / cellSize)}:${Math.floor(point.y / cellSize)}`;
    const group = groups.get(key) || [];
    group.push(entry);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function addRestaurantMarker(layerGroup, item, options) {
  const { latitude, longitude } = item.coordinates;
  const label = `${item.name}, ${getLocality(item)}`;
  const marker = window.L.marker([latitude, longitude], {
    title: label,
    keyboard: true,
    icon: window.L.divIcon({
      className: "emoji-map-marker",
      html: `<span aria-hidden="true">${pickEmoji(item)}</span>`,
      iconSize: options.iconSize || [24, 24],
      iconAnchor: options.iconAnchor || [12, 12],
    }),
  }).addTo(layerGroup);

  const markerElement = marker.getElement();
  markerElement?.setAttribute("aria-label", label);

  if (options.clickable !== false) {
    marker.bindTooltip(
      `<strong>${escapeHtml(pickEmoji(item))} ${escapeHtml(item.name)}</strong><br>${escapeHtml(getLocality(item))}`,
      { direction: "top", offset: [0, -8] },
    );
    marker.on("click", () => {
      closeMap();
      selectRestaurant(item.id);
    });
  }
}

function addClusterMarker(layerGroup, group) {
  const latitude =
    group.reduce((sum, entry) => sum + entry.point[0], 0) / group.length;
  const longitude =
    group.reduce((sum, entry) => sum + entry.point[1], 0) / group.length;
  const label = `${group.length} podniků v této oblasti`;
  const marker = window.L.marker([latitude, longitude], {
    title: label,
    keyboard: true,
    icon: window.L.divIcon({
      className: "cluster-map-marker",
      html: `<span aria-hidden="true">${group.length}</span>`,
      iconSize: [40, 40],
      iconAnchor: [20, 20],
    }),
  }).addTo(layerGroup);

  const markerElement = marker.getElement();
  markerElement?.setAttribute("aria-label", label);
  marker.bindTooltip(label, { direction: "top", offset: [0, -16] });
  marker.on("click", () => {
    const clusterBounds = group.map(({ point }) => point);
    if (clusterBounds.length > 1) {
      map.fitBounds(clusterBounds, {
        padding: [48, 48],
        maxZoom: Math.min(map.getZoom() + 3, 16),
      });
    } else {
      map.setView(clusterBounds[0], Math.min(map.getZoom() + 2, 16));
    }
  });
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
    // A few upstream coordinates are thousands of km from the matching city.
    // Frame the dominant cluster without deleting any markers or changing data.
    let viewportBounds = bounds;
    if (bounds.length >= 5) {
      const median = (values) =>
        values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
      const center = [
        median(bounds.map((point) => point[0])),
        median(bounds.map((point) => point[1])),
      ];
      const cluster = bounds.filter(
        (point) => haversineKm(...center, ...point) <= 500,
      );
      if (cluster.length >= bounds.length * 0.8) viewportBounds = cluster;
    }
    instance.fitBounds(viewportBounds, {
      padding: [40, 40],
      maxZoom,
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
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
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
