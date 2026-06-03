const STORAGE_KEY = "historical-map-state-v4";
const OLD_STORAGE_KEYS = ["historical-map-state-v3", "historical-map-state-v2"];
const MAX_ICON_SIZE = 300 * 1024;
const ALLOWED_ICON_TYPES = ["image/png", "image/jpeg", "image/svg+xml", "image/x-icon", "image/vnd.microsoft.icon", "image/webp"];

let topics = [];
let placeIcons = [];
let placeTypes = [];
let places = [];
let activeTopicId = "all";
let selectedPlaceId = null;
let managerMode = "topics";
let map;
let markersLayer;
let editMarker = null;
let coordinatePickMode = false;
let pendingIconDataUrl = "";
let pendingIconFileName = "";
let pendingIconFileType = "";

const els = {
  topicList: document.querySelector("#topicList"),
  placeList: document.querySelector("#placeList"),
  detailPanel: document.querySelector("#detailPanel"),
  mapHint: document.querySelector("#mapHint"),
  searchInput: document.querySelector("#searchInput"),
  typeFilter: document.querySelector("#typeFilter"),
  topicSelectVisual: document.querySelector("#topicSelectVisual"),
  resetBtn: document.querySelector("#resetBtn"),
  addPlaceBtn: document.querySelector("#addPlaceBtn"),
  manageTopicsBtn: document.querySelector("#manageTopicsBtn"),
  manageTypesBtn: document.querySelector("#manageTypesBtn"),
  manageIconsBtn: document.querySelector("#manageIconsBtn"),
  quickAddTopicBtn: document.querySelector("#quickAddTopicBtn"),

  placeDialog: document.querySelector("#placeDialog"),
  placeForm: document.querySelector("#placeForm"),
  placeFormTitle: document.querySelector("#placeFormTitle"),
  placeTopics: document.querySelector("#placeTopics"),
  placeType: document.querySelector("#placeType"),
  placeLat: document.querySelector("#placeLat"),
  placeLng: document.querySelector("#placeLng"),
  pickCoordinateBtn: document.querySelector("#pickCoordinateBtn"),
  coordinateNotice: document.querySelector("#coordinateNotice"),

  topicDialog: document.querySelector("#topicDialog"),
  topicForm: document.querySelector("#topicForm"),
  topicFormTitle: document.querySelector("#topicFormTitle"),

  typeDialog: document.querySelector("#typeDialog"),
  typeForm: document.querySelector("#typeForm"),
  typeFormTitle: document.querySelector("#typeFormTitle"),
  typeIconSelect: document.querySelector("#typeIconSelect"),
  typeIconPreview: document.querySelector("#typeIconPreview"),
  typeIconName: document.querySelector("#typeIconName"),
  typeOpenIconManagerBtn: document.querySelector("#typeOpenIconManagerBtn"),

  iconDialog: document.querySelector("#iconDialog"),
  iconForm: document.querySelector("#iconForm"),
  iconFormTitle: document.querySelector("#iconFormTitle"),
  iconFile: document.querySelector("#iconFile"),
  iconPreview: document.querySelector("#iconPreview"),
  iconFileInfo: document.querySelector("#iconFileInfo"),

  managerDialog: document.querySelector("#managerDialog"),
  managerTitle: document.querySelector("#managerTitle"),
  managerContent: document.querySelector("#managerContent"),
};

init();

async function init() {
  initMap();
  const data = await fetch("data.json").then((res) => res.json());
  const savedState = getSavedState();
  const state = savedState || data;

  topics = state.topics || data.topics || [];
  placeIcons = migratePlaceIcons(state.placeIcons || data.placeIcons || getDefaultIcons());
  placeTypes = migratePlaceTypes(state.placeTypes || data.placeTypes || getDefaultPlaceTypes());
  places = migratePlaces(state.places || data.places || []);

  bindEvents();
  renderAll();
}

function getSavedState() {
  const current = localStorage.getItem(STORAGE_KEY);
  if (current) return JSON.parse(current);
  for (const key of OLD_STORAGE_KEYS) {
    const old = localStorage.getItem(key);
    if (old) return JSON.parse(old);
  }
  return null;
}

function initMap() {
  map = L.map("map").setView([16.3, 106.8], 6);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap contributors",
  }).addTo(map);
  markersLayer = L.layerGroup().addTo(map);
  map.on("click", handleMapClickForCoordinate);
}

