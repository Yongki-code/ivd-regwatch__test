const sampleItems = [
  {
    id: "sample-1",
    title: "New Implementing Regulation sets out uniform requirements for conformity assessment and notified bodies",
    source: "MDCG",
    region: "EU",
    type: "Guidance",
    date: "2026-05-18",
    link: "https://health.ec.europa.eu/medical-devices-sector/latest-updates_en",
    summary: "적합성 평가와 인증기관 요구사항에 영향을 줄 수 있는 업데이트입니다. 인증 전략, 기술문서, 심사 대응 자료에 반영할 변경점이 있는지 검토가 필요합니다.",
    severity: "medium",
    read: false,
    action: "법규 원문과 부속서를 확인한 뒤 인증기관 커뮤니케이션, 기술문서 목차, 제품군별 갭 분석표를 업데이트하세요.",
    impactPoints: ["자사 제품군 인증 경로 영향 확인", "Annex VII 체크리스트 갱신", "인증기관 질의사항 정리"]
  },
  {
    id: "sample-2",
    title: "Update – new manufacturer incident report PDF file (SB 11154) and important information about which MIR 7.3.1. versions are accepted from 1st May 2026",
    source: "MDCG",
    region: "EU",
    type: "Guidance",
    date: "2026-05-07",
    link: "https://health.ec.europa.eu/medical-devices-sector/latest-updates_en",
    summary: "제조사 사고 보고, MIR 양식 또는 감시체계 운영과 관련된 업데이트입니다. RA/QA 담당자는 적용일, 제출 양식, 내부 보고 절차 변경 여부를 우선 확인해야 합니다.",
    severity: "high",
    read: false,
    action: "즉시 영향 평가를 열고 관련 SOP, 제출 양식, 책임자별 액션 항목을 확인하세요. 적용일이 명시된 경우 변경관리 티켓을 생성하는 것을 권장합니다.",
    impactPoints: ["MIR 7.3.1 적용 여부 확인", "vigilance SOP 개정 검토", "유럽 대리인 및 수입자 공유"]
  },
  {
    id: "sample-3",
    title: "Implementing Regulation (EU) 2026/977 – uniform requirements for conformity assessment and notified bodies (Annex VII)",
    source: "MDCG",
    region: "EU",
    type: "Guidance",
    date: "2026-05-05",
    link: "https://eur-lex.europa.eu/",
    summary: "EU 의료기기 규정을 준수하기 위한 통일된 요구사항을 제시합니다. IVD 제품의 안전성과 효능 보장을 위해 인증기관과 적합성 평가 과정의 일관성을 확인하세요.",
    severity: "high",
    read: false,
    action: "Annex VII 요구사항을 내부 기술문서 점검표에 반영하고, 진행 중인 인증 프로젝트의 심사 범위를 재확인하세요.",
    impactPoints: ["심사 대응 자료 갭 분석", "인증기관 계약 범위 확인", "품질문서 변경관리 착수"]
  }
];

let allItems = [];
let activeSeverity = "all";
let selectedItemId = null;

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

function getFilteredItems() {
  const query = elements.searchInput.value.trim().toLowerCase();
  const regions = getCheckedValues("region");
  const types = getCheckedValues("type");

  return allItems.filter((item) => {
    const matchesQuery = !query || `${item.title} ${item.summary}`.toLowerCase().includes(query);
    const matchesRegion = regions.includes(item.region);
    const matchesType = types.includes(item.type);
    const matchesSeverity = activeSeverity === "all" || item.severity === activeSeverity;
    return matchesQuery && matchesRegion && matchesType && matchesSeverity;
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
      <h3>AI 요약</h3>
      <p>${escapeHtml(item.summary)}</p>
    </section>

    <section class="insight-card action">
      <h3>RA ACTION</h3>
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

const isGitHubPages = location.hostname.endsWith("github.io");
const endpoint = isGitHubPages
  ? "data/mdcg-cache.json"
  : useCacheFirst
    ? "/api/cache"
    : "/api/rss";
  try {
    const response = await fetch(endpoint);
    if (!response.ok) throw new Error("feed unavailable");
    const payload = await response.json();
    allItems = payload.items?.length ? payload.items : sampleItems;
    elements.lastCollected.textContent = payload.collectedAt ? payload.collectedAt.slice(0, 10) : "-";
    elements.collectionMode.textContent = payload.mode === "html-fallback" ? "HTML 보조" : "RSS";
  } catch (error) {
    if (!useCacheFirst) {
      return loadFeed(true);
    }
    allItems = sampleItems;
    elements.lastCollected.textContent = "샘플";
    elements.collectionMode.textContent = "샘플";
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
