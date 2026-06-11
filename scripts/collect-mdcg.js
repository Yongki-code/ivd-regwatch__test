const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.join(__dirname, "..");
const SOURCES_PATH = path.join(ROOT_DIR, "config", "sources.json");
const OUTPUT = path.join(ROOT_DIR, "public", "data", "mdcg-cache.json");
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const REQUESTED_AI_PROVIDER = (process.env.AI_PROVIDER || (ANTHROPIC_API_KEY ? "claude" : "openai")).toLowerCase();
const AI_PROVIDER = REQUESTED_AI_PROVIDER === "claude" ? "claude" : "openai";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.5";
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-5";
const ACTIVE_AI_MODEL = AI_PROVIDER === "claude" ? CLAUDE_MODEL : OPENAI_MODEL;
const ACTIVE_AI_KEY = AI_PROVIDER === "claude" ? ANTHROPIC_API_KEY : OPENAI_API_KEY;
const USE_AI = Boolean(ACTIVE_AI_KEY);
const AI_ENRICH_LIMIT = Number(process.env.AI_ENRICH_LIMIT || 12);
const MAX_AI_SOURCE_CHARS = Number(process.env.MAX_AI_SOURCE_CHARS || 6000);
const MIN_RICH_SUMMARY_CHARS = Number(process.env.MIN_RICH_SUMMARY_CHARS || 260);
const MAX_TOTAL_ITEMS = Number(process.env.MAX_TOTAL_ITEMS || 500);

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

