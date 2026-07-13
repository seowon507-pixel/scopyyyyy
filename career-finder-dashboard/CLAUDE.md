# CLAUDE.md — 프로젝트 가이드

이 파일은 이 디렉토리에서 작업하는 Claude Code(및 사람)를 위한 컨텍스트입니다.

## 프로젝트 개요

**커리어 파인더 대시보드** — 구직자 개인용 지원 현황 관리 + Wanted OpenAPI 연동 실시간 대시보드.
전체 기획은 `PRD.md`, 데이터 모델은 `DB.md` 참고. 반드시 이 두 문서를 기준으로 구현할 것.

## 핵심 아키텍처 원칙

1. **Wanted API 키는 절대 브라우저에 노출하지 않는다.** `wanted-client-id` / `wanted-client-secret`는 서버(Supabase Edge Function)에서만 사용한다. 프론트엔드 HTML/JS에 하드코딩 금지.
2. **개인 지원 현황(`applications`, `schedules`, `skills`, `certifications`, `monthly_goals`)은 100% 자체 DB 데이터다.** Wanted API는 구직자 개인의 지원 이력을 제공하지 않는다 (`/stat/application/summary`, `/recruit-company/*`, `/ats/*`는 채용담당자/ATS 연동사 전용 API). 이 API들로 "내 지원 현황"을 채우려고 시도하지 말 것.
3. **실시간 동기화는 Supabase Realtime(`postgres_changes`)으로 구현한다.** 클라이언트가 Wanted API를 직접 주기 polling하지 않는다 — Edge Function이 DB를 갱신하면 Realtime이 push한다.
4. **없는 데이터를 지어내지 않는다.** 예: Wanted API에는 "평균 연봉" 필드가 없음 → 공고 수/스킬태그 빈도 등 실제 제공되는 지표로 인사이트를 구성한다 (`/tags/categories`, `/tags/skills`, `/jobs` 집계).

## 디렉토리 구조

```
.
├── PRD.md                 # 기획 문서 (무엇을 만들지)
├── DB.md                   # 데이터 모델 (테이블/컬럼/관계)
├── CLAUDE.md               # 이 파일
├── .env.example            # 환경변수 템플릿 (커밋됨)
├── .env                    # 실제 환경변수 (gitignore 처리, 커밋 금지)
├── .gitignore
├── openapi.json             # Wanted OpenAPI v1 스펙 (공식 문서, 수정 금지)
├── openapi-2.json           # Wanted OpenAPI v2 (jobs 리스트 최신 버전)
├── career-dashboard.html     # 기존 정적 디자인 시안 (업그레이드 베이스)
└── dashboard.html            # (구현 후) Supabase + Wanted API 연동 최종 산출물
```

## 환경변수 (`.env`)

| 변수 | 용도 | 노출 범위 |
|---|---|---|
| `SUPABASE_URL` | Supabase 프로젝트 URL | 프론트 노출 가능 |
| `SUPABASE_ANON_KEY` | Supabase anon public key (RLS로 보호됨) | 프론트 노출 가능 |
| `SUPABASE_SERVICE_ROLE_KEY` | RLS 우회 admin 키 | **서버 전용, 절대 프론트 금지** |
| `WANTED_CLIENT_ID` / `WANTED_CLIENT_SECRET` | Wanted OpenAPI 인증 헤더 (`wanted-client-id`, `wanted-client-secret`) | **서버(Edge Function) 전용** |
| `WANTED_API_BASE_URL` | Wanted API 서버 (`openapi.json`의 `servers` 참고) | 서버 전용 |

## Wanted API 사용 시 참고

- 인증: 헤더 `wanted-client-id`, `wanted-client-secret` (요청 본문/쿼리 아님)
- 이번 프로젝트에서 실제로 사용하는 엔드포인트 (전부 조회/GET, 공개 데이터):
  - `GET /companies/{company_id}`, `GET /companies/{company_id}/jobs` — 관심기업 채용상태 동기화
  - `GET /search/company`, `GET /search/position` — 검색해서 워치리스트/지원목록 추가
  - `GET /jobs`, `GET /jobs/{job_id}` — 공고 목록/상세
  - `GET /tags/categories`, `GET /tags/skills`, `GET /tags/attractions` — 시장 인사이트 집계용 태그 마스터
  - `GET /insight/company?biz_number=` — 사업자 인사이트 (설립일/업력/고용보험 가입자 수)
- 사용하지 않는 엔드포인트: `/ai/*`(AI 첨삭, 범위 밖), `/recruit-company/*`, `/ats/*`, `/stat/application/summary` (채용담당자 전용, 이 프로젝트 페르소나와 무관)
- Rate limit/쿼터 절약을 위해 Edge Function에서 주기 동기화(cron) 후 DB에 캐시하고, 프론트는 DB만 읽는다.

## 커밋/보안 체크리스트

- `.env` 커밋 여부 항상 확인 (`git status`)
- Wanted client secret이나 Supabase service role key가 HTML/JS 파일에 직접 문자열로 들어가면 즉시 제거
