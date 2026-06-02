const STORAGE_KEY = "historical-map-state-v2";

let topics = [];
let placeTypes = [];
let places = [];
let activeTopicId = "all";
let selectedPlaceId = null;
let managerMode = "topics";
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
  manageTopicsBtn: document.querySelector("#manageTopicsBtn"),
  manageTypesBtn: document.querySelector("#manageTypesBtn"),
  quickAddTopicBtn: document.querySelector("#quickAddTopicBtn"),

  placeDialog: document.querySelector("#placeDialog"),
  placeForm: document.querySelector("#placeForm"),
  placeFormTitle: document.querySelector("#placeFormTitle"),
  placeTopics: document.querySelector("#placeTopics"),
  placeType: document.querySelector("#placeType"),

  topicDialog: document.querySelector("#topicDialog"),
  topicForm: document.querySelector("#topicForm"),
  topicFormTitle: document.querySelector("#topicFormTitle"),

  typeDialog: document.querySelector("#typeDialog"),
  typeForm: document.querySelector("#typeForm"),
  typeFormTitle: document.querySelector("#typeFormTitle"),

  managerDialog: document.querySelector("#managerDialog"),
  managerTitle: document.querySelector("#managerTitle"),
  managerContent: document.querySelector("#managerContent"),
};

init();

async function init() {
  initMap();
  const data = await fetch("data.json").then((res) => res.json());
  const savedState = localStorage.getItem(STORAGE_KEY);

  if (savedState) {
    const state = JSON.parse(savedState);
    topics = state.topics || data.topics || [];
    placeTypes = state.placeTypes || data.placeTypes || getDefaultPlaceTypes();
    places = state.places || data.places || [];
  } else {
    topics = data.topics || [];
    placeTypes = data.placeTypes || getDefaultPlaceTypes();
    places = data.places || [];
  }

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
  els.resetBtn.addEventListener("click", resetFilters);
  els.addPlaceBtn.addEventListener("click", () => openPlaceForm());
  els.quickAddTopicBtn.addEventListener("click", () => openTopicForm());
  els.manageTopicsBtn.addEventListener("click", () => openManager("topics"));
  els.manageTypesBtn.addEventListener("click", () => openManager("types"));
  els.placeForm.addEventListener("submit", savePlaceFromForm);
  els.topicForm.addEventListener("submit", saveTopicFromForm);
  els.typeForm.addEventListener("submit", saveTypeFromForm);
  document.querySelectorAll("[data-close]").forEach((btn) => {
    btn.addEventListener("click", () => document.querySelector(`#${btn.dataset.close}`).close());
  });
}

function resetFilters() {
  activeTopicId = "all";
  els.searchInput.value = "";
  els.typeFilter.value = "all";
  selectedPlaceId = null;
  els.detailPanel.classList.add("hidden");
  renderAll();
}

function renderAll() {
  renderTypeOptions();
  renderTopicOptions();
  renderTopics();
  const filtered = getFilteredPlaces();
  renderPlaces(filtered);
  renderMarkers(filtered);
  if (managerMode === "topics" && els.managerDialog.open) renderTopicManager();
  if (managerMode === "types" && els.managerDialog.open) renderTypeManager();
}

