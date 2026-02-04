const state = {
  all: [],
  filtered: [],
  markers: new Map(),
  map: null,
  layer: null
};

const els = {
  q: document.getElementById("q"),
  category: document.getElementById("category"),
  district: document.getElementById("district"),
  price: document.getElementById("price"),
  minRating: document.getElementById("minRating"),
  reset: document.getElementById("reset"),
  list: document.getElementById("list"),
  count: document.getElementById("count"),
  modal: document.getElementById("modal"),
  modalBody: document.getElementById("modalBody"),
  closeModal: document.getElementById("closeModal"),
  backdrop: document.getElementById("modalBackdrop"),
};

function catLabel(c) {
  return c === "eat" ? "Поесть" : c === "drink" ? "Попить" : "Посмотреть";
}

function markerIconColor(category) {
  // простая различимость без внешних иконок: разные circleMarker цвета (по умолчанию Leaflet marker один).
  // Но Leaflet по умолчанию не поддерживает цвет marker без доп. плагина.
  // Поэтому используем circleMarker.
  return category === "eat" ? "#7ee787" : category === "drink" ? "#79c0ff" : "#f2cc60";
}

function normalize(s) {
  return (s || "").toString().trim().toLowerCase();
}

function applyFilters() {
  const q = normalize(els.q.value);
  const category = els.category.value;
  const district = els.district.value;
  const price = els.price.value;
  const minRating = parseFloat(els.minRating.value || "0");

  state.filtered = state.all.filter(p => {
    if (category && p.category !== category) return false;
    if (district && p.district !== district) return false;
    if (price && p.price !== price) return false;
    if ((p.rating ?? 0) < minRating) return false;

    if (q) {
      const hay = normalize([
        p.name, p.short, p.notes, p.district, p.price, catLabel(p.category)
      ].join(" "));
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  renderList();
  renderMarkers();
}

function renderList() {
  els.list.innerHTML = "";
  els.count.textContent = `${state.filtered.length} мест`;

  for (const p of state.filtered) {
    const card = document.createElement("article");
    card.className = "card";
    card.tabIndex = 0;
    card.addEventListener("click", () => openPlace(p));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") openPlace(p);
    });

    card.innerHTML = `
      <div class="cardTop">
        <div class="badges">
          <span class="badge">${catLabel(p.category)}</span>
          <span class="badge">Район ${p.district || "—"}</span>
          <span class="badge">${p.price || "—"}</span>
        </div>
        <span class="badge">★ ${typeof p.rating === "number" ? p.rating.toFixed(1) : "—"}</span>
      </div>
      <div class="title">${escapeHtml(p.name)}</div>
      <p class="desc">${escapeHtml(p.short || "")}</p>
      <div class="small">
        <span>id: ${escapeHtml(p.id)}</span>
      </div>
    `;

    els.list.appendChild(card);
  }
}

function renderMarkers() {
  // Clear existing layer
  if (state.layer) state.layer.clearLayers();

  for (const p of state.filtered) {
    if (typeof p.lat !== "number" || typeof p.lng !== "number") continue;

    const m = L.circleMarker([p.lat, p.lng], {
      radius: 7,
      weight: 2,
      opacity: 1,
      fillOpacity: 0.85,
      color: markerIconColor(p.category),
      fillColor: markerIconColor(p.category),
    });

    m.on("click", () => openPlace(p));
    m.bindTooltip(p.name, { direction: "top", opacity: 0.9 });

    state.layer.addLayer(m);
    state.markers.set(p.id, m);
  }
}

function openPlace(p) {
  // center map
  if (state.map && typeof p.lat === "number") {
    state.map.setView([p.lat, p.lng], Math.max(state.map.getZoom(), 14), { animate: true });
    const marker = state.markers.get(p.id);
    if (marker) marker.openTooltip();
  }

  const links = p.links || {};
  const mapsLink = links.maps ? `<a href="${escapeAttr(links.maps)}" target="_blank" rel="noopener">Открыть в Google Maps</a>` : "";

  els.modalBody.innerHTML = `
    <div class="modalContent">
      <h3 class="modalTitle">${escapeHtml(p.name)}</h3>
      <p class="modalMeta">
        ${catLabel(p.category)} · Район ${escapeHtml(p.district || "—")} · ${escapeHtml(p.price || "—")} · ★ ${typeof p.rating === "number" ? p.rating.toFixed(1) : "—"}
      </p>
      ${p.notes ? `<p class="modalText">${escapeHtml(p.notes)}</p>` : ""}
      <div class="modalLinks">${mapsLink}</div>
    </div>
  `;

  els.backdrop.classList.remove("hidden");
  els.modal.showModal();
}

function closeModal() {
  els.modal.close();
  els.backdrop.classList.add("hidden");
}

function escapeHtml(str) {
  return (str ?? "").toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function escapeAttr(str) {
  return escapeHtml(str).replaceAll('"', "&quot;");
}

async function init() {
  // Map init
  state.map = L.map("map", { scrollWheelZoom: true, attributionControl: false })
  .setView([47.4979, 19.0402], 12); // Budapest center

const tiles = L.tileLayer(
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  { maxZoom: 19 }
).addTo(state.map);

L.control.attribution({ prefix: false })
  .addTo(state.map)
  .addAttribution("Map data © OpenStreetMap contributors • Tiles © CARTO");

  state.layer = L.layerGroup().addTo(state.map);

  // Load data
  const res = await fetch("places.json", { cache: "no-store" });
  state.all = await res.json();

  // districts options
  const districts = [...new Set(state.all.map(p => p.district).filter(Boolean))].sort((a,b)=>a.localeCompare(b, "en", { numeric: true }));
  for (const d of districts) {
    const opt = document.createElement("option");
    opt.value = d;
    opt.textContent = d;
    els.district.appendChild(opt);
  }

  // wire events
  ["input", "change"].forEach(evt => {
    els.q.addEventListener("input", applyFilters);
    els.category.addEventListener("change", applyFilters);
    els.district.addEventListener("change", applyFilters);
    els.price.addEventListener("change", applyFilters);
    els.minRating.addEventListener("change", applyFilters);
  });

  els.reset.addEventListener("click", () => {
    els.q.value = "";
    els.category.value = "";
    els.district.value = "";
    els.price.value = "";
    els.minRating.value = "4";
    applyFilters();
  });

  els.closeModal.addEventListener("click", closeModal);
  els.backdrop.addEventListener("click", closeModal);
  els.modal.addEventListener("cancel", (e) => { e.preventDefault(); closeModal(); });

  applyFilters();
}

init().catch(err => {
  console.error(err);
  alert("Не удалось загрузить данные. Проверь places.json и консоль.");
});
