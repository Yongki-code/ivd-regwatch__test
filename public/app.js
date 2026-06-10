let allItems = [];
let activeSeverity = "all";
let selectedItemId = null;
let currentPayload = null;
let sourceDrafts = [];
let dataDraftItems = [];

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
  sourceEditIndex: document.querySelector("#sourceEditIndex"),
  sourceNameInput: document.querySelector("#sourceNameInput"),
  sourceUrlInput: document.querySelector("#sourceUrlInput"),
  sourceAuthorityInput: document.querySelector("#sourceAuthorityInput"),
  sourceRegionInput: document.querySelector("#sourceRegionInput"),
  sourceTypeInput: document.querySelector("#sourceTypeInput"),
  sourceKeywordsInput: document.querySelector("#sourceKeywordsInput"),
  sourceKindAutoLabel: document.querySelector("#sourceKindAutoLabel"),
  managedSourceList: document.querySelector("#managedSourceList"),
  sourceApplyStatus: document.querySelector("#sourceApplyStatus"),
  managedDataList: document.querySelector("#managedDataList"),
  dataApplyStatus: document.querySelector("#dataApplyStatus"),
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
  if (!value) return "날짜 확인 필요";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "날짜 확인 필요";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(parsed).replace(/\. /g, "-").replace(".", "");
}

function isThisWeek(value) {
  if (!value) return false;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay());
  start.setHours(0, 0, 0, 0);
  return date >= start && date <= now;
}

function getCheckedValues(filterName) {
  return [...document.querySelectorAll(`[data-filter="${filterName}"]:checked`)].map((input) => input.value);
}

function configuredSources() {
  const payloadSources = currentPayload?.sources || [];
  return [...payloadSources, ...sourceDrafts].filter((source) => source && source.enabled !== false);
}

