const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 4173);
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");
const CACHE_PATH = path.join(DATA_DIR, "mdcg-cache.json");
const CACHE_ENABLED = process.env.REGWATCH_CACHE === "1";
const RSS_URL =
  process.env.MDCG_RSS_URL ||
  "https://health.ec.europa.eu/node/12916/rss_en";
const FALLBACK_PAGE =
  "https://health.ec.europa.eu/medical-devices-sector/latest-updates_en";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon"
};

function stripTags(value = "") {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(value = "") {
  const entities = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " "
  };

  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, code) => {
    if (code[0] === "#") {
      const isHex = code[1]?.toLowerCase() === "x";
      return String.fromCharCode(parseInt(code.slice(isHex ? 2 : 1), isHex ? 16 : 10));
    }
    return entities[code.toLowerCase()] || `&${code};`;
  });
}

function readTag(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  if (!match) return "";
  return decodeEntities(match[1].replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim());
}

function normalizeDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function classifySeverity(title, summary) {
  const text = `${title} ${summary}`.toLowerCase();
  if (/(incident|mir|vigilance|urgent|recall|field safety notice|shortage|discontinuation|interruption)/.test(text)) {
    return "high";
  }
  if (/(regulation|implementing|classification|borderline|mdcg|guidance|q&a|manual)/.test(text)) {
    return "medium";
  }
  return "low";
}

function buildKoreanSummary(title, summary) {
  const text = `${title}. ${summary}`.toLowerCase();
  if (text.includes("mir") || text.includes("incident")) {
    return "제조사 사고 보고, MIR 양식 또는 감시체계 운영과 관련된 업데이트입니다. RA/QA 담당자는 적용일, 제출 양식, 내부 보고 절차 변경 여부를 우선 확인해야 합니다.";
  }
  if (text.includes("conformity assessment") || text.includes("notified bodies")) {
    return "적합성 평가와 인증기관 요구사항에 영향을 줄 수 있는 업데이트입니다. 인증 전략, 기술문서, 심사 대응 자료에 반영할 변경점이 있는지 검토가 필요합니다.";
  }
  if (text.includes("classification") || text.includes("borderline")) {
    return "제품 분류 또는 경계 제품 판단에 영향을 줄 수 있는 문서입니다. 제품군별 분류 근거와 기존 기술문서의 규정 인용이 최신인지 확인하세요.";
  }
  if (text.includes("emdn")) {
    return "유럽 의료기기 명명체계(EMDN) 관련 업데이트입니다. 제품 등록, UDI/EUDAMED 입력값, 내부 품목 마스터 데이터와의 정합성을 점검하세요.";
  }
  if (text.includes("mdcg") || text.includes("guidance")) {
    return "MDCG 지침 또는 의료기기 규제 해석에 관한 업데이트입니다. 적용 범위를 확인하고 기술문서, PMS, 임상평가 또는 품질시스템 절차서 반영 필요성을 검토하세요.";
  }
  return "EU 의료기기 규제 환경의 최신 공지입니다. 자사 제품군과 업무 프로세스에 직접 적용되는 요구사항이 있는지 확인하세요.";
}

function buildAction(title, summary, severity) {
  const text = `${title} ${summary}`.toLowerCase();
  if (severity === "high") {
    return "즉시 영향 평가를 열고 관련 SOP, 제출 양식, 책임자별 액션 항목을 확인하세요. 적용일이 명시된 경우 변경관리 티켓을 생성하는 것을 권장합니다.";
  }
  if (text.includes("regulation") || text.includes("implementing")) {
    return "법규 원문과 부속서를 확인한 뒤 인증기관 커뮤니케이션, 기술문서 목차, 제품군별 갭 분석표를 업데이트하세요.";
  }
  if (text.includes("guidance") || text.includes("mdcg")) {
    return "기존 내부 해석과 차이가 있는 항목을 표시하고, 다음 RA 정기회의 안건으로 올려 적용 범위와 우선순위를 결정하세요.";
  }
  return "내용을 검토하고 자사 제품, 공급망, 등록 상태에 영향을 주는지 1차 스크리닝하세요.";
}

