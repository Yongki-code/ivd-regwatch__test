# IVD RegWatch

의료기기/IVD 규제 업데이트를 모니터링하는 GitHub Pages용 정적 대시보드입니다.

## 실행

```powershell
npm start
```

브라우저에서 `http://localhost:4173`을 열면 됩니다.

## 수집 방식

- GitHub Actions가 매일 오전 7시(KST)에 실행됩니다.
- Actions 실행 중 `config/sources.json`의 RSS/API URL을 수집합니다.
- 수집 결과는 GitHub Pages 배포 산출물의 `public/data/mdcg-cache.json`에만 포함됩니다.
- 저장소에는 수집 데이터 JSON을 커밋하지 않습니다.

## 소스 추가

새 국가나 기관을 추가하려면 `config/sources.json`에 항목을 추가하세요.

```json
{
  "id": "new-authority-feed",
  "enabled": true,
  "source": "Authority",
  "authority": "Authority full name",
  "region": "KR",
  "country": "Korea",
  "type": "Guidance",
  "url": "https://example.com/rss.xml",
  "keywords": ["medical device", "ivd", "recall", "guidance"]
}
```

추가 후 GitHub의 `Actions > Update MDCG Feed and Deploy Pages > Run workflow`를 실행하면 사이트에 반영됩니다.

## AI 요약

기본값은 규칙 기반 요약입니다. 실제 AI 요약과 RA Action을 쓰려면 GitHub 저장소의 `Settings > Secrets and variables > Actions`에 아래 Secret을 추가하세요.

- `OPENAI_API_KEY`
- 선택: `OPENAI_MODEL` 값은 workflow 환경변수로 지정할 수 있으며, 기본값은 `gpt-4.1-mini`입니다.

AI 키가 없으면 사이트에는 `규칙 기반 요약`으로 표시됩니다. 키가 있으면 Actions 수집 단계에서 요약/RA Action을 생성하고 `AI 요약`으로 표시됩니다.
