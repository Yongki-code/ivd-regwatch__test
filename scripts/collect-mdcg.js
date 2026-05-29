const fs = require("fs");
const path = require("path");

const RSS_URL = "https://health.ec.europa.eu/node/12916/rss_en";
const OUTPUT = path.join(__dirname, "..", "public", "data", "mdcg-cache.json");

function stripTags(value = "") {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeEntities(value = "") {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function readTag(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  if (!match) return "";
  return decodeEntities(match[1].replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim());
}

function normalizeDate(value) {
  const date = new Date(value);
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
  const rawSummary = stripTags(raw.description || "");
  const severity = classifySeverity(title, rawSummary);

  return {
    id: raw.guid || raw.link || `${raw.date}-${index}-${title}`,
    title,
    source: "MDCG",
    region: "EU",
    type: title.toLowerCase().includes("mdcg") ? "MDCG Guidance" : "Guidance",
    date: normalizeDate(raw.date),
    link: raw.link,
    summary: buildKoreanSummary(title, rawSummary),
    rawSummary,
    severity,
    read: false,
    action: buildAction(title, rawSummary, severity),
    impactPoints: [
      "자사 IVD 또는 의료기기 제품군에 직접 적용되는 범위인지 확인",
      "기술문서, PMS/PMCF, vigilance 또는 QMS 절차서 변경 필요성 검토",
      "인증기관, 수입자, 대리인과 공유해야 하는 변경사항 선별"
    ]
  };
}

async function main() {
  const response = await fetch(RSS_URL, {
    headers: {
      "user-agent": "IVD-RegWatch-GitHub-Actions/1.0",
      accept: "application/rss+xml, application/xml, text/xml"
    }
  });

  if (!response.ok) {
    throw new Error(`RSS fetch failed: ${response.status} ${response.statusText}`);
  }

  const xml = await response.text();
  const items = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)]
    .map((match, index) =>
      toItem(
        {
          title: readTag(match[0], "title"),
          link: readTag(match[0], "link"),
          guid: readTag(match[0], "guid"),
          description: readTag(match[0], "description"),
          date: readTag(match[0], "pubDate")
        },
        index
      )
    )
    .filter((item) => /mdcg|medical device|ivd|mir|emdn|notified bod|regulation|guidance/i.test(`${item.title} ${item.rawSummary}`))
    .slice(0, 30);

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(
    OUTPUT,
    JSON.stringify(
      {
        collectedAt: new Date().toISOString(),
        source: RSS_URL,
        mode: "github-actions-rss",
        count: items.length,
        items
      },
      null,
      2
    ),
    "utf8"
  );

  console.log(`Collected ${items.length} MDCG updates.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