function truncateForPrompt(value = "", limit = MAX_AI_SOURCE_CHARS) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit)} ... [truncated]` : text;
}

async function fetchArticleText(url) {
  if (!url || !/^https?:\/\//i.test(url)) return "";
  const response = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    headers: {
      "user-agent": "IVD-RegWatch-GitHub-Actions/2.0",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    }
  });
  if (!response.ok) return "";
  const contentType = response.headers.get("content-type") || "";
  if (!/html|xml|text/i.test(contentType)) return "";
  const html = await response.text();
  return truncateForPrompt(stripTags(decodeEntities(html)));
}

function normalizeDate(value, fallback = "") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toISOString().slice(0, 10);
}

function extractDateFromText(value = "") {
  const text = String(value || "");
  const isoMatch = text.match(/\b(20\d{2})[-_/](0?[1-9]|1[0-2])[-_/](0?[1-9]|[12]\d|3[01])\b/);
  if (isoMatch) {
    return normalizeDate(`${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}-${isoMatch[3].padStart(2, "0")}`);
  }

  const compactMatch = text.match(/\b(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\b/);
  if (compactMatch) {
    return normalizeDate(`${compactMatch[1]}-${compactMatch[2]}-${compactMatch[3]}`);
  }

  const monthNameMatch = text.match(/\b([0-9]{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+20\d{2})\b/i);
  return monthNameMatch ? normalizeDate(monthNameMatch[1]) : "";
}

function resolveItemDate(...candidates) {
  for (const candidate of candidates) {
    const direct = normalizeDate(candidate);
    if (direct) return direct;
    const extracted = extractDateFromText(candidate);
    if (extracted) return extracted;
  }
  return "";
}

function readHtmlHeading(html) {
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  return decodeEntities(stripTags(h1 || title || "")).replace(/\s+\|\s+.*$/, "").trim();
}

function inferHtmlDate(text) {
  const match = text.match(/(?:published|last updated)\s+([0-9]{1,2}\s+[a-z]+\s+[0-9]{4})/i);
  return resolveItemDate(match?.[1], text);
}

function inferSourceKind(url = "") {
  const value = url.trim().toLowerCase();
  if (/api\.fda\.gov\/device\/recall/.test(value)) return "openfda-device-recall";
  if (/\.(rss|xml|atom)(\?|#|$)/.test(value)) return "rss";
  if (/\/(rss|feed|feeds)(\/|\?|#|$)/.test(value)) return "rss";
  if (value.includes("rss") || value.includes("atom")) return "rss";
  return "html-page";
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
  if (/(class i recall|death|serious injury|serious risk|life-threatening|urgent|immediate|critical|field safety|hazard|recall|shortage|discontinuation|interruption)/.test(text)) {
    return "high";
  }
  if (/(effective from|applies from|application date|transition period|deadline|within 6 months|incident|mir|vigilance)/.test(text)) {
    return "high";
  }
  if (/(ivd|in vitro|regulation|implementing|classification|borderline|mdcg|guidance|q&a|manual|conformity assessment|notified bod|technical documentation|performance evaluation|market action)/.test(text)) {
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
    const date = resolveItemDate(
      readTag(block, "pubDate"),
      readTag(block, "updated"),
      readTag(block, "published"),
      readTag(block, "dc:date"),
      link,
      title,
      rawSummary
    );
    const type = inferType(title, source.type);
    const severity = classifySeverity(title, rawSummary, type);

    const item = {
      id: `${source.id}:${readTag(block, "guid") || link || `${date || "undated"}-${index}-${title}`}`,
      title,
      sourceId: source.id,
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
    const date = resolveItemDate(entry.event_date_initiated, entry.report_date, entry.recall_initiation_date, title, rawSummary);
    const type = inferType(title, source.type);
    const severity = classifySeverity(title, rawSummary, type);
    const link = "https://www.fda.gov/medical-devices/medical-device-recalls";

    const item = {
      id: `${source.id}:${entry.res_event_number || entry.recall_number || `${date || "undated"}-${index}-${title}`}`,
      title,
      sourceId: source.id,
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

function parseHtmlPage(html, source) {
  const links = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  const seen = new Set();
  const pageTitle = readHtmlHeading(html) || source.source || "Regulatory update";
  const pageText = stripTags(decodeEntities(html));
  const pageDate = inferHtmlDate(pageText);

  const linkItems = links
    .map((match, index) => {
      const href = decodeEntities(match[1]);
      const title = stripTags(match[2]);
      if (!title || title.length < 8) return null;

      const link = new URL(href, source.url).href;
      const key = `${title}|${link}`;
      if (seen.has(key)) return null;
      seen.add(key);

      const type = inferType(title, source.type);
      const severity = classifySeverity(title, "", type);
      const date = resolveItemDate(link, title, pageDate);
      const item = {
        id: `${source.id}:${link || `${index}-${title}`}`,
        title,
        sourceId: source.id,
        source: source.source,
        authority: source.authority,
        region: source.region,
        country: source.country,
        type,
        date,
        link,
        summary: "",
        rawSummary: "",
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
    })
    .filter(Boolean);

  const matchedLinks = linkItems.filter((item) => matchesKeywords(item, source));
  if (matchedLinks.length) return matchedLinks;

  const type = inferType(pageTitle, source.type);
  const rawSummary = pageText.slice(0, 700);
  const severity = classifySeverity(pageTitle, rawSummary, type);
  const pageItem = {
    id: `${source.id}:${source.url}`,
    title: pageTitle,
    sourceId: source.id,
    source: source.source,
    authority: source.authority,
    region: source.region,
    country: source.country,
    type,
    date: resolveItemDate(pageDate, source.url, pageTitle, pageText),
    link: source.url,
    summary: "",
    rawSummary,
    severity,
    read: false,
    action: "",
    impactPoints: [],
    analysisMode: "rules"
  };

  pageItem.summary = defaultSummary(pageItem);
  pageItem.action = defaultAction(pageItem);
  pageItem.impactPoints = impactPoints(pageItem);
  return matchesKeywords(pageItem, source) ? [pageItem] : [];
}

async function fetchFeed(source) {
  const kind = inferSourceKind(source.url);
  const response = await fetch(source.url, {
    headers: {
      "user-agent": "IVD-RegWatch-GitHub-Actions/2.0",
      accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html"
    }
  });

  if (!response.ok) {
    throw new Error(`${source.id} failed: ${response.status} ${response.statusText}`);
  }

  if (kind === "openfda-device-recall") {
    const data = await response.json();
    return parseOpenFdaDeviceRecalls(data, source).slice(0, source.limit || 20);
  }

  const xml = await response.text();
  if (kind === "html-page") {
    return parseHtmlPage(xml, source).slice(0, source.limit || 20);
  }

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

function isThinAiOutput(parsed, sourceText) {
  if (!parsed || sourceText.length < 500) return false;
  const summaryLength = String(parsed.summaryKo || "").replace(/\s/g, "").length;
  const actionLength = String(parsed.raActionKo || "").replace(/\s/g, "").length;
  const impactLength = Array.isArray(parsed.impactPointsKo) ? parsed.impactPointsKo.join("").replace(/\s/g, "").length : 0;
  return summaryLength < MIN_RICH_SUMMARY_CHARS || actionLength < 120 || impactLength < 120;
}

async function requestOpenAiAnalysis(systemPrompt, userPrompt, retryNote = "") {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${OPENAI_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: [
        { role: "developer", content: systemPrompt },
        { role: "user", content: retryNote ? `${userPrompt}\n\n${retryNote}` : userPrompt }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "regulatory_update_analysis",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              summaryKo: {
                type: "string",
                description: "Korean regulatory summary. Use 350-500 Korean characters when source_text has enough evidence."
              },
              raActionKo: {
                type: "string",
                description: "Concrete Korean RA action for an IVD manufacturer. Use 180-300 Korean characters when applicable."
              },
              severity: {
                type: "string",
                enum: ["high", "medium", "low"]
              },
              impactPointsKo: {
                type: "array",
                minItems: 3,
                maxItems: 3,
                items: {
                  type: "string"
                }
              }
            },
            required: ["summaryKo", "raActionKo", "severity", "impactPointsKo"]
          }
        }
      }
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI API failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  const outputText = data.output_text || data.output?.flatMap((entry) => entry.content || []).map((part) => part.text || "").join("\n") || "";
  return parseAiJson(outputText);
}

async function requestClaudeAnalysis(systemPrompt, userPrompt, retryNote = "") {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 1400,
      system: [
        systemPrompt,
        "Return only one valid JSON object with exactly these keys: summaryKo, raActionKo, severity, impactPointsKo.",
        "severity must be one of high, medium, low. impactPointsKo must be an array of exactly 3 Korean strings."
      ].join("\n"),
      messages: [
        {
          role: "user",
          content: retryNote ? `${userPrompt}\n\n${retryNote}` : userPrompt
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`Claude API failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  const outputText = (data.content || []).map((part) => part.text || "").join("\n");
  return parseAiJson(outputText);
}