function renderTopics() {
  els.topicList.innerHTML = "";
  els.topicList.appendChild(makeTopicButton({ id: "all", name: "Tất cả" }));
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
    const typeName = getTypeLabel(place.placeType);
    const matchTopic = activeTopicId === "all" || place.topicIds.includes(activeTopicId);
    const matchType = type === "all" || place.placeType === type;
    const searchable = `${place.name} ${place.address} ${place.description || ""} ${topicNames} ${typeName}`;
    const matchQuery = !query || normalize(searchable).includes(query);
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
      <span class="tag">${escapeHtml(getTypeLabel(place.placeType))}</span>
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
    <p><b>Chủ đề:</b> ${place.topicIds.map(getTopicName).map(escapeHtml).join(", ") || "Chưa có"}</p>
    <p><b>Loại:</b> ${escapeHtml(getTypeLabel(place.placeType))}</p>
    <p><b>Mô tả:</b> ${escapeHtml(place.description || "Chưa có mô tả")}</p>
    <p><b>Tọa độ:</b> ${place.latitude}, ${place.longitude}</p>
    ${place.note ? `<p><b>Ghi chú:</b> ${escapeHtml(place.note)}</p>` : ""}
    <div class="detail-actions">
      <button class="primary-btn" onclick="window.open('${escapeAttr(googleUrl)}', '_blank')">Mở Google Maps</button>
      <button class="ghost-btn" onclick="openPlaceForm('${place.id}')">Sửa</button>
      <button class="danger-btn" onclick="deletePlace('${place.id}')">Xoá</button>
      <button class="ghost-btn" onclick="closeDetail()">Đóng</button>
    </div>
  `;
  els.detailPanel.classList.remove("hidden");
}

function renderTopicOptions() {
  els.placeTopics.innerHTML = topics.map((topic) => `<option value="${topic.id}">${escapeHtml(topic.name)}</option>`).join("");
}

function renderTypeOptions() {
  const oldFilter = els.typeFilter.value || "all";
  els.typeFilter.innerHTML = `<option value="all">Tất cả loại địa điểm</option>` + placeTypes.map((type) => `<option value="${type.id}">${escapeHtml(type.name)}</option>`).join("");
  els.typeFilter.value = placeTypes.some((type) => type.id === oldFilter) ? oldFilter : "all";
  els.placeType.innerHTML = placeTypes.map((type) => `<option value="${type.id}">${escapeHtml(type.name)}</option>`).join("");
}

function openPlaceForm(placeId = null) {
  if (!topics.length) {
    alert("Vui lòng thêm ít nhất một chủ đề trước khi thêm địa điểm.");
    openTopicForm();
    return;
  }
  if (!placeTypes.length) {
    alert("Vui lòng thêm ít nhất một loại địa điểm trước khi thêm địa điểm.");
    openTypeForm();
    return;
  }
  const place = placeId ? places.find((item) => item.id === placeId) : null;
  els.placeForm.reset();
  document.querySelector("#placeId").value = place?.id || "";
  els.placeFormTitle.textContent = place ? "Sửa địa điểm" : "Thêm địa điểm";
  document.querySelector("#placeName").value = place?.name || "";
  document.querySelector("#placeAddress").value = place?.address || "";
  document.querySelector("#placeLat").value = place?.latitude || "";
  document.querySelector("#placeLng").value = place?.longitude || "";
  document.querySelector("#placeGoogleUrl").value = place?.googleMapsUrl || "";
  document.querySelector("#placeDescription").value = place?.description || "";
  document.querySelector("#placeNote").value = place?.note || "";
  els.placeType.value = place?.placeType || placeTypes[0].id;
  [...els.placeTopics.options].forEach((option) => {
    option.selected = place ? place.topicIds.includes(option.value) : false;
  });
  els.placeDialog.showModal();
}
window.openPlaceForm = openPlaceForm;

function savePlaceFromForm(event) {
  event.preventDefault();
  const oldId = document.querySelector("#placeId").value;
  const id = oldId || createId(document.querySelector("#placeName").value, "place");
  const topicIds = [...els.placeTopics.selectedOptions].map((option) => option.value);
  const payload = {
    id,
    topicIds,
    name: document.querySelector("#placeName").value.trim(),
    address: document.querySelector("#placeAddress").value.trim(),
    latitude: Number(document.querySelector("#placeLat").value),
    longitude: Number(document.querySelector("#placeLng").value),
    placeType: els.placeType.value,
    googleMapsUrl: document.querySelector("#placeGoogleUrl").value.trim(),
    description: document.querySelector("#placeDescription").value.trim(),
    note: document.querySelector("#placeNote").value.trim(),
    updatedAt: new Date().toISOString(),
  };
  if (!payload.topicIds.length) return alert("Vui lòng chọn ít nhất một chủ đề.");
  const index = places.findIndex((item) => item.id === id);
  if (index >= 0) places[index] = payload;
  else places.push({ ...payload, createdAt: new Date().toISOString() });
  persist();
  els.placeDialog.close();
  selectedPlaceId = id;
  renderAll();
  selectPlace(id, true);
}

function deletePlace(id) {
  const place = places.find((item) => item.id === id);
  if (!place) return;
  if (!confirm(`Bạn có chắc muốn xoá địa điểm "${place.name}"?`)) return;
  places = places.filter((item) => item.id !== id);
  persist();
  closeDetail();
  renderAll();
}
window.deletePlace = deletePlace;

function openTopicForm(topicId = null) {
  const topic = topicId ? topics.find((item) => item.id === topicId) : null;
  els.topicForm.reset();
  els.topicFormTitle.textContent = topic ? "Sửa chủ đề" : "Thêm chủ đề";
  document.querySelector("#topicId").value = topic?.id || "";
  document.querySelector("#topicName").value = topic?.name || "";
  document.querySelector("#topicCategory").value = topic?.category || "person";
  document.querySelector("#topicDescription").value = topic?.description || "";
  els.topicDialog.showModal();
}
window.openTopicForm = openTopicForm;

function saveTopicFromForm(event) {
  event.preventDefault();
  const oldId = document.querySelector("#topicId").value;
  const name = document.querySelector("#topicName").value.trim();
  const newId = oldId || createId(name, "topic");
  const payload = {
    id: newId,
    name,
    category: document.querySelector("#topicCategory").value,
    description: document.querySelector("#topicDescription").value.trim(),
  };
  const index = topics.findIndex((item) => item.id === oldId);
  if (index >= 0) topics[index] = payload;
  else topics.push(payload);
  persist();
  els.topicDialog.close();
  renderAll();
  if (els.managerDialog.open) renderTopicManager();
}

function deleteTopic(id) {
  const topic = topics.find((item) => item.id === id);
  if (!topic) return;
  const usedCount = places.filter((place) => place.topicIds.includes(id)).length;
  const message = usedCount
    ? `Chủ đề "${topic.name}" đang gắn với ${usedCount} địa điểm. Xoá chủ đề này sẽ gỡ nó khỏi các địa điểm đó. Tiếp tục?`
    : `Bạn có chắc muốn xoá chủ đề "${topic.name}"?`;
  if (!confirm(message)) return;
  topics = topics.filter((item) => item.id !== id);
  places = places.map((place) => ({ ...place, topicIds: place.topicIds.filter((topicId) => topicId !== id) }));
  if (activeTopicId === id) activeTopicId = "all";
  persist();
  renderAll();
  renderTopicManager();
}
window.deleteTopic = deleteTopic;

function openTypeForm(typeId = null) {
  const type = typeId ? placeTypes.find((item) => item.id === typeId) : null;
  els.typeForm.reset();
  els.typeFormTitle.textContent = type ? "Sửa loại địa điểm" : "Thêm loại địa điểm";
  document.querySelector("#typeId").value = type?.id || "";
  document.querySelector("#typeName").value = type?.name || "";
  document.querySelector("#typeValue").value = type?.id || "";
  els.typeDialog.showModal();
}
window.openTypeForm = openTypeForm;

function saveTypeFromForm(event) {
  event.preventDefault();
  const oldId = document.querySelector("#typeId").value;
  const name = document.querySelector("#typeName").value.trim();
  const newId = slugify(document.querySelector("#typeValue").value.trim() || name);
  if (!newId) return alert("Mã loại không hợp lệ.");
  const duplicate = placeTypes.some((type) => type.id === newId && type.id !== oldId);
  if (duplicate) return alert("Mã loại này đã tồn tại.");
  const payload = { id: newId, name };
  const index = placeTypes.findIndex((item) => item.id === oldId);
  if (index >= 0) {
    placeTypes[index] = payload;
    if (oldId !== newId) {
      places = places.map((place) => place.placeType === oldId ? { ...place, placeType: newId } : place);
    }
  } else {
    placeTypes.push(payload);
  }
  persist();
  els.typeDialog.close();
  renderAll();
  if (els.managerDialog.open) renderTypeManager();
}

function deleteType(id) {
  const type = placeTypes.find((item) => item.id === id);
  if (!type) return;
  const usedCount = places.filter((place) => place.placeType === id).length;
  if (usedCount) {
    alert(`Không thể xoá loại "${type.name}" vì đang có ${usedCount} địa điểm sử dụng. Hãy sửa các địa điểm đó sang loại khác trước.`);
    return;
  }
  if (!confirm(`Bạn có chắc muốn xoá loại địa điểm "${type.name}"?`)) return;
  placeTypes = placeTypes.filter((item) => item.id !== id);
  persist();
  renderAll();
  renderTypeManager();
}
window.deleteType = deleteType;

function openManager(mode) {
  managerMode = mode;
  if (mode === "topics") renderTopicManager();
  else renderTypeManager();
  els.managerDialog.showModal();
}

function renderTopicManager() {
  els.managerTitle.textContent = "Quản lý chủ đề";
  els.managerContent.innerHTML = `
    <button class="primary-btn full-btn" onclick="openTopicForm()">+ Thêm chủ đề</button>
    ${topics.length ? topics.map((topic) => `
      <article class="manager-item">
        <div>
          <h3>${escapeHtml(topic.name)}</h3>
          <p>${escapeHtml(topic.category || "other")} · ${countPlacesByTopic(topic.id)} địa điểm</p>
          ${topic.description ? `<p>${escapeHtml(topic.description)}</p>` : ""}
        </div>
        <div class="row-actions">
          <button class="ghost-btn" onclick="openTopicForm('${topic.id}')">Sửa</button>
          <button class="danger-btn" onclick="deleteTopic('${topic.id}')">Xoá</button>
        </div>
      </article>
    `).join("") : `<div class="empty">Chưa có chủ đề.</div>`}
  `;
}

function renderTypeManager() {
  els.managerTitle.textContent = "Quản lý loại địa điểm";
  els.managerContent.innerHTML = `
    <button class="primary-btn full-btn" onclick="openTypeForm()">+ Thêm loại địa điểm</button>
    ${placeTypes.length ? placeTypes.map((type) => `
      <article class="manager-item">
        <div>
          <h3>${escapeHtml(type.name)}</h3>
          <p>Mã: ${escapeHtml(type.id)} · ${countPlacesByType(type.id)} địa điểm</p>
        </div>
        <div class="row-actions">
          <button class="ghost-btn" onclick="openTypeForm('${type.id}')">Sửa</button>
          <button class="danger-btn" onclick="deleteType('${type.id}')">Xoá</button>
        </div>
      </article>
    `).join("") : `<div class="empty">Chưa có loại địa điểm.</div>`}
  `;
}

function closeDetail() {
  selectedPlaceId = null;
  els.detailPanel.classList.add("hidden");
}
window.closeDetail = closeDetail;

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ topics, placeTypes, places }));
}

function getTopicName(id) {
  return topics.find((topic) => topic.id === id)?.name || id;
}

function getTypeLabel(id) {
  return placeTypes.find((type) => type.id === id)?.name || id || "Khác";
}

function countPlacesByTopic(id) {
  return places.filter((place) => place.topicIds.includes(id)).length;
}

function countPlacesByType(id) {
  return places.filter((place) => place.placeType === id).length;
}

function getDefaultPlaceTypes() {
  return [
    { id: "temple", name: "Đền thờ" },
    { id: "statue", name: "Tượng đài" },
    { id: "relic", name: "Di tích" },
    { id: "museum", name: "Bảo tàng" },
    { id: "battlefield", name: "Chiến trường" },
    { id: "street", name: "Đường phố" },
    { id: "school", name: "Trường học" },
    { id: "other", name: "Khác" },
  ];
}

function normalize(value) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function slugify(value) {
  return normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function createId(value, fallback) {
  const base = slugify(value) || fallback;
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

function escapeAttr(value) {
  return String(value || "").replace(/'/g, "\\'").replace(/\n/g, "");
}
