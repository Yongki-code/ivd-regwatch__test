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
  githubTokenInput: document.querySelector("#githubTokenInput"),
  githubBranchInput: document.querySelector("#githubBranchInput"),
  sourcesJsonInput: document.querySelector("#sourcesJsonInput"),
  sourceApplyStatus: document.querySelector("#sourceApplyStatus"),
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

function getRepoInfo() {
  const owner = location.hostname.endsWith("github.io") ? location.hostname.split(".")[0] : "";
  const repo = location.hostname.endsWith("github.io") ? location.pathname.split("/").filter(Boolean)[0] : "";
  return { owner, repo };
}

function setApplyStatus(message, tone = "muted") {
  elements.sourceApplyStatus.textContent = message;
  elements.sourceApplyStatus.dataset.tone = tone;
}

function toBase64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function fromBase64(value) {
  const binary = atob(value.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function validateSourcesJson(value) {
  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed)) {
    throw new Error("최상위 값은 배열이어야 합니다.");
  }

  parsed.forEach((source, index) => {
    ["id", "source", "region", "type", "url"].forEach((key) => {
      if (!source[key]) {
        throw new Error(`${index + 1}번째 소스에 ${key} 값이 없습니다.`);
      }
    });
    try {
      new URL(source.url);
    } catch {
      throw new Error(`${index + 1}번째 소스 URL 형식이 올바르지 않습니다.`);
    }
    if (source.keywords && !Array.isArray(source.keywords)) {
      throw new Error(`${index + 1}번째 소스 keywords는 배열이어야 합니다.`);
    }
  });

  return parsed;
}

async function githubRequest(path, options = {}) {
  const token = elements.githubTokenInput.value.trim();
  if (!token) {
    throw new Error("GitHub classic token을 입력해 주세요.");
  }

  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`GitHub API 오류 ${response.status}: ${detail.slice(0, 220)}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

async function loadSourcesConfig() {
  const { owner, repo } = getRepoInfo();
  const branch = elements.githubBranchInput.value.trim() || "main";
  const token = elements.githubTokenInput.value.trim();

  async function loadPublishedConfig(message) {
    const response = await fetch("./config/sources.json");
    if (!response.ok) throw new Error("config/sources.json을 불러오지 못했습니다.");
    elements.sourcesJsonInput.value = JSON.stringify(await response.json(), null, 2);
    setApplyStatus(message, "success");
  }

  setApplyStatus("현재 설정을 불러오는 중입니다.", "muted");

  if (!owner || !repo) {
    await loadPublishedConfig("배포된 설정을 불러왔습니다. 저장 적용은 GitHub Pages 주소에서 가능합니다.");
    return;
  }

  if (!token) {
    await loadPublishedConfig("배포된 설정을 불러왔습니다. 저장하려면 GitHub classic token을 입력하세요.");
    return;
  }

  try {
    const data = await githubRequest(`/repos/${owner}/${repo}/contents/config/sources.json?ref=${encodeURIComponent(branch)}`);
    elements.sourcesJsonInput.dataset.sha = data.sha;
    elements.sourcesJsonInput.value = JSON.stringify(JSON.parse(fromBase64(data.content)), null, 2);
    setApplyStatus("GitHub 저장소의 최신 config/sources.json을 불러왔습니다.", "success");
  } catch (error) {
    await loadPublishedConfig(`GitHub API 불러오기는 실패했지만 배포된 설정을 표시했습니다. ${error.message}`);
  }
}

function insertSourceTemplate() {
  const template = {
    id: "new-authority-feed",
    enabled: true,
    source: "Authority",
    authority: "Authority full name",
    region: "KR",
    country: "Korea",
    type: "Guidance",
    url: "https://example.com/rss.xml",
    keywords: ["medical device", "ivd", "recall", "guidance"]
  };

  const current = elements.sourcesJsonInput.value.trim();
  const sources = current ? validateSourcesJson(current) : [];
  sources.push(template);
  elements.sourcesJsonInput.value = JSON.stringify(sources, null, 2);
  setApplyStatus("소스 템플릿을 추가했습니다. id, source, region, url, keywords를 수정하세요.", "success");
}

async function applySourcesConfig() {
  const { owner, repo } = getRepoInfo();
  const branch = elements.githubBranchInput.value.trim() || "main";
  const sources = validateSourcesJson(elements.sourcesJsonInput.value);

  if (!owner || !repo) {
    throw new Error("GitHub Pages URL에서 접속해야 저장소에 바로 적용할 수 있습니다.");
  }

  setApplyStatus("GitHub에 설정을 저장하는 중입니다. 잠시만 기다려 주세요.", "muted");
  let sha = elements.sourcesJsonInput.dataset.sha;
  if (!sha) {
    const data = await githubRequest(`/repos/${owner}/${repo}/contents/config/sources.json?ref=${encodeURIComponent(branch)}`);
    sha = data.sha;
  }

  await githubRequest(`/repos/${owner}/${repo}/contents/config/sources.json`, {
    method: "PUT",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      message: "Update regulatory source settings",
      content: toBase64(`${JSON.stringify(sources, null, 2)}\n`),
      sha,
      branch
    })
  });

  setApplyStatus("설정 저장 완료. 수집 워크플로우를 실행하는 중입니다.", "success");
  await githubRequest(`/repos/${owner}/${repo}/actions/workflows/update-and-deploy.yml/dispatches`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ ref: branch })
  });

  setApplyStatus("적용 완료. Actions 탭에서 실행 상태를 확인하고, 완료 후 사이트를 새로고침하세요.", "success");
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
  if (!elements.sourcesJsonInput.value.trim()) {
    loadSourcesConfig().catch((error) => setApplyStatus(error.message, "error"));
  }
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
document.querySelector("#loadSourcesButton").addEventListener("click", () => {
  loadSourcesConfig().catch((error) => setApplyStatus(error.message, "error"));
});
document.querySelector("#insertSourceButton").addEventListener("click", () => {
  try {
    insertSourceTemplate();
  } catch (error) {
    setApplyStatus(error.message, "error");
  }
});
document.querySelector("#applySourcesButton").addEventListener("click", () => {
  applySourcesConfig().catch((error) => setApplyStatus(error.message, "error"));
});

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


