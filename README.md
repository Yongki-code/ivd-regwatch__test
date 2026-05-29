# IVD RegWatch

MDCG 의료기기 섹터 `Latest updates` RSS를 수집해서 보여주는 로컬 모니터링 대시보드입니다.

## 실행

```powershell
npm start
```

브라우저에서 `http://localhost:4173`을 열면 됩니다.

## 수집 방식

- 기본 RSS: `https://health.ec.europa.eu/node/12916/rss_en`
- RSS가 비어 있거나 접근에 실패하면 `https://health.ec.europa.eu/medical-devices-sector/latest-updates_en` 페이지를 보조 파싱합니다.
- 수집 결과는 `data/mdcg-cache.json`에 캐시됩니다.

RSS 주소를 바꾸려면 실행 전에 환경변수를 지정하세요.

```powershell
$env:MDCG_RSS_URL="https://example.com/feed.xml"
npm start
```
