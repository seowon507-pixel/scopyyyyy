# UPGRADE_BRIEF.md — 구현 브리프 (디자인·API 서브에이전트 토론 최종 결과)

> 이 문서는 디자인 담당 에이전트와 API통합 담당 에이전트가 각자 제안 → 서로 비평 → 반영해 확정한 최종 스펙이다.
> `dashboard.html`과 `supabase/functions/sync-wanted/index.ts` 구현자는 PRD.md, DB.md, CLAUDE.md와 함께 이 문서를 기준으로 작업한다.

## 0. 스키마 변경 (이미 적용 완료)

DB.md 초안 대비 아래 3건이 실제 API 응답 검증 후 추가/변경되어 Supabase에 이미 반영됨:

- `watchlist_company_jobs.first_seen_at timestamptz default now()` — 신규 공고 배지(24h)용. **upsert 시 SET 목록에서 반드시 제외**해 최초 INSERT 값만 보존.
- `watchlist_company_jobs.reward_total text` — `GET /companies/{id}/jobs` 응답의 `jobs[].reward.total` 필드가 실제로 존재함을 확인(예시값 `"100만원"`, API가 이미 포맷한 문자열). `employment_type`은 이 엔드포인트에 없어서 **컬럼 추가하지 않음** — 워치리스트 카드에는 표시하지 않는다.
- `market_insight_cache.job_count` → `job_count_sample`로 rename, `has_more boolean` 추가 — Wanted `/jobs` 계열 응답은 `links.next/prev` 커서 페이지네이션만 있고 total count가 없으므로 "전체 공고 수"로 표기하지 않기 위함.

## 1. 화면 섹션 · 데이터 출처 · 우선순위

| # | 섹션 | 데이터 출처 | Realtime | 우선순위 |
|---|---|---|---|---|
| 1-0 | 헤더 이중 인디케이터 | `.rt-ws`=Realtime 채널 상태(JS), `.rt-sync`=`sync_logs` WHERE `sync_type='watchlist_jobs' AND status='success'` 최신 `ran_at` | 채널 상태 자체 | 필수 |
| 1-1 | Day 카운트 | `profiles.prep_start_date`로 프론트 계산 | — | 필수 |
| 1-2 | 지원 파이프라인 퍼널 | `applications.status` group by | `applications` 구독 | 필수 |
| 1-3 | 지원 내역 테이블 + `+ 지원 추가` CRUD | `applications` | `applications` 구독, `.just-synced` 플래시 | 필수 |
| 1-4 | 일정 관리 | `schedules` (D-day는 프론트 계산, 저장 안 함) | `schedules` 구독 | 필수 |
| 1-5 | 공고/기업 검색 & 추가 (신규 화면) | Edge Function 프록시 경유 `GET /v2/jobs`(sort=JobSortEnum, category_tag, subcategory_tags), `GET /search/company`, `GET /search/position` — employment_type·reward·due_time 배지는 **이 화면에서만** | 없음 | 필수 |
| 1-6 | 관심기업 워치리스트 아코디언 | `watchlist_companies` + 펼치면 `watchlist_company_jobs`(name→position, reward_total, url). `due_time`은 값이 실제 있을 때만 D-day 렌더링(대부분 없음 — 안내문구 1줄 필요) | `watchlist_companies`, `watchlist_company_jobs` 구독 | 필수 |
| 1-7 | 기업 상세 인사이트 슬라이드오버 | `company_biz_insight` — NULL은 '비공개', 고용보험 가입자 수는 반드시 "고용보험 가입자 수 (회사 규모 추정 지표)"로 라벨링 | 없음(1회성 캐시) | 필수 |
| 1-8 | 채용시장 인사이트 | `market_insight_cache`(category_title, job_count_sample, has_more, top_skill_tags, snapshot_date) | 없음(일 1회 배치) | 필수 |
| 1-9 | 스킬 준비도 + Wanted 매칭 배지 + 자동완성 | `skills` / `GET /tags/skills?keyword=` 프록시 | 선택 | **차순위(P1)** — 자동완성 없이 매칭 배지만 만들면 영구 0건이므로 함께 구현하거나 함께 보류 |
| 1-10 | 자격증 현황 | `certifications` | 선택 | 필수 |
| 1-11 | 이달의 목표 | `monthly_goals` | 선택 | 필수 |
| 1-12 | 스켈레톤/숫자 롤업 | 순수 프론트 UX | — | 필수 |
| 1-13 | 고급 검색 필터(years/locations 등 '더보기') | `GET /v2/jobs` 파라미터 | — | 차순위 |
| 1-14 | 공고 상세 모달 | `GET /jobs/{job_id}` 프록시, 5분 캐시 | — | 차순위 |

