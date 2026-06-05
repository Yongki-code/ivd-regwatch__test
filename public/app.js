let allItems = [];
let activeSeverity = "all";
let selectedItemId = null;
let currentPayload = null;

const elements = {
  feedList: document.querySelector("#feedList"),
  searchInput: document.querySelector("#searchInput"),
  visibleCount: document.querySelector("#visibleCount"),
  totalCount: document.querySelector("#totalCount"),
  todayCount: document.querySelector("#todayCount"),
  highCount: document.querySelector("#highCount"),
  unreadCount: document.querySelector("#unreadCount"),
  lastCollected: document.querySelector("#lastCollected"),
  collectionMode: document.querySelector("#collectionMode"),
  aiStatus: document.querySelector("#aiStatus"),
  aiFooter: document.querySelector("#aiFooter"),
  aiDot: document.querySelector("#aiDot"),
  regionFilters: document.querySelector("#regionFilters"),
  typeFilters: document.querySelector("#typeFilters"),
  sourceFilters: document.querySelector("#sourceFilters"),
  detailPanel: document.querySelector("#detailPanel"),
  detailContent: document.querySelector("#detailContent"),
  settingsModal: document.querySelector("#settingsModal")
};

function escapeHtml(value = "") {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(`${value}T00:00:00`)).replace(/\. /g, "-").replace(".", "");
}

function isThisWeek(value) {
  const date = new Date(`${value}T00:00:00`);
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay());
  start.setHours(0, 0, 0, 0);
  return date >= start && date <= now;
}

function getCheckedValues(filterName) {
  return [...document.querySelectorAll(`[data-filter="${filterName}"]:checked`)].map((input) => input.value);
}

