const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.join(__dirname, "..");
const SOURCES_PATH = path.join(ROOT_DIR, "config", "sources.json");
const OUTPUT = path.join(ROOT_DIR, "public", "data", "mdcg-cache.json");
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const USE_AI = Boolean(OPENAI_API_KEY);

function stripTags(value = "") {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
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
  const match = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  if (!match) return "";
  return decodeEntities(match[1].replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim());
}

function normalizeDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function inferType(title, sourceType) {
  const text = title.toLowerCase();
  if (/recall|field safety|safety alert|hazard|medwatch|market action/.test(text)) return sourceType || "Safety Alert";
  if (/mdcg|guidance|q&a|manual|classification/.test(text)) return title.toLowerCase().includes("mdcg") ? "MDCG Guidance" : "Guidance";
  if (/regulation|decision|implementing|delegated/.test(text)) return "Regulation";
  return sourceType || "Update";
}

function classifySeverity(title, summary, sourceType) {
  const text = `${title} ${summary} ${sourceType}`.toLowerCase();
  if (/(class i recall|death|serious injury|incident|mir|vigilance|urgent|recall|field safety|hazard|shortage|discontinuation|interruption)/.test(text)) {
    return "high";
  }
  if (/(regulation|implementing|classification|borderline|mdcg|guidance|q&a|manual|advisory|market action)/.test(text)) {
    return "medium";
  }
  return "low";
}

function defaultSummary(item) {
  const text = `${item.title}. ${item.rawSummary}`.toLowerCase();
  if (/recall|field safety|safety alert|hazard|medwatch/.test(text)) {
    return `${item.source}의 안전성 또는 회수 관련 업데이트입니다. 제품 식별, 영향 범위, 고객 통지 및 시정조치 필요성을 우선 확인하세요.`;
  }
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
  return `${item.source}의 의료기기 규제 업데이트입니다. 자사 제품군과 업무 프로세스에 직접 적용되는 요구사항이 있는지 확인하세요.`;
}

function defaultAction(item) {
  const text = `${item.title} ${item.rawSummary}`.toLowerCase();
  if (item.severity === "high") {
    return "즉시 영향 평가를 열고 제품 식별, 고객 통지, 시정조치, SOP 및 책임자별 액션 항목을 확인하세요.";
  }
  if (/regulation|implementing|decision/.test(text)) {
    return "법규 원문과 적용일을 확인한 뒤 인증기관 커뮤니케이션, 기술문서 목차, 제품군별 갭 분석표를 업데이트하세요.";
  }
  if (/guidance|mdcg|manual|q&a/.test(text)) {
    return "기존 내부 해석과 차이가 있는 항목을 표시하고, 다음 RA 정기회의 안건으로 올려 적용 범위와 우선순위를 결정하세요.";
  }
  return "내용을 검토하고 자사 제품, 공급망, 등록 상태에 영향을 주는지 1차 스크리닝하세요.";
}

function impactPoints(item) {
  const base = [
    "자사 IVD 또는 의료기기 제품군에 직접 적용되는 범위인지 확인",
    "기술문서, PMS/PMCF, vigilance 또는 QMS 절차서 변경 필요성 검토",
    "인증기관, 수입자, 대리인과 공유해야 하는 변경사항 선별"
  ];
  if (/recall|safety|hazard|field safety/i.test(`${item.title} ${item.type}`)) {
    return [
      "영향 제품, 로트, UDI, 고객 출하 이력과 매칭",
      "고객 통지, 회수, FSCA 또는 보고 의무 발생 여부 검토",
      "CAPA 및 변경관리 착수 필요성 확인"
    ];
  }
  return base;
}

function matchesKeywords(item, source) {
  const keywords = source.keywords || [];
  if (!keywords.length) return true;
  const text = `${item.title} ${item.rawSummary}`.toLowerCase();
  return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
}

function parseFeed(xml, source) {
  const blocks = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((match) => match[0]);
  const atomBlocks = blocks.length ? [] : [...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map((match) => match[0]);

  return [...blocks, ...atomBlocks].map((block, index) => {
    const atomLink = block.match(/<link[^>]+href="([^"]+)"/i)?.[1] || "";
    const title = stripTags(readTag(block, "title") || "Untitled update");
    const rawSummary = stripTags(readTag(block, "description") || readTag(block, "summary") || readTag(block, "content"));
    const link = readTag(block, "link") || decodeEntities(atomLink) || source.url;
    const date = normalizeDate(readTag(block, "pubDate") || readTag(block, "updated") || readTag(block, "published") || readTag(block, "dc:date"));
    const type = inferType(title, source.type);
    const severity = classifySeverity(title, rawSummary, type);

    const item = {
      id: `${source.id}:${readTag(block, "guid") || link || `${date}-${index}-${title}`}`,
      title,
      source: source.source,
      authority: source.authority,
      region: source.region,
      country: source.country,
      type,
      date,
      link,
      summary: "",
      rawSummary,
      severity,
      read: false,
      action: "",
      impactPoints: [],
      analysisMode: "rules"
    };

    item.summary = defaultSummary(item);
    item.action = defaultAction(item);
    item.impactPoints = impactPoints(item);
    return item;
  });
}