async function requestAiAnalysis(systemPrompt, userPrompt, retryNote = "") {
  if (AI_PROVIDER === "claude") {
    return requestClaudeAnalysis(systemPrompt, userPrompt, retryNote);
  }
  return requestOpenAiAnalysis(systemPrompt, userPrompt, retryNote);
}

async function enrichWithAi(item) {
  if (!USE_AI) return item;

  let articleText = "";
  try {
    articleText = await fetchArticleText(item.link);
  } catch (error) {
    articleText = "";
  }

  const sourceText = truncateForPrompt([item.rawSummary, articleText]
    .filter(Boolean)
    .filter((value, index, array) => array.indexOf(value) === index)
    .join("\n\n"));

  const systemPrompt = [
    "You are an IVD and medical device Regulatory Affairs analyst.",
    "Analyze only the evidence provided in the input. Do not infer unverified dates, article numbers, deadlines, product scope, or legal obligations.",
    "If information is missing or unclear, say '확인 필요' in Korean.",
    "If the document is not directly applicable to IVDs, clearly state the lack of direct IVD applicability in the summary, action, and impact points.",
    "Separate the three outputs by purpose: summaryKo explains the document, raActionKo gives concrete RA work, impactPointsKo lists internal applicability questions.",
    "Classify urgency strictly. high means urgent: implementation/application timing is very near, immediate action is required, or severe safety, quality, or business risk is expected. medium means important: the document is applicable to IVD manufacturers and the company should analyze and plan implementation. low means reference: all other regulatory updates that are neither urgent nor important.",
    "Use enough detail when the source_text is long. Do not produce one-line generic output for long source_text.",
    "Keep the output factual and in Korean."
  ].join("\n");

  const userPrompt = [
    "Analyze this regulatory update for an IVD manufacturer.",
    "",
    `<authority>${item.authority || "확인 필요"}</authority>`,
    `<region>${item.region || "확인 필요"}</region>`,
    `<source_type>${item.type || "확인 필요"}</source_type>`,
    `<date>${item.date || "확인 필요"}</date>`,
    `<title>${item.title || "확인 필요"}</title>`,
    `<link>${item.link || "확인 필요"}</link>`,
    `<source_text_length>${sourceText.length}</source_text_length>`,
    `<source_text>${sourceText || "확인 필요"}</source_text>`,
    "",
    "Output requirements:",
    "- summaryKo: If source_text_length is 500 or more, write 4 to 6 Korean sentences and use 350 to 500 Korean characters. If source_text is shorter than 500 characters, write a proportionate summary. Include regulatory background/purpose, key change or announcement, applicable device or manufacturer scope, and effective date/timeline. Use '확인 필요' for unknown elements.",
    "- raActionKo: If source_text_length is 500 or more and the update is relevant, use 180 to 300 Korean characters. Give concrete RA work for an IVD manufacturer, such as Technical File impact, registration renewal/change filing, SOP update, local representative check, or deadline tracking. If not directly IVD-applicable, write that no direct IVD action is required and monitoring should continue.",
    "- severity: high, medium, or low. high=긴급: 시행/적용일정이 임박했거나 즉시 대응이 필요하거나 심각한 안전·품질·사업 위험이 예상되는 경우. medium=중요: IVD 제조업체에 적용될 가능성이 높아 내용을 분석하고 적용 계획을 세워야 하는 규제 문서. low=참고: 긴급/중요에 해당하지 않는 나머지 공지, 일반 뉴스, 간접 관련 문서.",
    "- impactPointsKo: exactly 3 Korean questions or checkpoints for company-specific impact assessment. If source_text_length is 500 or more, each point should be specific and substantive, not a generic phrase. Focus on market access, technical documentation, performance/clinical evidence, labeling, supply chain, cost, or timeline risk."
  ].join("\n");

  let parsed = await requestAiAnalysis(systemPrompt, userPrompt);
  if (isThinAiOutput(parsed, sourceText)) {
    parsed = await requestAiAnalysis(
      systemPrompt,
      userPrompt,
      "The previous output would be too brief for the available source_text. Rewrite with the required detail: summaryKo 350-500 Korean characters, raActionKo 180-300 Korean characters, and three specific impactPointsKo."
    );
  }
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

function readPreviousPayload() {
  if (!fs.existsSync(OUTPUT)) return null;
  try {
    return JSON.parse(fs.readFileSync(OUTPUT, "utf8"));
  } catch (error) {
    return null;
  }
}

function sourceSnapshot(sources) {
  return sources.map(({ id, source, authority, region, country, type, url, enabled }) => ({
    id,
    source,
    authority,
    region,
    country,
    type,
    url,
    enabled,
    kind: inferSourceKind(url)
  }));
}

function dateSortValue(item) {
  const time = Date.parse(item.date || "");
  return Number.isNaN(time) ? 0 : time;
}

function mergeFreshItem(fresh, previous) {
  if (!previous) return fresh;
  const preserveAi = previous.analysisMode === "ai" && previous.summary && previous.action && Array.isArray(previous.impactPoints) && previous.impactPoints.length;
  return {
    ...previous,
    ...fresh,
    date: fresh.date || previous.date || "",
    read: Boolean(previous.read),
    ...(preserveAi ? {
      summary: previous.summary,
      action: previous.action,
      severity: previous.severity,
      impactPoints: previous.impactPoints,
      analysisMode: previous.analysisMode
    } : {})
  };
}

function itemSourceId(item) {
  return item.sourceId || String(item.id || "").split(":")[0] || "";
}

function filterItemsForActiveSources(items, sources) {
  const activeSourceIds = new Set(sources.map((source) => source.id).filter(Boolean));
  if (!activeSourceIds.size) return items;
  return items.filter((item) => activeSourceIds.has(itemSourceId(item)));
}

function mergeCollectedItems(results, previousItems, sources) {
  const activePreviousItems = filterItemsForActiveSources(previousItems, sources);
  const previousById = new Map(activePreviousItems.map((item) => [item.id, item]));
  const mergedById = new Map(activePreviousItems.map((item) => [item.id, item]));
  for (const fresh of results) {
    mergedById.set(fresh.id, mergeFreshItem(fresh, previousById.get(fresh.id)));
  }
  return [...mergedById.values()]
    .sort((a, b) => dateSortValue(b) - dateSortValue(a))
    .slice(0, MAX_TOTAL_ITEMS);
}

function formatError(error) {
  const cause = error.cause?.code || error.cause?.message;
  return cause ? `${error.message}: ${cause}` : error.message;
}

function aiKeyWarning() {
  if (USE_AI) return "";
  const secretName = AI_PROVIDER === "claude" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY";
  return `AI_PROVIDER=${AI_PROVIDER} is selected, but ${secretName} is not registered. Collection continued with rule-based analysis.`;
}

async function main() {
  const sources = JSON.parse(fs.readFileSync(SOURCES_PATH, "utf8")).filter((source) => source.enabled !== false);
  const previousPayload = readPreviousPayload();
  const previousItems = Array.isArray(previousPayload?.items) ? previousPayload.items : [];
  const hasPreviousItems = previousItems.length > 0;
  const results = [];
  const errors = [];
  const missingAiKeyMessage = aiKeyWarning();

  if (missingAiKeyMessage) {
    errors.push({ source: "ai", message: missingAiKeyMessage });
    console.warn(missingAiKeyMessage);
  }

  await Promise.all(sources.map(async (source) => {
    try {
      const items = await fetchFeed(source);
      results.push(...items);
      console.log(`Collected ${items.length} items from ${source.id}.`);
    } catch (error) {
      const message = formatError(error);
      errors.push({ source: source.id, message });
      console.error(message);
    }
  }));

  const liveItemIds = new Set(results.map((item) => item.id));
  const activePreviousItems = filterItemsForActiveSources(previousItems, sources);
  const uniqueItems = results.length
    ? mergeCollectedItems(results, previousItems, sources)
    : activePreviousItems
        .sort((a, b) => dateSortValue(b) - dateSortValue(a))
        .slice(0, MAX_TOTAL_ITEMS);

  const enriched = [];
  const usingStaleCache = results.length === 0 && hasPreviousItems;

  if (usingStaleCache) {
    enriched.push(...uniqueItems);
    errors.push({ source: "cache", message: "All live fetches failed. Previous cache was preserved." });
  } else {
    let aiCalls = 0;
    for (const item of uniqueItems) {
      try {
        const alreadyAi = item.analysisMode === "ai" && item.summary && item.action && Array.isArray(item.impactPoints) && item.impactPoints.length;
        const shouldEnrich = USE_AI && !alreadyAi && liveItemIds.has(item.id) && aiCalls < AI_ENRICH_LIMIT;
        if (shouldEnrich) {
          aiCalls += 1;
          enriched.push(await enrichWithAi(item));
        } else {
          enriched.push(item);
        }
      } catch (error) {
        errors.push({ source: item.source, message: formatError(error) });
        enriched.push(item);
      }
    }
    if (USE_AI && liveItemIds.size > AI_ENRICH_LIMIT) {
      errors.push({
        source: "ai",
        message: `AI enrichment was limited to ${AI_ENRICH_LIMIT} newly collected items to keep GitHub Actions fast.`
      });
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
        aiProvider: AI_PROVIDER,
        aiModel: USE_AI ? ACTIVE_AI_MODEL : null,
        aiKeyMissing: Boolean(missingAiKeyMessage),
        aiKeyMissingMessage: missingAiKeyMessage || null,
        openAiModel: USE_AI && AI_PROVIDER === "openai" ? OPENAI_MODEL : null,
        claudeModel: USE_AI && AI_PROVIDER === "claude" ? CLAUDE_MODEL : null,
        count: enriched.length,
        sources: sourceSnapshot(sources),
        staleCache: usingStaleCache,
        previousCollectedAt: usingStaleCache ? previousPayload.collectedAt || null : null,
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