function bindEvents() {
  els.searchInput.addEventListener("input", renderAll);
  els.typeFilter.addEventListener("change", renderAll);
  els.topicSelectVisual.addEventListener("change", () => {
    activeTopicId = els.topicSelectVisual.value || "all";
    selectedPlaceId = null;
    els.detailPanel.classList.add("hidden");
    renderAll();
  });
  els.resetBtn.addEventListener("click", resetFilters);
  els.addPlaceBtn.addEventListener("click", () => openPlaceForm());
  els.quickAddTopicBtn.addEventListener("click", () => openTopicForm());
  els.manageTopicsBtn.addEventListener("click", () => openManager("topics"));
  els.manageTypesBtn.addEventListener("click", () => openManager("types"));
  els.manageIconsBtn.addEventListener("click", () => openManager("icons"));
  els.placeForm.addEventListener("submit", savePlaceFromForm);
  els.topicForm.addEventListener("submit", saveTopicFromForm);
  els.typeForm.addEventListener("submit", saveTypeFromForm);
  els.iconForm.addEventListener("submit", saveIconFromForm);
  els.pickCoordinateBtn.addEventListener("click", toggleCoordinatePickMode);
  els.placeLat.addEventListener("input", updateEditMarkerFromInputs);
  els.placeLng.addEventListener("input", updateEditMarkerFromInputs);
  els.placeType.addEventListener("change", updateEditMarkerFromInputs);
  els.typeIconSelect.addEventListener("change", updateTypeIconPreview);
  els.typeOpenIconManagerBtn.addEventListener("click", () => openManager("icons"));
  els.iconFile.addEventListener("change", handleIconFileInput);

  document.querySelectorAll("[data-close]").forEach((btn) => {
    btn.addEventListener("click", () => document.querySelector(`#${btn.dataset.close}`).close());
  });
  els.placeDialog.addEventListener("close", clearEditMarker);
  els.iconDialog.addEventListener("close", clearPendingIconFile);
}

function resetFilters() {
  activeTopicId = "all";
  els.searchInput.value = "";
  els.typeFilter.value = "all";
  if (els.topicSelectVisual) els.topicSelectVisual.value = "all";
  selectedPlaceId = null;
  els.detailPanel.classList.add("hidden");
  renderAll();
}

function renderAll() {
  renderTypeOptions();
  renderTopicOptions();
  renderTopicFilterSelect();
  renderTopics();
  const filtered = getFilteredPlaces();
  renderPlaces(filtered);
  renderMarkers(filtered);
  if (els.managerDialog.open) renderCurrentManager();
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
    if (els.topicSelectVisual) els.topicSelectVisual.value = activeTopicId;
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
    const topicNames = (place.topicIds || []).map(getTopicName).join(" ");
    const typeName = getTypeLabel(place.placeType);
    const matchTopic = activeTopicId === "all" || (place.topicIds || []).includes(activeTopicId);
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
    const iconUrl = getTypeIconUrl(place.placeType);
    card.innerHTML = `
      <h3>${escapeHtml(place.name)}</h3>
      <p>${escapeHtml(place.address)}</p>
      <span class="tag"><img class="tag-icon" src="${escapeAttr(iconUrl)}" alt="" />${escapeHtml(getTypeLabel(place.placeType))}</span>
      <p class="updated-time">Cập nhật: ${formatTime(place.updatedAt)}</p>
    `;
    card.addEventListener("click", () => selectPlace(place.id, true));
    els.placeList.appendChild(card);
  });
}

function renderMarkers(list) {
  markersLayer.clearLayers();
  const bounds = [];
  list.forEach((place) => {
    const marker = L.marker([place.latitude, place.longitude], {
      icon: createLeafletIcon(getTypeIconUrl(place.placeType)),
      draggable: true,
      autoPan: true,
    })
      .bindPopup(`<b>${escapeHtml(place.name)}</b><br>${escapeHtml(place.address)}<br><small>Nhấn giữ marker để kéo sang tọa độ mới.</small>`)
      .on("click", () => selectPlace(place.id, false))
      .on("dragstart", () => {
        selectedPlaceId = place.id;
        flashMapMessage(`Đang di chuyển: ${place.name}`);
      })
      .on("dragend", (event) => saveDraggedPlaceCoordinates(place.id, event.target.getLatLng()));
    marker.addTo(markersLayer);
    bounds.push([place.latitude, place.longitude]);
  });
  if (bounds.length) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
}