function parseOpenFdaDeviceRecalls(data, source) {
  return (data.results || []).map((entry, index) => {
    const title = stripTags(entry.product_description || entry.reason_for_recall || entry.recalling_firm || "FDA device recall");
    const rawSummary = stripTags([
      entry.reason_for_recall,
      entry.recalling_firm ? `Firm: ${entry.recalling_firm}` : "",
      entry.product_code ? `Product code: ${entry.product_code}` : "",
      entry.code_info ? `Code info: ${entry.code_info}` : ""
    ].filter(Boolean).join(" | "));
    const date = normalizeDate(entry.event_date_initiated || entry.report_date || entry.recall_initiation_date);
    const type = inferType(title, source.type);
    const severity = classifySeverity(title, rawSummary, type);
    const link = "https://www.fda.gov/medical-devices/medical-device-recalls";

    const item = {
      id: `${source.id}:${entry.res_event_number || entry.recall_number || `${date}-${index}-${title}`}`,
      title,
      source: source.source,
      authority: source.authority,
      region: source.region,
      country: source.country,
      type,
      date,
      link,
      summary: "",
      rawSummary,
      severity,
      read: false,
      action: "",
      impactPoints: [],
      analysisMode: "rules"
    };

    item.summary = defaultSummary(item);
    item.action = defaultAction(item);
    item.impactPoints = impactPoints(item);
    return item;
  });
}

async function fetchFeed(source) {
  const response = await fetch(source.url, {
    headers: {
      "user-agent": "IVD-RegWatch-GitHub-Actions/2.0",
      accept: "application/rss+xml, application/atom+xml, application/xml, text/xml"
    }
  });

  if (!response.ok) {
    throw new Error(`${source.id} failed: ${response.status} ${response.statusText}`);
  }

  if (source.kind === "openfda-device-recall") {
    const data = await response.json();
    return parseOpenFdaDeviceRecalls(data, source).slice(0, source.limit || 20);
  }

  const xml = await response.text();
  return parseFeed(xml, source)
    .filter((item) => matchesKeywords(item, source))
    .slice(0, source.limit || 20);
}

function parseAiJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

async function enrichWithAi(item) {
  if (!USE_AI) return item;

  const prompt = [
    "You are a regulatory affairs analyst for medical devices and IVDs.",
    "Return only compact JSON with keys: summaryKo, raActionKo, severity, impactPointsKo.",
    "severity must be one of high, medium, low. impactPointsKo must be an array of 3 short Korean bullets.",
    `Authority: ${item.authority}`,
    `Region: ${item.region}`,
    `Type: ${item.type}`,
    `Title: ${item.title}`,
    `Description: ${item.rawSummary || "(none)"}`,
    `Link: ${item.link}`
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${OPENAI_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: prompt,
      temperature: 0.2
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI API failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  const outputText = data.output_text || data.output?.flatMap((entry) => entry.content || []).map((part) => part.text || "").join("\n") || "";
  const parsed = parseAiJson(outputText);
  if (!parsed) return item;

  return {
    ...item,
    summary: parsed.summaryKo || item.summary,
    action: parsed.raActionKo || item.action,
    severity: ["high", "medium", "low"].includes(parsed.severity) ? parsed.severity : item.severity,
    impactPoints: Array.isArray(parsed.impactPointsKo) && parsed.impactPointsKo.length ? parsed.impactPointsKo.slice(0, 3) : item.impactPoints,
    analysisMode: "ai"
  };
}

async function main() {
  const sources = JSON.parse(fs.readFileSync(SOURCES_PATH, "utf8")).filter((source) => source.enabled !== false);
  const results = [];
  const errors = [];

  for (const source of sources) {
    try {
      const items = await fetchFeed(source);
      results.push(...items);
      console.log(`Collected ${items.length} items from ${source.id}.`);
    } catch (error) {
      errors.push({ source: source.id, message: error.message });
      console.error(error.message);
    }
  }

  const uniqueItems = [...new Map(results.map((item) => [item.id, item])).values()]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 80);

  const enriched = [];
  for (const item of uniqueItems) {
    try {
      enriched.push(await enrichWithAi(item));
    } catch (error) {
      errors.push({ source: item.source, message: error.message });
      enriched.push(item);
    }
  }

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(
    OUTPUT,
    JSON.stringify(
      {
        collectedAt: new Date().toISOString(),
        mode: USE_AI ? "github-actions-rss-ai" : "github-actions-rss-rules",
        aiEnabled: USE_AI,
        openAiModel: USE_AI ? OPENAI_MODEL : null,
        count: enriched.length,
        sources: sources.map(({ id, source, authority, region, country, type, url, enabled }) => ({
          id,
          source,
          authority,
          region,
          country,
          type,
          url,
          enabled
        })),
        errors,
        items: enriched
      },
      null,
      2
    ),
    "utf8"
  );

  console.log(`Wrote ${enriched.length} total regulatory updates.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