function uniqueValues(key) {
  const itemValues = allItems.map((item) => item[key]).filter(Boolean);
  const sourceValues = configuredSources().map((source) => source[key]).filter(Boolean);
  return [...new Set([...itemValues, ...sourceValues])].sort((a, b) => a.localeCompare(b));
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
  elements.todayCount.textContent = allItems.filter((item) => item.date && item.date === today).length;
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

function setDataStatus(message, tone = "muted") {
  elements.dataApplyStatus.textContent = message;
  elements.dataApplyStatus.dataset.tone = tone;
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

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "source";
}

function inferSourceKind(url = "") {
  const value = url.trim().toLowerCase();
  if (!value) return "rss";
  if (/api\.fda\.gov\/device\/recall/.test(value)) return "openfda-device-recall";
  if (/\.(rss|xml|atom)(\?|#|$)/.test(value)) return "rss";
  if (/\/(rss|feed|feeds)(\/|\?|#|$)/.test(value)) return "rss";
  if (value.includes("rss") || value.includes("atom")) return "rss";
  return "html-page";
}

function sourceKindLabel(kind = "rss") {
  if (kind === "openfda-device-recall") return "openFDA API";
  if (kind === "html-page") return "HTML";
  return "RSS/Atom";
}

function updateSourceKindPreview(kind = inferSourceKind(elements.sourceUrlInput.value)) {
  if (!elements.sourceKindAutoLabel) return;
  elements.sourceKindAutoLabel.textContent = sourceKindLabel(kind);
}

function normalizeSource(source, index = 0) {
  const sourceName = (source.source || "Authority").trim();
  const region = (source.region || "Global").trim();
  const type = (source.type || "Update").trim();
  const url = (source.url || "").trim();
  const kind = inferSourceKind(url);
  const keywords = Array.isArray(source.keywords)
    ? source.keywords
    : String(source.keywords || "")
        .split(",")
        .map((keyword) => keyword.trim())
        .filter(Boolean);

  return {
    id: source.id || `${slugify(region)}-${slugify(sourceName)}-${index + 1}`,
    enabled: source.enabled !== false,
    source: sourceName,
    authority: (source.authority || sourceName).trim(),
    region,
    country: (source.country || region).trim(),
    type,
    ...(kind && kind !== "rss" ? { kind } : {}),
    url,
    keywords
  };
}

function validateSources(sources) {
  if (!Array.isArray(sources)) {
    throw new Error("소스 목록을 불러오지 못했습니다.");
  }

  return sources.map((source, index) => {
    const normalized = normalizeSource(source, index);
    ["id", "source", "region", "type", "url"].forEach((key) => {
      if (!normalized[key]) {
        throw new Error(`${index + 1}번째 소스에 ${key} 값이 없습니다.`);
      }
    });
    try {
      new URL(normalized.url);
    } catch {
      throw new Error(`${index + 1}번째 소스 URL 형식이 올바르지 않습니다.`);
    }
    return normalized;
  });
}

function clearSourceForm() {
  elements.sourceEditIndex.value = "";
  elements.sourceNameInput.value = "";
  elements.sourceUrlInput.value = "";
  elements.sourceAuthorityInput.value = "";
  elements.sourceRegionInput.value = "EU";
  elements.sourceTypeInput.value = "Guidance";
  elements.sourceKeywordsInput.value = "";
  updateSourceKindPreview("rss");
}

function fillSourceForm(source, index) {
  elements.sourceEditIndex.value = String(index);
  elements.sourceNameInput.value = source.source || "";
  elements.sourceUrlInput.value = source.url || "";
  elements.sourceAuthorityInput.value = source.authority || source.source || "";
  elements.sourceRegionInput.value = source.region || "Global";
  elements.sourceTypeInput.value = source.type || "Update";
  elements.sourceKeywordsInput.value = (source.keywords || []).join(", ");
  updateSourceKindPreview(source.kind || inferSourceKind(source.url || ""));
}

function sourceFromForm() {
  const sourceName = elements.sourceNameInput.value.trim();
  const region = elements.sourceRegionInput.value.trim();
  const type = elements.sourceTypeInput.value.trim();
  const url = elements.sourceUrlInput.value.trim();
  const kind = inferSourceKind(url);

  if (!sourceName) throw new Error("소스 이름을 입력해 주세요.");
  if (!url) throw new Error("URL을 입력해 주세요.");
  new URL(url);

  const editIndex = elements.sourceEditIndex.value === "" ? -1 : Number(elements.sourceEditIndex.value);
  const previous = editIndex >= 0 ? sourceDrafts[editIndex] : null;
  return normalizeSource({
    id: previous?.id || `${slugify(region)}-${slugify(sourceName)}`,
    enabled: previous?.enabled ?? true,
    source: sourceName,
    authority: elements.sourceAuthorityInput.value.trim() || sourceName,
    region,
    country: region,
    type,
    kind,
    url,
    keywords: elements.sourceKeywordsInput.value
      .split(",")
      .map((keyword) => keyword.trim())
      .filter(Boolean)
  });
}

function renderManagedSources() {
  if (!sourceDrafts.length) {
    elements.managedSourceList.innerHTML = `
      <article class="managed-source empty">
        <span>등록된 수집 소스가 없습니다.</span>
      </article>
    `;
    return;
  }

  elements.managedSourceList.innerHTML = sourceDrafts.map((source, index) => `
    <article class="managed-source ${source.enabled ? "" : "disabled"}">
      <label class="switch">
        <input type="checkbox" data-source-toggle="${index}" ${source.enabled ? "checked" : ""} />
        <span></span>
      </label>
      <button class="managed-source-main" type="button" data-source-edit="${index}">
        <strong>${escapeHtml(source.source)}</strong>
        <small>${escapeHtml(source.authority || source.source)}</small>
      </button>
      <span class="source-chip">${escapeHtml(source.region)}</span>
      <span class="source-chip">${escapeHtml(sourceKindLabel(source.kind || "rss"))}</span>
      <button class="source-delete" type="button" data-source-delete="${index}" aria-label="소스 삭제">⌫</button>
    </article>
  `).join("");
}

function saveSourceForm() {
  const source = sourceFromForm();
  const editIndex = elements.sourceEditIndex.value === "" ? -1 : Number(elements.sourceEditIndex.value);
  if (editIndex >= 0) {
    sourceDrafts[editIndex] = source;
  } else {
    sourceDrafts.push(source);
  }
  clearSourceForm();
  renderManagedSources();
  setApplyStatus("소스 목록에 반영했습니다. GitHub에 적용하려면 저장 후 수집 실행을 누르세요.", "success");
}

function newSourceForm() {
  clearSourceForm();
  elements.sourceNameInput.focus();
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function defaultImpactPointsForTest() {
  return [
    "자사 제품군 적용 여부 확인",
    "기술문서, PMS, vigilance 절차 영향 검토",
    "필요 시 RA/QA 후속 액션 지정"
  ];
}

function normalizeDataItem(item, index = 0) {
  const title = (item.title || `Test regulatory update ${index + 1}`).trim();
  const source = (item.source || "Test").trim();
  const region = (item.region || "Global").trim();
  const type = (item.type || "Update").trim();
  const severity = ["high", "medium", "low"].includes(item.severity) ? item.severity : "medium";
  const date = item.date || todayIso();
  const summary = item.summary || item.rawSummary || "테스트용 규제 업데이트 요약입니다.";
  const action = item.action || "RA 담당자는 해당 변경사항의 적용 범위와 내부 절차 반영 필요성을 검토하세요.";
  const link = item.link || "https://example.com";

  return {
    id: item.id || `manual-test:${Date.now()}:${index}`,
    title,
    source,
    authority: item.authority || source,
    region,
    country: item.country || region,
    type,
    date,
    link,
    summary,
    rawSummary: item.rawSummary || summary,
    severity,
    read: Boolean(item.read),
    action,
    impactPoints: Array.isArray(item.impactPoints) && item.impactPoints.length ? item.impactPoints.slice(0, 3) : defaultImpactPointsForTest(),
    analysisMode: item.analysisMode || "manual"
  };
}

function renderManagedData() {
  if (!dataDraftItems.length) {
    elements.managedDataList.innerHTML = `
      <article class="managed-source empty">
        <span>표시할 테스트 데이터가 없습니다.</span>
      </article>
    `;
    return;
  }

  elements.managedDataList.innerHTML = dataDraftItems.map((item, index) => `
    <article class="managed-source data-row">
      <button class="managed-source-main" type="button" data-data-preview="${index}">
        <strong>${escapeHtml(item.title)}</strong>
        <small>${escapeHtml(item.source)} · ${escapeHtml(item.region)} · ${escapeHtml(item.type)} · ${escapeHtml(item.date)}</small>
      </button>
      <span class="source-chip">${escapeHtml(severityLabel(item.severity))}</span>
      <button class="source-delete" type="button" data-data-delete="${index}" aria-label="데이터 삭제">⌫</button>
    </article>
  `).join("");
}

async function loadDataConfig() {
  const { owner, repo } = getRepoInfo();
  const branch = elements.githubBranchInput.value.trim() || "main";
  const token = elements.githubTokenInput.value.trim();

  setDataStatus("수집 데이터를 불러오는 중입니다.", "muted");

  if (owner && repo && token) {
    try {
      const data = await githubRequest(`/repos/${owner}/${repo}/contents/public/data/mdcg-cache.json?ref=${encodeURIComponent(branch)}`);
      elements.managedDataList.dataset.sha = data.sha;
      const payload = JSON.parse(fromBase64(data.content));
      dataDraftItems = (payload.items || []).map(normalizeDataItem);
      renderManagedData();
      setDataStatus(`GitHub 저장소의 수집 데이터 ${dataDraftItems.length}건을 불러왔습니다.`, "success");
      return;
    } catch (error) {
      setDataStatus(`GitHub 데이터 불러오기에 실패해 배포 데이터를 사용합니다. ${error.message}`, "error");
    }
  }

  const response = await fetch("./data/mdcg-cache.json", { cache: "no-store" });
  if (!response.ok) throw new Error("배포된 수집 데이터를 불러오지 못했습니다.");
  const payload = await response.json();
  dataDraftItems = (payload.items || []).map(normalizeDataItem);
  renderManagedData();
  setDataStatus(`배포된 수집 데이터 ${dataDraftItems.length}건을 불러왔습니다. 저장하려면 GitHub classic token이 필요합니다.`, "success");
}

async function dispatchWorkflow(owner, repo, branch, inputs) {
  const startedAt = Date.now();
  await githubRequest(`/repos/${owner}/${repo}/actions/workflows/update-and-deploy.yml/dispatches`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ ref: branch, inputs })
  });
  return startedAt;
}

async function runManualCollection() {
  const { owner, repo } = getRepoInfo();
  const branch = elements.githubBranchInput.value.trim() || "main";
  if (!owner || !repo) throw new Error("GitHub Pages URL에서 접속해야 수동 수집을 실행할 수 있습니다.");

  setDataStatus("수동 수집을 요청하는 중입니다. 저장된 수집 소스 기준으로 크롤링합니다.", "muted");
  const startedAt = await dispatchWorkflow(owner, repo, branch, { skip_collect: "false" });
  setDataStatus("수동 수집을 시작했습니다. 삭제했던 데이터는 조건에 맞으면 복구되며, AI 결과가 없는 항목만 AI 처리합니다.", "muted");
  await pollWorkflowRun(owner, repo, branch, startedAt, {
    onUpdate: (message, tone) => setDataStatus(message, tone),
    successMessage: (run) => `수동 수집 완료. 최신 데이터를 다시 불러오는 중입니다. 실행 #${run.run_number}`,
    onSuccess: async (run) => {
      await loadDataConfig();
      setDataStatus(`수동 수집 완료. 저장된 수집 소스 기준으로 데이터를 다시 크롤링했습니다. AI 결과가 없는 항목만 AI 처리했습니다. 실행 #${run.run_number}`, "success");
    }
  });
}

function workflowStatusText(run) {
  if (run.status === "queued") return "대기 중";
  if (run.status === "in_progress") return "실행 중";
  if (run.status === "completed" && run.conclusion === "success") return "완료";
  if (run.status === "completed") return `종료: ${run.conclusion || "unknown"}`;
  return run.status || "확인 중";
}

async function pollWorkflowRun(owner, repo, branch, startedAt, options = {}) {
  const onUpdate = options.onUpdate || setDataStatus;
  await wait(2500);
  let targetRun = null;

  for (let attempt = 1; attempt <= 90; attempt += 1) {
    const query = new URLSearchParams({
      branch,
      event: "workflow_dispatch",
      per_page: "5"
    });
    const data = await githubRequest(`/repos/${owner}/${repo}/actions/workflows/update-and-deploy.yml/runs?${query.toString()}`);
    const candidateRuns = (data.workflow_runs || []).filter((run) => new Date(run.created_at).getTime() >= startedAt - 10000);
    targetRun = targetRun || candidateRuns[0];
    if (!targetRun) {
      onUpdate(`Actions 실행을 찾는 중입니다. (${attempt}/90)`, "muted");
      await wait(4000);
      continue;
    }

    const freshRun = data.workflow_runs?.find((run) => run.id === targetRun.id) || targetRun;
    const text = workflowStatusText(freshRun);
    onUpdate(`Actions ${text}. 실행 #${freshRun.run_number} 확인 중입니다.`, freshRun.conclusion === "failure" ? "error" : "muted");

    if (freshRun.status === "completed") {
      if (freshRun.conclusion === "success") {
        const message = typeof options.successMessage === "function"
          ? options.successMessage(freshRun)
          : `Actions 완료. 실행 #${freshRun.run_number}`;
        onUpdate(message, "success");
        if (options.onSuccess) await options.onSuccess(freshRun);
        return;
      }
      throw new Error(`Actions 실행이 ${freshRun.conclusion || "실패"} 상태로 종료되었습니다. Actions 탭에서 실행 #${freshRun.run_number} 로그를 확인하세요.`);
    }

    await wait(5000);
  }

  onUpdate("Actions가 아직 완료되지 않았습니다. Actions 탭에서 진행 상태를 확인하세요.", "muted");
}

function buildDataPayload() {
  const sources = currentPayload?.sources?.length ? currentPayload.sources : sourceDrafts;
  return {
    collectedAt: new Date().toISOString(),
    mode: "manual-test-data",
    aiEnabled: false,
    openAiModel: null,
    count: dataDraftItems.length,
    sources,
    staleCache: false,
    previousCollectedAt: currentPayload?.collectedAt || null,
    errors: [{ source: "manual", message: "Data was manually edited for LLM/UI testing." }],
    items: dataDraftItems.map(normalizeDataItem)
  };
}

async function applyDataConfig() {
  const { owner, repo } = getRepoInfo();
  const branch = elements.githubBranchInput.value.trim() || "main";
  if (!owner || !repo) throw new Error("GitHub Pages URL에서 접속해야 데이터를 저장/배포할 수 있습니다.");

  setDataStatus("GitHub에 현재 데이터 목록을 저장하는 중입니다. 이 기능은 LLM/UI 테스트용입니다.", "muted");

  const latest = await githubRequest(`/repos/${owner}/${repo}/contents/public/data/mdcg-cache.json?ref=${encodeURIComponent(branch)}&ts=${Date.now()}`);
  const sha = latest.sha;

  const saved = await githubRequest(`/repos/${owner}/${repo}/contents/public/data/mdcg-cache.json`, {
    method: "PUT",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      message: "Update test regulatory data cache",
      content: toBase64(`${JSON.stringify(buildDataPayload(), null, 2)}\n`),
      sha,
      branch
    })
  });
  elements.managedDataList.dataset.sha = saved.content?.sha || sha;

  setDataStatus("데이터 저장 완료. RSS 재수집 없이 현재 목록 그대로 Pages 배포를 요청합니다.", "muted");
  const startedAt = await dispatchWorkflow(owner, repo, branch, { skip_collect: "true" });
  await pollWorkflowRun(owner, repo, branch, startedAt, {
    onUpdate: (message, tone) => setDataStatus(message, tone),
    successMessage: (run) => `데이터만 저장/배포 완료. 현재 목록 그대로 배포했습니다. 수집 실행 또는 매일 오전 7시(KST) 자동 갱신 시 삭제 데이터는 다시 복구될 수 있습니다. 실행 #${run.run_number}`
  });
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
    sourceDrafts = validateSources(await response.json());
    renderManagedSources();
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
    elements.managedSourceList.dataset.sha = data.sha;
    sourceDrafts = validateSources(JSON.parse(fromBase64(data.content)));
    renderManagedSources();
    setApplyStatus("GitHub 저장소의 최신 config/sources.json을 불러왔습니다.", "success");
  } catch (error) {
    await loadPublishedConfig(`GitHub API 불러오기는 실패했지만 배포된 설정을 표시했습니다. ${error.message}`);
  }
}