**카피 고정 문구 (반드시 그대로 사용)**
- 시장 인사이트 sec-note: `집계 기준일 {snapshot_date} · 일 1회 배치 집계 (실시간 아님)`
- 시장 인사이트 출처: `자료: 원티드 OpenAPI(/tags/categories, /jobs 카테고리별 페이지 순회 집계), {synced_at} 기준 · 하루 1회 갱신`
- job_count 표시: `has_more=true` → `N건+`, `false` → 실수치. "전체 공고 수" 표현 금지.
- 워치리스트 아코디언 하단: `마감일 정보는 일부 공고에서 제공되지 않을 수 있습니다`
- 기업 인사이트 고용보험 가입자 수 라벨: `고용보험 가입자 수 (회사 규모 추정 지표)`

## 2. Realtime 구독 (dashboard.html `<script>` 내부)

테이블당 채널 1개, 페이지 로드 시 1회 `subscribe()`. 대상: `applications`, `schedules`, `watchlist_companies`, `watchlist_company_jobs` (DB.md §13과 동일). `market_insight_cache`/`company_biz_insight`/`sync_logs`는 구독하지 않고 로드 시 1회 `select()`.

변경 하이라이트: postgres_changes 콜백에서 500ms 버퍼링 → 1건이면 해당 DOM에 `.just-synced`(1.6s 후 제거), 2건 이상이면 패널 `.sec-head` 옆에 `<span class="batch-note">N건 갱신됨</span>` 1개로 요약.

## 3. Edge Function `sync-wanted` — 액션 및 스케줄

단일 함수, POST body의 `action`으로 분기.

| action | 트리거 | 내용 |
|---|---|---|
| `sync_watchlist_jobs` | pg_cron 15분 (또는 수동 호출) | watchlist_companies(사용자당 최대 40개 상한) 순회 `GET /companies/{id}/jobs` → upsert(first_seen_at 제외), 사라진 job은 status='closed' |
| `sync_company_meta` | pg_cron 1일 1회 | `GET /companies/{id}` → name/open_position_count/status_label 갱신 |
| `sync_market_insight` | pg_cron 1일 1회 | 고정 상위 12개 카테고리(`/tags/categories` 응답 순서 그대로, 하드코딩) × `GET /v2/jobs?category_tag=&limit=100` → job_count_sample(data.length)/has_more(links.next 존재) + 표본 100건 내 skill_tags 빈도 top 5~8 → top_skill_tags |
| `sync_company_biz` | 워치리스트 최초 등록 시 1회 | `GET /companies/{id}`로 registration_number 획득 → `GET /insight/company?biz_number=` → upsert, 이후 재조회 안 함 |
| `search_company` / `search_position` / `autocomplete_company` / `job_detail` / `autocomplete_skill` | 사용자 요청 시 (프론트에서 debounce 300ms) | 각각 해당 Wanted 엔드포인트 프록시. client_id/secret은 여기서만 사용 |

모든 액션은 `sync_logs`에 성공/실패 기록(수동 프록시 액션은 기록 생략 가능). 실패시 1s/2s/4s backoff 최대 3회.

## 4. 인증

1인용이지만 RLS가 `auth.uid()` 기준이므로 Supabase Auth(이메일/비밀번호)로 최소한의 로그인 화면을 둔다. 최초 로그인 시 `profiles` 행이 없으면 자동 생성(trigger 또는 최초 로드 시 upsert).