function saveDraggedPlaceCoordinates(placeId, latlng) {
  const place = places.find((item) => item.id === placeId);
  if (!place) return;

  place.latitude = Number(formatCoord(latlng.lat));
  place.longitude = Number(formatCoord(latlng.lng));
  place.updatedAt = new Date().toISOString();
  selectedPlaceId = place.id;

  persist();
  renderPlaces(getFilteredPlaces());
  renderDetail(place);
  flashMapMessage(`Đã lưu tọa độ mới lúc ${formatTime(place.updatedAt)}`);
  console.log(`Địa điểm "${place.name}" đã cập nhật tọa độ lúc ${formatTime(place.updatedAt)}`);
}

function flashMapMessage(message) {
  if (!els.mapHint) return;
  els.mapHint.textContent = message;
  els.mapHint.classList.remove("hidden");
  window.clearTimeout(flashMapMessage.timer);
  flashMapMessage.timer = window.setTimeout(() => {
    if (!coordinatePickMode) els.mapHint.classList.add("hidden");
  }, 2200);
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
  const topicText = (place.topicIds || []).map(getTopicName).map(escapeHtml).join(", ") || "Chưa có";
  const typeIconUrl = getTypeIconUrl(place.placeType);
  els.detailPanel.innerHTML = `
    <div class="detail-title-row">
      <img class="detail-icon" src="${escapeAttr(typeIconUrl)}" alt="" />
      <div>
        <h2>${escapeHtml(place.name)}</h2>
        <p class="detail-subtitle">${escapeHtml(getTypeLabel(place.placeType))}</p>
      </div>
    </div>
    <div class="detail-info-grid">
      <p><b>Địa chỉ</b><span>${escapeHtml(place.address)}</span></p>
      <p><b>Chủ đề</b><span>${topicText}</span></p>
      <p><b>Tọa độ</b><span>${formatCoord(place.latitude)}, ${formatCoord(place.longitude)}</span></p>
      <p><b>Cập nhật</b><span>${formatTime(place.updatedAt)}</span></p>
    </div>
    ${place.description ? `<p class="detail-description">${escapeHtml(place.description)}</p>` : ""}
    ${place.note ? `<p class="detail-description"><b>Ghi chú:</b> ${escapeHtml(place.note)}</p>` : ""}
    <div class="print-box">
      <b>Thông tin đã cập nhật</b><br>
      ${escapeHtml(place.name)} · ${formatCoord(place.latitude)}, ${formatCoord(place.longitude)} · ${formatTime(place.updatedAt)}
    </div>
    <div class="detail-actions">
      <button class="primary-btn" onclick="window.open('${escapeAttr(googleUrl)}', '_blank')">Google Maps</button>
      <button class="ghost-btn" onclick="openPlaceForm('${place.id}')">Sửa</button>
      <button class="danger-btn" onclick="deletePlace('${place.id}')">Xoá</button>
      <button class="ghost-btn" onclick="closeDetail()">Đóng</button>
    </div>
  `;
  els.detailPanel.classList.remove("hidden");
}

function renderTopicOptions() {
  els.placeTopics.innerHTML = topics.map((topic) => `<option value="${escapeAttr(topic.id)}">${escapeHtml(topic.name)}</option>`).join("");
}

function renderTopicFilterSelect() {
  if (!els.topicSelectVisual) return;
  const oldValue = activeTopicId || "all";
  els.topicSelectVisual.innerHTML = `<option value="all">Tất cả chủ đề</option>` + topics.map((topic) => `<option value="${escapeAttr(topic.id)}">${escapeHtml(topic.name)}</option>`).join("");
  activeTopicId = topics.some((topic) => topic.id === oldValue) ? oldValue : "all";
  els.topicSelectVisual.value = activeTopicId;
}