async function loadPublishedSourcesForFilters() {
  if (sourceDrafts.length) return;
  try {
    const response = await fetch("./config/sources.json", { cache: "no-store" });
    if (!response.ok) return;
    sourceDrafts = validateSources(await response.json());
  } catch (error) {
    console.warn("Source filter config was not loaded.", error);
  }
}

async function applySourcesConfig() {
  const { owner, repo } = getRepoInfo();
  const branch = elements.githubBranchInput.value.trim() || "main";
  const sources = validateSources(sourceDrafts);

  if (!owner || !repo) {
    throw new Error("GitHub Pages URL에서 접속해야 저장소에 바로 적용할 수 있습니다.");
  }

  setApplyStatus("GitHub에 설정을 저장하는 중입니다. 잠시만 기다려 주세요.", "muted");
  let sha = elements.managedSourceList.dataset.sha;
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

  setApplyStatus("설정 저장 완료. GitHub Actions 수집을 요청하는 중입니다.", "muted");
  const startedAt = await dispatchWorkflow(owner, repo, branch, { skip_collect: "false" });
  await pollWorkflowRun(owner, repo, branch, startedAt, {
    onUpdate: (message, tone) => setApplyStatus(message, tone),
    successMessage: (run) => `저장 후 수집 실행 완료. 저장된 수집 소스 기준으로 데이터를 갱신했고, AI 결과가 없는 항목만 AI 처리했습니다. 사이트를 새로고침하세요. 실행 #${run.run_number}`
  });
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
    const cacheSafeEndpoint = isLocalServer ? endpoint : `${endpoint}?v=${Date.now()}`;
    const response = await fetch(cacheSafeEndpoint, { cache: "no-store" });
    if (!response.ok) throw new Error("feed unavailable");
    const payload = await response.json();
    currentPayload = payload;
    allItems = payload.items || [];
    await loadPublishedSourcesForFilters();
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
    await loadPublishedSourcesForFilters();
    renderDynamicFilters();
  }
  renderList();
}

