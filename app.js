const STORAGE_KEY = "historical-map-places-v1";
const typeLabels = {
  temple: "Đền thờ",
  statue: "Tượng đài",
  relic: "Di tích",
  museum: "Bảo tàng",
  battlefield: "Chiến trường",
  street: "Đường phố",
  school: "Trường học",
  other: "Khác",
};

let topics = [];
let places = [];
let activeTopicId = "all";
let selectedPlaceId = null;
let map;
let markersLayer;

const els = {
  topicList: document.querySelector("#topicList"),
  placeList: document.querySelector("#placeList"),
  detailPanel: document.querySelector("#detailPanel"),
  searchInput: document.querySelector("#searchInput"),
  typeFilter: document.querySelector("#typeFilter"),
  resetBtn: document.querySelector("#resetBtn"),
  addPlaceBtn: document.querySelector("#addPlaceBtn"),
  dialog: document.querySelector("#placeDialog"),
  form: document.querySelector("#placeForm"),
  formTitle: document.querySelector("#formTitle"),
  closeDialogBtn: document.querySelector("#closeDialogBtn"),
  cancelBtn: document.querySelector("#cancelBtn"),
  placeTopics: document.querySelector("#placeTopics"),
};

init();

async function init() {
  initMap();
  const data = await fetch("data.json").then((res) => res.json());
  topics = data.topics;
  const savedPlaces = localStorage.getItem(STORAGE_KEY);
  places = savedPlaces ? JSON.parse(savedPlaces) : data.places;
  renderTopicOptions();
  bindEvents();
  renderAll();
}

function initMap() {
  map = L.map("map").setView([16.3, 106.8], 6);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap contributors",
  }).addTo(map);
  markersLayer = L.layerGroup().addTo(map);
}

function bindEvents() {
  els.searchInput.addEventListener("input", renderAll);
  els.typeFilter.addEventListener("change", renderAll);
  els.resetBtn.addEventListener("click", () => {
    activeTopicId = "all";
    els.searchInput.value = "";
    els.typeFilter.value = "all";
    selectedPlaceId = null;
    els.detailPanel.classList.add("hidden");
    renderAll();
  });
  els.addPlaceBtn.addEventListener("click", () => openForm());
  els.closeDialogBtn.addEventListener("click", () => els.dialog.close());
  els.cancelBtn.addEventListener("click", () => els.dialog.close());
  els.form.addEventListener("submit", savePlaceFromForm);
}

function renderAll() {
  renderTopics();
  const filtered = getFilteredPlaces();
  renderPlaces(filtered);
  renderMarkers(filtered);
}

function renderTopics() {
  els.topicList.innerHTML = "";
  const allBtn = makeTopicButton({ id: "all", name: "Tất cả" });
  els.topicList.appendChild(allBtn);
  topics.forEach((topic) => els.topicList.appendChild(makeTopicButton(topic)));
}

function makeTopicButton(topic) {
  const btn = document.createElement("button");
  btn.className = `topic-card ${activeTopicId === topic.id ? "active" : ""}`;
  btn.textContent = topic.name;
  btn.addEventListener("click", () => {
    activeTopicId = topic.id;
    selectedPlaceId = null;
    els.detailPanel.classList.add("hidden");
    renderAll();
  });
  return btn;
}

function getFilteredPlaces() {
  const query = normalize(els.searchInput.value);
  const type = els.typeFilter.value;
  return places.filter((place) => {
    const topicNames = place.topicIds.map(getTopicName).join(" ");
    const matchTopic = activeTopicId === "all" || place.topicIds.includes(activeTopicId);
    const matchType = type === "all" || place.placeType === type;
    const matchQuery = !query || normalize(`${place.name} ${place.address} ${place.description || ""} ${topicNames}`).includes(query);
    return matchTopic && matchType && matchQuery;
  });
}

function renderPlaces(list) {
  els.placeList.innerHTML = "";
  if (!list.length) {
    els.placeList.innerHTML = `<div class="empty">Không tìm thấy địa điểm phù hợp.</div>`;
    return;
  }
  list.forEach((place) => {
    const card = document.createElement("article");
    card.className = "place-card";
    card.innerHTML = `
      <h3>${escapeHtml(place.name)}</h3>
      <p>${escapeHtml(place.address)}</p>
      <span class="tag">${escapeHtml(typeLabels[place.placeType] || "Khác")}</span>
    `;
    card.addEventListener("click", () => selectPlace(place.id, true));
    els.placeList.appendChild(card);
  });
}

function renderMarkers(list) {
  markersLayer.clearLayers();
  const bounds = [];
  list.forEach((place) => {
    const marker = L.marker([place.latitude, place.longitude])
      .bindPopup(`<b>${escapeHtml(place.name)}</b><br>${escapeHtml(place.address)}`)
      .on("click", () => selectPlace(place.id, false));
    marker.addTo(markersLayer);
    bounds.push([place.latitude, place.longitude]);
  });
  if (bounds.length) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
}