function renderTypeOptions() {
  const oldFilter = els.typeFilter.value || "all";
  els.typeFilter.innerHTML = `<option value="all">Tất cả loại địa điểm</option>` + placeTypes.map((type) => `<option value="${escapeAttr(type.id)}">${escapeHtml(type.name)}</option>`).join("");
  els.typeFilter.value = placeTypes.some((type) => type.id === oldFilter) ? oldFilter : "all";
  els.placeType.innerHTML = placeTypes.map((type) => `<option value="${escapeAttr(type.id)}">${escapeHtml(type.name)}</option>`).join("");
}

function openPlaceForm(placeId = null) {
  if (!topics.length) return alert("Vui lòng thêm ít nhất một chủ đề trước khi thêm địa điểm."), openTopicForm();
  if (!placeTypes.length) return alert("Vui lòng thêm ít nhất một loại địa điểm trước khi thêm địa điểm."), openTypeForm();
  const place = placeId ? places.find((item) => item.id === placeId) : null;
  els.placeForm.reset();
  clearEditMarker(false);
  document.querySelector("#placeId").value = place?.id || "";
  els.placeFormTitle.textContent = place ? "Sửa địa điểm" : "Thêm địa điểm";
  document.querySelector("#placeName").value = place?.name || "";
  document.querySelector("#placeAddress").value = place?.address || "";
  els.placeLat.value = place?.latitude ?? "";
  els.placeLng.value = place?.longitude ?? "";
  document.querySelector("#placeGoogleUrl").value = place?.googleMapsUrl || "";
  document.querySelector("#placeDescription").value = place?.description || "";
  document.querySelector("#placeNote").value = place?.note || "";
  els.placeType.value = place?.placeType || placeTypes[0].id;
  [...els.placeTopics.options].forEach((option) => {
    option.selected = place ? (place.topicIds || []).includes(option.value) : false;
  });
  els.coordinateNotice.classList.add("hidden");
  els.placeDialog.showModal();

  if (place) {
    map.setView([place.latitude, place.longitude], 16);
    createOrMoveEditMarker(place.latitude, place.longitude, place.placeType);
  }
}
window.openPlaceForm = openPlaceForm;

function savePlaceFromForm(event) {
  event.preventDefault();
  const oldId = document.querySelector("#placeId").value;
  const id = oldId || createId(document.querySelector("#placeName").value, "place");
  const topicIds = [...els.placeTopics.selectedOptions].map((option) => option.value);
  const latitude = Number(els.placeLat.value);
  const longitude = Number(els.placeLng.value);
  if (!topicIds.length) return alert("Vui lòng chọn ít nhất một chủ đề.");
  if (!isValidLatitude(latitude)) return alert("Latitude phải nằm trong khoảng -90 đến 90.");
  if (!isValidLongitude(longitude)) return alert("Longitude phải nằm trong khoảng -180 đến 180.");

  const now = new Date().toISOString();
  const payload = {
    id,
    topicIds,
    name: document.querySelector("#placeName").value.trim(),
    address: document.querySelector("#placeAddress").value.trim(),
    latitude,
    longitude,
    placeType: els.placeType.value,
    googleMapsUrl: document.querySelector("#placeGoogleUrl").value.trim(),
    description: document.querySelector("#placeDescription").value.trim(),
    note: document.querySelector("#placeNote").value.trim(),
    updatedAt: now,
  };
  const index = places.findIndex((item) => item.id === id);
  if (index >= 0) places[index] = { ...places[index], ...payload };
  else places.push({ ...payload, createdAt: now });
  persist();
  console.log(`Địa điểm "${payload.name}" đã cập nhật lúc ${formatTime(payload.updatedAt)}`);
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

function toggleCoordinatePickMode() {
  coordinatePickMode = !coordinatePickMode;
  els.pickCoordinateBtn.textContent = coordinatePickMode ? "Đang chọn..." : "Chọn trên bản đồ";
  els.mapHint.classList.toggle("hidden", !coordinatePickMode);
  map.getContainer().style.cursor = coordinatePickMode ? "crosshair" : "";
}

function handleMapClickForCoordinate(event) {
  if (!coordinatePickMode || !els.placeDialog.open) return;
  setCoordinateFields(event.latlng.lat, event.latlng.lng);
  createOrMoveEditMarker(event.latlng.lat, event.latlng.lng, els.placeType.value);
  els.coordinateNotice.textContent = "Đã chọn tọa độ mới. Bấm “Lưu địa điểm” để cập nhật.";
  els.coordinateNotice.classList.remove("hidden");
  coordinatePickMode = false;
  els.pickCoordinateBtn.textContent = "Chọn trên bản đồ";
  els.mapHint.classList.add("hidden");
  map.getContainer().style.cursor = "";
}

function createOrMoveEditMarker(lat, lng, typeId = els.placeType.value) {
  if (!isValidLatitude(Number(lat)) || !isValidLongitude(Number(lng))) return;
  const icon = createLeafletIcon(getTypeIconUrl(typeId), true);
  if (!editMarker) {
    editMarker = L.marker([lat, lng], { draggable: true, icon }).addTo(map);
    editMarker.on("dragend", () => {
      const point = editMarker.getLatLng();
      setCoordinateFields(point.lat, point.lng);
      els.coordinateNotice.textContent = "Tọa độ đã thay đổi. Bấm “Lưu địa điểm” để cập nhật.";
      els.coordinateNotice.classList.remove("hidden");
    });
  } else {
    editMarker.setLatLng([lat, lng]);
    editMarker.setIcon(icon);
  }
}

function updateEditMarkerFromInputs() {
  const lat = Number(els.placeLat.value);
  const lng = Number(els.placeLng.value);
  if (!els.placeDialog.open || !isValidLatitude(lat) || !isValidLongitude(lng)) return;
  createOrMoveEditMarker(lat, lng, els.placeType.value);
}

function setCoordinateFields(lat, lng) {
  els.placeLat.value = formatCoord(lat);
  els.placeLng.value = formatCoord(lng);
}

function clearEditMarker(closePicker = true) {
  if (editMarker) {
    map.removeLayer(editMarker);
    editMarker = null;
  }
  if (closePicker) {
    coordinatePickMode = false;
    els.pickCoordinateBtn.textContent = "Chọn trên bản đồ";
    els.mapHint.classList.add("hidden");
    map.getContainer().style.cursor = "";
  }
}

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
}

