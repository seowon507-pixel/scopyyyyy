# 커리어 파인더 대시보드 (career-finder-dashboard)

이 폴더는 저장소 루트의 기존 `scopy` 프로젝트와는 별개인, 독립된 프로젝트입니다.
구직자 개인용 지원 현황 관리 + 원티드(Wanted) OpenAPI 연동 대시보드입니다.

- `PRD.md` — 기획 문서
- `DB.md` — 데이터 모델 (Supabase 스키마)
- `UPGRADE_BRIEF.md` — 디자인/API 통합 서브에이전트 토론 결과
- `CLAUDE.md` — 프로젝트 가이드 (아키텍처 원칙, 보안 규칙)
- `dashboard.html` — 완성된 대시보드 (Supabase Auth/DB/Realtime + Edge Function으로 원티드 API 연동)
- `.env.example` — 환경변수 템플릿
- `openapi.json` / `openapi-2.json` — 원티드 OpenAPI 스펙 (v1/v2)

배포된 라이브 데모: https://career-finder-dashboard.vercel.app