function openSettings() {
  elements.settingsModal.classList.add("open");
  elements.settingsModal.setAttribute("aria-hidden", "false");
  if (!sourceDrafts.length) {
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
elements.sourceUrlInput.addEventListener("input", () => updateSourceKindPreview());
document.querySelector("#loadSourcesButton").addEventListener("click", () => {
  loadSourcesConfig().catch((error) => setApplyStatus(error.message, "error"));
});
document.querySelector("#newSourceButton").addEventListener("click", newSourceForm);
document.querySelector("#clearSourceFormButton").addEventListener("click", () => {
  clearSourceForm();
  setApplyStatus("소스 입력을 취소했습니다.", "muted");
});
document.querySelector("#saveSourceFormButton").addEventListener("click", () => {
  try {
    saveSourceForm();
  } catch (error) {
    setApplyStatus(error.message, "error");
  }
});
document.querySelector("#applySourcesButton").addEventListener("click", () => {
  applySourcesConfig().catch((error) => setApplyStatus(error.message, "error"));
});
document.querySelector("#loadDataButton").addEventListener("click", () => {
  loadDataConfig().catch((error) => setDataStatus(error.message, "error"));
});
document.querySelector("#runCollectButton").addEventListener("click", () => {
  runManualCollection().catch((error) => setDataStatus(error.message, "error"));
});
document.querySelector("#clearDataButton").addEventListener("click", () => {
  dataDraftItems = [];
  renderManagedData();
  setDataStatus("수집 데이터 목록을 비웠습니다. 배포하려면 데이터만 저장/배포를 누르세요.", "success");
});
document.querySelector("#applyDataButton").addEventListener("click", () => {
  applyDataConfig().catch((error) => setDataStatus(error.message, "error"));
});

elements.managedSourceList.addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-source-edit]");
  const deleteButton = event.target.closest("[data-source-delete]");
  if (editButton) {
    fillSourceForm(sourceDrafts[Number(editButton.dataset.sourceEdit)], Number(editButton.dataset.sourceEdit));
    setApplyStatus("선택한 소스를 편집 중입니다.", "muted");
  }
  if (deleteButton) {
    sourceDrafts.splice(Number(deleteButton.dataset.sourceDelete), 1);
    renderManagedSources();
    setApplyStatus("소스를 삭제했습니다. GitHub에 적용하려면 저장 후 수집 실행을 누르세요.", "success");
  }
});

elements.managedSourceList.addEventListener("change", (event) => {
  const toggle = event.target.closest("[data-source-toggle]");
  if (!toggle) return;
  sourceDrafts[Number(toggle.dataset.sourceToggle)].enabled = toggle.checked;
  renderManagedSources();
  setApplyStatus("소스 활성 상태를 변경했습니다. GitHub에 적용하려면 저장 후 수집 실행을 누르세요.", "success");
});

elements.managedDataList.addEventListener("click", (event) => {
  const previewButton = event.target.closest("[data-data-preview]");
  const deleteButton = event.target.closest("[data-data-delete]");
  if (previewButton) {
    const item = dataDraftItems[Number(previewButton.dataset.dataPreview)];
    if (item) renderDetail(item);
  }
  if (deleteButton) {
    dataDraftItems.splice(Number(deleteButton.dataset.dataDelete), 1);
    renderManagedData();
    setDataStatus("선택한 데이터를 삭제했습니다. 배포하려면 데이터만 저장/배포를 누르세요.", "success");
  }
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