function deleteTopic(id) {
  const topic = topics.find((item) => item.id === id);
  if (!topic) return;
  const usedCount = places.filter((place) => (place.topicIds || []).includes(id)).length;
  if (usedCount) return alert(`Chủ đề "${topic.name}" đang được sử dụng bởi ${usedCount} địa điểm. Không thể xoá.`);
  if (!confirm(`Bạn có chắc muốn xoá chủ đề "${topic.name}"?`)) return;
  topics = topics.filter((item) => item.id !== id);
  if (activeTopicId === id) activeTopicId = "all";
  persist();
  renderAll();
}
window.deleteTopic = deleteTopic;

function openTypeForm(typeId = null) {
  const type = typeId ? placeTypes.find((item) => item.id === typeId) : null;
  els.typeForm.reset();
  renderIconSelectOptions(els.typeIconSelect, type?.iconId || getDefaultIconId());
  els.typeFormTitle.textContent = type ? "Sửa loại địa điểm" : "Thêm loại địa điểm";
  document.querySelector("#typeId").value = type?.id || "";
  document.querySelector("#typeName").value = type?.name || "";
  document.querySelector("#typeValue").value = type?.id || "";
  updateTypeIconPreview();
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
  const payload = { id: newId, name, iconId: els.typeIconSelect.value || getDefaultIconId() };
  const index = placeTypes.findIndex((item) => item.id === oldId);
  if (index >= 0) {
    placeTypes[index] = payload;
    if (oldId !== newId) places = places.map((place) => place.placeType === oldId ? { ...place, placeType: newId, updatedAt: new Date().toISOString() } : place);
  } else {
    placeTypes.push(payload);
  }
  persist();
  els.typeDialog.close();
  renderAll();
}

function deleteType(id) {
  const type = placeTypes.find((item) => item.id === id);
  if (!type) return;
  const usedCount = places.filter((place) => place.placeType === id).length;
  if (usedCount) return alert(`Loại "${type.name}" đang được sử dụng bởi ${usedCount} địa điểm. Không thể xoá.`);
  if (!confirm(`Bạn có chắc muốn xoá loại địa điểm "${type.name}"?`)) return;
  placeTypes = placeTypes.filter((item) => item.id !== id);
  persist();
  renderAll();
}
window.deleteType = deleteType;