function uniqueValues(key) {
  return [...new Set(allItems.map((item) => item[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function renderFilterGroup(container, filterName, values) {
  container.innerHTML = values.map((value) => `
    <label class="check-row">
      <input type="checkbox" checked data-filter="${filterName}" value="${escapeHtml(value)}" />
      <span>${escapeHtml(value)}</span>
    </label>
  `).join("");

  container.querySelectorAll("[data-filter]").forEach((input) => {
    input.addEventListener("change", renderList);
  });
}

function renderDynamicFilters() {
  renderFilterGroup(elements.regionFilters, "region", uniqueValues("region"));
  renderFilterGroup(elements.typeFilters, "type", uniqueValues("type"));
  renderFilterGroup(elements.sourceFilters, "source", uniqueValues("source"));
}

function getFilteredItems() {
  const query = elements.searchInput.value.trim().toLowerCase();
  const regions = getCheckedValues("region");
  const types = getCheckedValues("type");
  const sources = getCheckedValues("source");

  return allItems.filter((item) => {
    const matchesQuery = !query || `${item.title} ${item.summary}`.toLowerCase().includes(query);
    const matchesRegion = regions.includes(item.region);
    const matchesType = types.includes(item.type);
    const matchesSource = sources.includes(item.source);
    const matchesSeverity = activeSeverity === "all" || item.severity === activeSeverity;
    return matchesQuery && matchesRegion && matchesType && matchesSource && matchesSeverity;
  });
}

function severityLabel(severity) {
  return {
    high: "긴급",
    medium: "중요",
    low: "참고"
  }[severity] || "참고";
}

function renderMetrics(items) {
  const today = new Date().toISOString().slice(0, 10);
  elements.visibleCount.textContent = items.length;
  elements.totalCount.textContent = allItems.length;
  elements.todayCount.textContent = allItems.filter((item) => item.date === today).length;
  elements.highCount.textContent = allItems.filter((item) => item.severity === "high" && isThisWeek(item.date)).length;
  elements.unreadCount.textContent = allItems.filter((item) => !item.read).length;
}

function renderList() {
  const items = getFilteredItems();
  renderMetrics(items);

  if (!items.length) {
    elements.feedList.innerHTML = `
      <article class="empty-state">
        <strong>표시할 업데이트가 없습니다.</strong>
        <span>검색어 또는 필터를 조정해 주세요.</span>
      </article>
    `;
    return;
  }

  elements.feedList.innerHTML = items.map((item) => `
    <article class="feed-card ${item.severity} ${item.id === selectedItemId ? "selected" : ""}" data-id="${escapeHtml(item.id)}" tabindex="0">
      <div class="feed-meta">
        <span>${escapeHtml(item.source)}</span>
        <span class="separator">·</span>
        <span class="region-pill">${escapeHtml(item.region)}</span>
        <span class="separator">·</span>
        <span>${escapeHtml(item.analysisMode === "ai" ? "AI" : "Rules")}</span>
        ${!item.read ? '<span class="new-badge">NEW</span>' : ""}
      </div>
      <span class="doc-pill">${escapeHtml(item.type)}</span>
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.summary)}</p>
      <time>${formatDate(item.date)}</time>
    </article>
  `).join("");
}

function renderDetail(item) {
  selectedItemId = item.id;
  item.read = true;
  elements.detailPanel.setAttribute("aria-hidden", "false");
  elements.detailPanel.classList.add("open");
  elements.detailContent.innerHTML = `
    <header class="detail-header">
      <h2>${escapeHtml(item.title)}</h2>
      <div class="detail-meta">
        <span class="doc-pill">${escapeHtml(item.source)}</span>
        <span class="region-pill">${escapeHtml(item.region)}</span>
        <time>${formatDate(item.date)}</time>
        <strong class="severity-badge ${item.severity}">${severityLabel(item.severity)}</strong>
      </div>
    </header>

    <section class="insight-card ai">
      <h3>${item.analysisMode === "ai" ? "AI 요약" : "규칙 기반 요약"}</h3>
      <p>${escapeHtml(item.summary)}</p>
    </section>

    <section class="insight-card action">
      <h3>${item.analysisMode === "ai" ? "AI RA ACTION" : "RA ACTION"}</h3>
      <p>${escapeHtml(item.action)}</p>
    </section>

    <section class="impact-block">
      <h3>자사 영향 검토 포인트</h3>
      <ul>
        ${item.impactPoints.map((point) => `<li>${escapeHtml(point)}</li>`).join("")}
      </ul>
    </section>

    <a class="source-link" href="${escapeHtml(item.link)}" target="_blank" rel="noreferrer">원문 열기</a>
  `;
  renderList();
}

function closeDetail() {
  elements.detailPanel.setAttribute("aria-hidden", "true");
  elements.detailPanel.classList.remove("open");
  selectedItemId = null;
  renderList();
}

async function loadFeed(useCacheFirst = false) {
  elements.feedList.innerHTML = `
    <article class="empty-state loading">
      <strong>MDCG RSS를 수집하는 중입니다.</strong>
      <span>공식 European Commission 업데이트를 확인하고 있습니다.</span>
    </article>
  `;

  const isLocalServer =
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1" ||
    location.hostname === "";
  const endpoint = isLocalServer
    ? useCacheFirst
      ? "/api/cache"
      : "/api/rss"
    : "./data/mdcg-cache.json";
  try {
    const response = await fetch(endpoint);
    if (!response.ok) throw new Error("feed unavailable");
    const payload = await response.json();
    currentPayload = payload;
    allItems = payload.items || [];
    elements.lastCollected.textContent = payload.collectedAt ? payload.collectedAt.slice(0, 10) : "-";
    elements.collectionMode.textContent = payload.mode?.includes("ai") ? "RSS + AI" : "RSS";
    elements.aiStatus.textContent = payload.aiEnabled ? "활성" : "비활성";
    elements.aiFooter.textContent = payload.aiEnabled ? "AI 분석 활성" : "규칙 기반 분석";
    elements.aiDot.classList.toggle("success", Boolean(payload.aiEnabled));
    renderDynamicFilters();
  } catch (error) {
    if (isLocalServer && !useCacheFirst) {
      return loadFeed(true);
    }
    allItems = [];
    elements.lastCollected.textContent = "-";
    elements.collectionMode.textContent = "오류";
    elements.aiStatus.textContent = "비활성";
    elements.aiFooter.textContent = "데이터 로드 실패";
    renderDynamicFilters();
  }
  renderList();
}

function openSettings() {
  elements.settingsModal.classList.add("open");
  elements.settingsModal.setAttribute("aria-hidden", "false");
}

function closeSettings() {
  elements.settingsModal.classList.remove("open");
  elements.settingsModal.setAttribute("aria-hidden", "true");
}

document.querySelector("#feedList").addEventListener("click", (event) => {
  const card = event.target.closest(".feed-card");
  if (!card) return;
  const item = allItems.find((entry) => entry.id === card.dataset.id);
  if (item) renderDetail(item);
});

document.querySelector("#feedList").addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  const card = event.target.closest(".feed-card");
  if (!card) return;
  const item = allItems.find((entry) => entry.id === card.dataset.id);
  if (item) renderDetail(item);
});

document.querySelector("#closeDetail").addEventListener("click", closeDetail);
document.querySelector("#searchInput").addEventListener("input", renderList);
document.querySelector("#refreshButton").addEventListener("click", () => loadFeed(false));
document.querySelector("#modalRefresh").addEventListener("click", () => loadFeed(false));
document.querySelector("#settingsButton").addEventListener("click", openSettings);
document.querySelector("#closeSettings").addEventListener("click", closeSettings);
document.querySelector("#cancelSettings").addEventListener("click", closeSettings);
document.querySelector("#saveSettings").addEventListener("click", closeSettings);

document.querySelectorAll("[data-filter]").forEach((input) => {
  input.addEventListener("change", renderList);
});

document.querySelectorAll("[data-severity]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-severity]").forEach((entry) => entry.classList.remove("active"));
    button.classList.add("active");
    activeSeverity = button.dataset.severity;
    renderList();
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeDetail();
    closeSettings();
  }
});

loadFeed();


