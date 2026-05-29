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
  return match ? decodeEntities(match[1].replace(/^<!\\[CDATA\\[/, "").replace(/\\]\\]>$/, "").trim()) : "";
}

function normalizeDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
}

function getSeverity(title) {
  const text = title.toLowerCase();
  if (/incident|mir|vigilance|urgent|recall|field safety notice|shortage/.test(text)) return "high";
  if (/regulation|classification|borderline|mdcg|guidance|manual|q&a/.test(text)) return "medium";
  return "low";
}

function getSummary(title) {
  const text = title.toLowerCase();
  if (text.includes("mir") || text.includes("incident")) return "제조사 사고 보고, MIR 양식 또는 감시체계 운영과 관련된 업데이트입니다.";
  if (text.includes("classification")) return "제품 분류 또는 경계 제품 판단에 영향을 줄 수 있는 업데이트입니다.";
  if (text.includes("emdn")) return "유럽 의료기기 명명체계(EMDN) 관련 업데이트입니다.";
  if (text.includes("mdcg") || text.includes("guidance")) return "MDCG 지침 또는 의료기기 규제 해석에 관한 업데이트입니다.";
  return "EU 의료기기 규제 환경의 최신 공지입니다.";
}

async function main() {
  const res = await fetch(RSS_URL);
  if (!res.ok) throw new Error(`RSS fetch failed: ${res.status}`);

  const xml = await res.text();
  const items = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((match, index) => {
    const block = match[0];
    const title = stripTags(readTag(block, "title"));

    return {
      id: readTag(block, "guid") || readTag(block, "link") || String(index),
      title,
      source: "MDCG",
      region: "EU",
      type: title.toLowerCase().includes("mdcg") ? "MDCG Guidance" : "Guidance",
      date: normalizeDate(readTag(block, "pubDate")),
      link: readTag(block, "link"),
      summary: getSummary(title),
      rawSummary: stripTags(readTag(block, "description")),
      severity: getSeverity(title),
      read: false,
      action: "자사 제품군 적용 여부, 기술문서 영향, QMS 절차 변경 필요성을 검토하세요.",
      impactPoints: [
        "자사 IVD 또는 의료기기 제품군에 직접 적용되는 범위인지 확인",
        "기술문서, PMS/PMCF, vigilance 또는 QMS 절차서 변경 필요성 검토",
        "인증기관, 수입자, 대리인과 공유해야 하는 변경사항 선별"
      ]
    };
  }).slice(0, 30);

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify({
    collectedAt: new Date().toISOString(),
    source: RSS_URL,
    mode: "github-actions-rss",
    count: items.length,
    items
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