function openIconForm(iconId = null) {
  const icon = iconId ? placeIcons.find((item) => item.id === iconId) : null;
  els.iconForm.reset();
  clearPendingIconFile();
  els.iconFormTitle.textContent = icon ? "Sửa icon" : "Thêm icon";
  document.querySelector("#iconId").value = icon?.id || "";
  document.querySelector("#iconName").value = icon?.name || "";
  els.iconPreview.src = icon?.url || getIconUrl(getDefaultIconId());
  els.iconFileInfo.textContent = icon ? `${icon.fileName || "icon"} · ${icon.type || "file"}` : "Chưa chọn file";
  els.iconDialog.showModal();
}
window.openIconForm = openIconForm;

function handleIconFileInput(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!ALLOWED_ICON_TYPES.includes(file.type) && !/\.(png|jpe?g|svg|ico|webp)$/i.test(file.name)) {
    event.target.value = "";
    return alert("Định dạng icon không hợp lệ. Chỉ hỗ trợ PNG, JPG, JPEG, SVG, ICO, WEBP.");
  }
  if (file.size > MAX_ICON_SIZE) {
    event.target.value = "";
    return alert("Icon quá lớn. Vui lòng chọn file nhỏ hơn 300KB.");
  }
  const reader = new FileReader();
  reader.onload = () => {
    pendingIconDataUrl = String(reader.result || "");
    pendingIconFileName = file.name;
    pendingIconFileType = getFileExtension(file.name) || file.type;
    els.iconPreview.src = pendingIconDataUrl;
    els.iconFileInfo.textContent = `${file.name} · ${Math.ceil(file.size / 1024)}KB`;
  };
  reader.readAsDataURL(file);
}

function saveIconFromForm(event) {
  event.preventDefault();
  const oldId = document.querySelector("#iconId").value;
  const existing = placeIcons.find((item) => item.id === oldId);
  const name = document.querySelector("#iconName").value.trim();
  if (!oldId && !pendingIconDataUrl) return alert("Vui lòng chọn file icon.");
  const now = new Date().toISOString();
  const payload = {
    id: oldId || createId(name, "icon"),
    name,
    fileName: pendingIconFileName || existing?.fileName || `${slugify(name)}.svg`,
    url: pendingIconDataUrl || existing?.url || getIconUrl(getDefaultIconId()),
    type: pendingIconFileType || existing?.type || "svg",
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  const index = placeIcons.findIndex((item) => item.id === payload.id);
  if (index >= 0) placeIcons[index] = payload;
  else placeIcons.push(payload);
  persist();
  els.iconDialog.close();
  renderAll();
}

function deleteIcon(id) {
  const icon = placeIcons.find((item) => item.id === id);
  if (!icon) return;
  if (id === getDefaultIconId()) return alert("Không thể xoá icon mặc định.");
  const usedCount = placeTypes.filter((type) => type.iconId === id).length;
  if (usedCount) return alert(`Icon "${icon.name}" đang được sử dụng bởi ${usedCount} loại địa điểm. Không thể xoá.`);
  if (!confirm(`Bạn có chắc muốn xoá icon "${icon.name}"?`)) return;
  placeIcons = placeIcons.filter((item) => item.id !== id);
  persist();
  renderAll();
}
window.deleteIcon = deleteIcon;

function clearPendingIconFile() {
  pendingIconDataUrl = "";
  pendingIconFileName = "";
  pendingIconFileType = "";
  if (els.iconFile) els.iconFile.value = "";
}

function renderIconSelectOptions(selectEl, selectedId) {
  selectEl.innerHTML = placeIcons.map((icon) => `<option value="${escapeAttr(icon.id)}">${escapeHtml(icon.name)}</option>`).join("");
  selectEl.value = placeIcons.some((icon) => icon.id === selectedId) ? selectedId : getDefaultIconId();
}

function updateTypeIconPreview() {
  const icon = placeIcons.find((item) => item.id === els.typeIconSelect.value);
  els.typeIconPreview.src = icon?.url || getIconUrl(getDefaultIconId());
  els.typeIconName.textContent = icon?.name || "Icon mặc định";
}

function openManager(mode) {
  managerMode = mode;
  renderCurrentManager();
  els.managerDialog.showModal();
}

function renderCurrentManager() {
  if (managerMode === "topics") renderTopicManager();
  if (managerMode === "types") renderTypeManager();
  if (managerMode === "icons") renderIconManager();
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
          <button class="ghost-btn" onclick="openTopicForm('${escapeAttr(topic.id)}')">Sửa</button>
          <button class="danger-btn" onclick="deleteTopic('${escapeAttr(topic.id)}')">Xoá</button>
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
          <div class="manager-title-line">
            <img src="${escapeAttr(getTypeIconUrl(type.id))}" alt="" />
            <h3>${escapeHtml(type.name)}</h3>
          </div>
          <p>Mã: ${escapeHtml(type.id)} · Icon: ${escapeHtml(getIconName(type.iconId))} · ${countPlacesByType(type.id)} địa điểm</p>
        </div>
        <div class="row-actions">
          <button class="ghost-btn" onclick="openTypeForm('${escapeAttr(type.id)}')">Sửa</button>
          <button class="danger-btn" onclick="deleteType('${escapeAttr(type.id)}')">Xoá</button>
        </div>
      </article>
    `).join("") : `<div class="empty">Chưa có loại địa điểm.</div>`}
  `;
}

function renderIconManager() {
  els.managerTitle.textContent = "Quản lý icon địa điểm";
  els.managerContent.innerHTML = `
    <button class="primary-btn full-btn" onclick="openIconForm()">+ Thêm icon</button>
    <div class="icon-grid">
      ${placeIcons.length ? placeIcons.map((icon) => `
        <article class="icon-card">
          <img src="${escapeAttr(icon.url)}" alt="" />
          <div>
            <h3>${escapeHtml(icon.name)}</h3>
            <p>${escapeHtml(icon.fileName || "icon")} · ${countTypesByIcon(icon.id)} loại đang dùng</p>
            <p>Cập nhật: ${formatTime(icon.updatedAt)}</p>
          </div>
          <div class="row-actions">
            <button class="ghost-btn" onclick="openIconForm('${escapeAttr(icon.id)}')">Sửa</button>
            <button class="danger-btn" onclick="deleteIcon('${escapeAttr(icon.id)}')">Xoá</button>
          </div>
        </article>
      `).join("") : `<div class="empty">Chưa có icon.</div>`}
    </div>
  `;
}

function closeDetail() {
  selectedPlaceId = null;
  els.detailPanel.classList.add("hidden");
}
window.closeDetail = closeDetail;

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ topics, placeIcons, placeTypes, places }));
}