function toItem(raw, index) {
  const title = stripTags(raw.title || "Untitled update");
  const summary = stripTags(raw.description || raw.summary || "");
  const date = normalizeDate(raw.pubDate || raw.date || raw.updated);
  const severity = classifySeverity(title, summary);
  return {
    id: raw.guid || raw.link || `${date}-${index}-${title}`,
    title,
    source: "MDCG",
    region: "EU",
    type: title.toLowerCase().includes("mdcg") ? "MDCG Guidance" : "Guidance",
    date,
    link: raw.link || FALLBACK_PAGE,
    summary: buildKoreanSummary(title, summary),
    rawSummary: summary,
    severity,
    read: false,
    action: buildAction(title, summary, severity),
    impactPoints: [
      "자사 IVD 또는 의료기기 제품군에 직접 적용되는 범위인지 확인",
      "기술문서, PMS/PMCF, vigilance 또는 QMS 절차서 변경 필요성 검토",
      "인증기관, 수입자, 대리인과 공유해야 하는 변경사항 선별"
    ]
  };
}

function parseRss(xml) {
  const itemMatches = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)];
  return itemMatches.map((match, index) =>
    toItem(
      {
        title: readTag(match[0], "title"),
        link: readTag(match[0], "link"),
        guid: readTag(match[0], "guid"),
        description: readTag(match[0], "description"),
        pubDate: readTag(match[0], "pubDate")
      },
      index
    )
  );
}

function parseLatestUpdatesPage(html) {
  const rows = [];
  const pattern =
    /News announcement[\s\S]*?\*\s*([0-9]{1,2}\s+[A-Za-z]+\s+[0-9]{4})[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(pattern)) {
    const link = new URL(decodeEntities(match[2]), FALLBACK_PAGE).href;
    rows.push(
      toItem(
        {
          title: decodeEntities(stripTags(match[3])),
          link,
          date: match[1],
          description: ""
        },
        rows.length
      )
    );
  }
  return rows;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "IVD-RegWatch/1.0 (+local monitoring dashboard)",
      accept: "application/rss+xml, application/xml, text/xml, text/html;q=0.9"
    }
  });
  if (!response.ok) {
    throw new Error(`Fetch failed ${response.status} ${response.statusText}`);
  }
  return response.text();
}

async function collectMdcgUpdates() {
  let items = [];
  let mode = "rss";
  let error = null;

  try {
    const rss = await fetchText(RSS_URL);
    items = parseRss(rss);
    if (!items.length) throw new Error("RSS feed returned no items");
  } catch (rssError) {
    error = rssError.message;
    mode = "html-fallback";
    const html = await fetchText(FALLBACK_PAGE);
    items = parseLatestUpdatesPage(html);
  }

  const filtered = items
    .filter((item) => /mdcg|medical device|ivd|mir|emdn|notified bod|regulation|guidance/i.test(`${item.title} ${item.rawSummary}`))
    .slice(0, 30);

  const payload = {
    collectedAt: new Date().toISOString(),
    source: mode === "rss" ? RSS_URL : FALLBACK_PAGE,
    mode,
    rssError: error,
    count: filtered.length,
    items: filtered
  };

  if (CACHE_ENABLED) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(CACHE_PATH, JSON.stringify(payload, null, 2), "utf8");
  } else {
    payload.cacheDisabled = true;
  }

  return payload;
}

function sendJson(res, status, data) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, requestedPath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "content-type": mimeTypes[path.extname(filePath)] || "application/octet-stream" });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/api/rss") {
    try {
      sendJson(res, 200, await collectMdcgUpdates());
    } catch (error) {
      sendJson(res, 502, {
        error: "MDCG 업데이트를 수집하지 못했습니다.",
        detail: error.message
      });
    }
    return;
  }

  if (url.pathname === "/api/cache") {
    if (!CACHE_ENABLED) {
      sendJson(res, 404, { error: "로컬 캐시 저장이 비활성화되어 있습니다." });
      return;
    }
    try {
      const cache = fs.readFileSync(CACHE_PATH, "utf8");
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(cache);
    } catch {
      sendJson(res, 404, { error: "저장된 수집 캐시가 없습니다." });
    }
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`IVD RegWatch running at http://localhost:${PORT}`);
  console.log(`MDCG source: ${RSS_URL}`);
});