function selectPlace(id, zoom) {
  selectedPlaceId = id;
  const place = places.find((item) => item.id === id);
  if (!place) return;
  if (zoom) map.setView([place.latitude, place.longitude], 15);
  renderDetail(place);
}

function renderDetail(place) {
  const googleUrl = place.googleMapsUrl || `https://www.google.com/maps/search/?api=1&query=${place.latitude},${place.longitude}`;
  els.detailPanel.innerHTML = `
    <h2>${escapeHtml(place.name)}</h2>
    <p><b>Địa chỉ:</b> ${escapeHtml(place.address)}</p>
    <p><b>Chủ đề:</b> ${place.topicIds.map(getTopicName).map(escapeHtml).join(", ")}</p>
    <p><b>Loại:</b> ${escapeHtml(typeLabels[place.placeType] || "Khác")}</p>
    <p><b>Mô tả:</b> ${escapeHtml(place.description || "Chưa có mô tả")}</p>
    <p><b>Tọa độ:</b> ${place.latitude}, ${place.longitude}</p>
    ${place.note ? `<p><b>Ghi chú:</b> ${escapeHtml(place.note)}</p>` : ""}
    <div class="detail-actions">
      <button class="primary-btn" onclick="window.open('${googleUrl}', '_blank')">Mở Google Maps</button>
      <button class="ghost-btn" onclick="openForm('${place.id}')">Sửa</button>
      <button class="danger-btn" onclick="deletePlace('${place.id}')">Xoá</button>
      <button class="ghost-btn" onclick="closeDetail()">Đóng</button>
    </div>
  `;
  els.detailPanel.classList.remove("hidden");
}

function renderTopicOptions() {
  els.placeTopics.innerHTML = topics.map((topic) => `<option value="${topic.id}">${escapeHtml(topic.name)}</option>`).join("");
}

function openForm(placeId = null) {
  const place = placeId ? places.find((item) => item.id === placeId) : null;
  els.form.reset();
  document.querySelector("#placeId").value = place?.id || "";
  els.formTitle.textContent = place ? "Sửa địa điểm" : "Thêm địa điểm";
  document.querySelector("#placeName").value = place?.name || "";
  document.querySelector("#placeAddress").value = place?.address || "";
  document.querySelector("#placeLat").value = place?.latitude || "";
  document.querySelector("#placeLng").value = place?.longitude || "";
  document.querySelector("#placeType").value = place?.placeType || "temple";
  document.querySelector("#placeGoogleUrl").value = place?.googleMapsUrl || "";
  document.querySelector("#placeDescription").value = place?.description || "";
  document.querySelector("#placeNote").value = place?.note || "";
  [...els.placeTopics.options].forEach((option) => {
    option.selected = place ? place.topicIds.includes(option.value) : false;
  });
  els.dialog.showModal();
}
window.openForm = openForm;

function savePlaceFromForm(event) {
  event.preventDefault();
  const id = document.querySelector("#placeId").value || createId(document.querySelector("#placeName").value);
  const topicIds = [...els.placeTopics.selectedOptions].map((option) => option.value);
  const payload = {
    id,
    topicIds,
    name: document.querySelector("#placeName").value.trim(),
    address: document.querySelector("#placeAddress").value.trim(),
    latitude: Number(document.querySelector("#placeLat").value),
    longitude: Number(document.querySelector("#placeLng").value),
    placeType: document.querySelector("#placeType").value,
    googleMapsUrl: document.querySelector("#placeGoogleUrl").value.trim(),
    description: document.querySelector("#placeDescription").value.trim(),
    note: document.querySelector("#placeNote").value.trim(),
  };
  if (!payload.topicIds.length) {
    alert("Vui lòng chọn ít nhất một chủ đề.");
    return;
  }
  const index = places.findIndex((item) => item.id === id);
  if (index >= 0) places[index] = payload;
  else places.push(payload);
  persist();
  els.dialog.close();
  selectedPlaceId = id;
  renderAll();
  selectPlace(id, true);
}

function deletePlace(id) {
  const place = places.find((item) => item.id === id);
  if (!place) return;
  const ok = confirm(`Bạn có chắc muốn xoá địa điểm "${place.name}"?`);
  if (!ok) return;
  places = places.filter((item) => item.id !== id);
  persist();
  closeDetail();
  renderAll();
}
window.deletePlace = deletePlace;

function closeDetail() {
  selectedPlaceId = null;
  els.detailPanel.classList.add("hidden");
}
window.closeDetail = closeDetail;

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(places));
}

function getTopicName(id) {
  return topics.find((topic) => topic.id === id)?.name || id;
}

function normalize(value) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function createId(value) {
  const base = normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "place";
  return `${base}-${Date.now().toString(36)}`;
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#039;",
    '"': "&quot;",
  }[char]));
}