function migratePlaceIcons(icons) {
  const defaults = getDefaultIcons();
  const merged = [...defaults];
  (icons || []).forEach((icon) => {
    if (!icon) return;
    const mapped = {
      id: icon.id || createId(icon.name || icon.fileName || "icon", "icon"),
      name: icon.name || icon.label || icon.fileName || "Icon",
      fileName: icon.fileName || getFileNameFromUrl(icon.url || icon.iconUrl || "icon.svg"),
      url: icon.url || icon.iconUrl || "img/icons/default.svg",
      type: icon.type || getFileExtension(icon.fileName || icon.url || "svg"),
      createdAt: icon.createdAt || new Date().toISOString(),
      updatedAt: icon.updatedAt || icon.createdAt || new Date().toISOString(),
    };
    const index = merged.findIndex((item) => item.id === mapped.id || item.url === mapped.url);
    if (index >= 0) merged[index] = { ...merged[index], ...mapped };
    else merged.push(mapped);
  });
  return merged;
}

function migratePlaceTypes(types) {
  return (types || getDefaultPlaceTypes()).map((type) => {
    if (type.iconId) return type;
    const iconUrl = type.iconUrl || getDefaultIconUrlForType(type.id);
    const icon = placeIcons.find((item) => item.url === iconUrl) || placeIcons.find((item) => item.url.includes(`/${type.id}.svg`));
    return { id: type.id, name: type.name, iconId: icon?.id || getDefaultIconId() };
  });
}

function migratePlaces(items) {
  const now = new Date().toISOString();
  return (items || []).map((place) => ({
    ...place,
    createdAt: place.createdAt || now,
    updatedAt: place.updatedAt || place.createdAt || now,
  }));
}

function getDefaultIcons() {
  const now = "2026-06-02T00:00:00.000Z";
  return [
    { id: "icon_default", name: "Mặc định", fileName: "default.svg", url: "img/icons/default.svg", type: "svg", createdAt: now, updatedAt: now },
    { id: "icon_temple", name: "Đền thờ", fileName: "temple.svg", url: "img/icons/temple.svg", type: "svg", createdAt: now, updatedAt: now },
    { id: "icon_statue", name: "Tượng đài", fileName: "statue.svg", url: "img/icons/statue.svg", type: "svg", createdAt: now, updatedAt: now },
    { id: "icon_relic", name: "Di tích", fileName: "relic.svg", url: "img/icons/relic.svg", type: "svg", createdAt: now, updatedAt: now },
    { id: "icon_museum", name: "Bảo tàng", fileName: "museum.svg", url: "img/icons/museum.svg", type: "svg", createdAt: now, updatedAt: now },
    { id: "icon_battlefield", name: "Chiến trường", fileName: "battlefield.svg", url: "img/icons/battlefield.svg", type: "svg", createdAt: now, updatedAt: now },
    { id: "icon_street", name: "Đường phố", fileName: "street.svg", url: "img/icons/street.svg", type: "svg", createdAt: now, updatedAt: now },
    { id: "icon_school", name: "Trường học", fileName: "school.svg", url: "img/icons/school.svg", type: "svg", createdAt: now, updatedAt: now },
    { id: "icon_other", name: "Khác", fileName: "other.svg", url: "img/icons/other.svg", type: "svg", createdAt: now, updatedAt: now },
  ];
}

function getDefaultPlaceTypes() {
  return [
    { id: "temple", name: "Đền thờ", iconId: "icon_temple" },
    { id: "statue", name: "Tượng đài", iconId: "icon_statue" },
    { id: "relic", name: "Di tích", iconId: "icon_relic" },
    { id: "museum", name: "Bảo tàng", iconId: "icon_museum" },
    { id: "battlefield", name: "Chiến trường", iconId: "icon_battlefield" },
    { id: "street", name: "Đường phố", iconId: "icon_street" },
    { id: "school", name: "Trường học", iconId: "icon_school" },
    { id: "other", name: "Khác", iconId: "icon_other" },
  ];
}

function getTopicName(id) {
  return topics.find((topic) => topic.id === id)?.name || id;
}

function getTypeLabel(id) {
  return placeTypes.find((type) => type.id === id)?.name || id || "Khác";
}

function getTypeIconUrl(typeId) {
  const type = placeTypes.find((item) => item.id === typeId);
  return getIconUrl(type?.iconId) || getDefaultIconUrlForType(typeId) || "img/icons/default.svg";
}

function getIconUrl(iconId) {
  return placeIcons.find((icon) => icon.id === iconId)?.url || placeIcons.find((icon) => icon.id === getDefaultIconId())?.url || "img/icons/default.svg";
}

function getIconName(iconId) {
  return placeIcons.find((icon) => icon.id === iconId)?.name || "Mặc định";
}

function getDefaultIconId() {
  return placeIcons.find((icon) => icon.id === "icon_default")?.id || placeIcons[0]?.id || "icon_default";
}

function getDefaultIconUrlForType(id) {
  return `img/icons/${id || "default"}.svg`;
}

function createLeafletIcon(iconUrl, editing = false) {
  return L.icon({
    iconUrl: iconUrl || "img/icons/default.svg",
    iconSize: editing ? [42, 42] : [34, 34],
    iconAnchor: editing ? [21, 42] : [17, 34],
    popupAnchor: [0, -30],
    className: editing ? "editing-marker" : "",
  });
}

function countPlacesByTopic(id) {
  return places.filter((place) => (place.topicIds || []).includes(id)).length;
}

function countPlacesByType(id) {
  return places.filter((place) => place.placeType === id).length;
}

function countTypesByIcon(id) {
  return placeTypes.filter((type) => type.iconId === id).length;
}

function isValidLatitude(value) {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

function isValidLongitude(value) {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

function formatCoord(value) {
  return Number(value).toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

function formatTime(value) {
  if (!value) return "Chưa có dữ liệu";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa có dữ liệu";
  return date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
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

function getFileExtension(fileName) {
  return String(fileName || "").split(".").pop()?.toLowerCase() || "";
}

function getFileNameFromUrl(url) {
  return String(url || "").split("/").pop() || "icon.svg";
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
