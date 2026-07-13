# DB.md — 데이터 모델 설계 (Supabase / PostgreSQL)

> PRD.md의 필수 기능 기준으로 설계. 실시간 동기화(Supabase Realtime)를 전제로 모든 사용자 데이터 테이블에 `updated_at`을 두고, Wanted API로 채워지는 캐시성 테이블(`watchlist_companies`, `market_insight_cache`)은 별도 동기화 로그 테이블로 "언제 갱신됐는지"를 추적한다.

## 0. 공통 규칙

- 모든 테이블 PK는 `id uuid default gen_random_uuid()` (단, 원티드 API 원본 ID를 그대로 참조하는 캐시 테이블은 원티드 ID를 PK로 사용)
- 모든 사용자 소유 테이블은 `user_id uuid references auth.users(id)` + Row Level Security(`user_id = auth.uid()`)로 보호 (1인 사용 기준이지만 Supabase Auth 계정 분리를 대비)
- `created_at timestamptz default now()`, `updated_at timestamptz default now()` (트리거로 갱신)
- 이 프로젝트는 1인 사용 전제이므로 `profiles` 테이블은 최소 필드만 둠

---

## 1. `profiles` — 사용자 프로필

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid (PK, references auth.users) | Supabase Auth 사용자 ID |
| display_name | text | 이름 (예: "이지수") |
| target_role | text | 목표 직무 (예: "데이터 / 서비스 기획") |
| prep_start_date | date | 준비 시작일 (Day 카운트 계산용) |
| created_at | timestamptz | |

관계: 1 profile — N applications / N schedules / N watchlist_companies / N skills / N certifications / N monthly_goals

---

## 2. `applications` — 지원 현황 (핵심 트래킹 데이터, 100% 사용자 입력)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid (PK) | |
| user_id | uuid (FK → profiles.id) | |
| company_name | text | 회사명 |
| company_logo_color | text | 로고 칩 배경색 (hex) |
| wanted_company_id | integer, nullable | 검색으로 추가 시 Wanted 기업 ID 연결 (`/search/company`) |
| position | text | 지원 직무 |
| applied_date | date | 지원일 |
| current_stage | text | 현재 단계 텍스트 (예: "2차 임원 면접") |
| status | text, check in ('review','interview','pass','fail') | 파이프라인 단계 필터용 상태 |
| notes | text, nullable | 메모 |
| created_at / updated_at | timestamptz | |

관계: `applications.id` ← `schedules.application_id` (1:N)

인덱스: `(user_id, status)`, `(user_id, applied_date desc)`

---

## 3. `schedules` — 일정 (면접/마감/발표)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid (PK) | |
| user_id | uuid (FK → profiles.id) | |
| application_id | uuid, nullable (FK → applications.id) | 특정 지원 건과 연결 (선택) |
| event_date | timestamptz | 일정 일시 |
| title | text | 예: "카카오 · 2차 임원 면접 (오프라인)" |
| subtitle | text, nullable | 예: "플랫폼 기획 직무 · 판교 오피스" |
| event_type | text, check in ('interview','deadline','announcement','etc') | |
| created_at / updated_at | timestamptz | |

D-day는 `event_date - now()`로 프론트에서 계산 (별도 컬럼 저장 안 함 → 항상 최신값 보장)

---

## 4. `watchlist_companies` — 관심기업 (Wanted API 실시간 동기화 대상)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid (PK) | |
| user_id | uuid (FK → profiles.id) | |
| wanted_company_id | integer, not null | Wanted 기업 ID (`/companies/{id}`) |
| name | text | 기업명 (동기화 시 갱신) |
| category | text, nullable | 표시용 카테고리 (예: "검색 · AI") — 사용자 입력 또는 company_tags 매핑 |
| logo_color | text | 로고 칩 색 |
| open_position_count | integer, default 0 | 최근 동기화된 채용중 포지션 수 (`/companies/{id}/jobs`) |
| status_label | text | 'open' \| 'urgent' \| 'always' — open_position_count·마감일 기준 계산 |
| last_synced_at | timestamptz, nullable | 마지막 Wanted API 동기화 시각 |
| created_at / updated_at | timestamptz | |

UNIQUE (`user_id`, `wanted_company_id`)

관계: 1 watchlist_company — N `watchlist_company_jobs` (동기화된 개별 공고 스냅샷)

---

## 5. `watchlist_company_jobs` — 관심기업의 실시간 공고 스냅샷

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | integer (PK) | Wanted job_id 그대로 사용 |
| watchlist_company_id | uuid (FK → watchlist_companies.id) | |
| position | text | 포지션명 |
| due_time | date, nullable | 마감일 (`/jobs/{id}` 또는 `/companies/{id}/jobs` 응답) |
| url | text | 원티드 상세 페이지 링크 |
| status | text | 'active' \| 'closed' (동기화 시 사라지면 closed 처리) |
| synced_at | timestamptz | |

Edge Function이 동기화할 때마다 upsert → **Realtime 구독으로 새 공고/마감 변경이 프론트에 즉시 반영됨**

---

## 6. `market_insight_cache` — 채용시장 인사이트 캐시

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid (PK) | |
| category_tag_id | integer | Wanted 직군 태그 ID (`/tags/categories`) |
| category_title | text | 직군명 (예: "기획·전략") |
| job_count | integer | 해당 직군 공고 수 (`/jobs?category_tags=`의 응답 건수 집계) |
| top_skill_tags | jsonb | 상위 스킬태그 배열 [{id, title, count}] |
| snapshot_date | date | 집계 기준일 |
| synced_at | timestamptz | |

UNIQUE (`category_tag_id`, `snapshot_date`) — 일 단위 스냅샷으로 트렌드(전일 대비) 계산 가능

---

## 7. `company_biz_insight` — 워치리스트 기업 사업자 인사이트 (선택 조회)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| wanted_company_id | integer (PK) | |
| biz_no | text | 사업자등록번호 |
| ceo_name | text | |
| founded_date | date, nullable | |
| age_years | integer, nullable | 업력 |
| employee_count_ei | integer, nullable | 고용보험 가입자 수 (회사 규모 추정) |
| industry_name | text, nullable | |
| synced_at | timestamptz | |

출처: `GET /insight/company?biz_number=` — 최초 워치리스트 등록 시 1회 조회 후 캐시(빈번히 안 변하므로 realtime 대상 아님)

---

## 8. `skills` — 스킬 준비도

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid (PK) | |
| user_id | uuid (FK) | |
| skill_name | text | |
| wanted_skill_tag_id | integer, nullable | `/tags/skills?keyword=` 매칭 시 저장 |
| readiness_pct | integer, check 0~100 | |
| sort_order | integer | 표시 순서 |

## 9. `certifications` — 자격증

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid (PK) | |
| user_id | uuid (FK) | |
| cert_name | text | |
| status | text, check in ('done','in_progress') | |
| target_date | date, nullable | 준비중일 때 목표일(D-day 표시용) |

## 10. `monthly_goals` — 이달의 목표

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid (PK) | |
| user_id | uuid (FK) | |
| goal_name | text | 예: "신규 지원 10건" |
| target_value | numeric | |
| current_value | numeric | |
| unit | text, nullable | 예: "건", "%", "회" |
| period_month | date | 해당 월 (매월 1일로 저장) |

## 11. `sync_logs` — Wanted API 동기화 이력 (실시간 동기화 신뢰성/투명성용)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid (PK) | |
| sync_type | text | 'watchlist_jobs' \| 'market_insight' \| 'company_biz' |
| target_id | text, nullable | 대상 식별자 |
| status | text | 'success' \| 'error' |
| detail | text, nullable | 에러 메시지 등 |
| ran_at | timestamptz default now() | |

프론트 상단에 "마지막 동기화: n분 전" 표시용으로 최신 1건 조회

---

## 12. ERD 요약 (관계)

```
profiles (1) ──< applications (N) ──< schedules (N, optional FK)
profiles (1) ──< schedules (N, application_id nullable)
profiles (1) ──< watchlist_companies (N) ──< watchlist_company_jobs (N)
watchlist_companies (N) >── company_biz_insight (1, wanted_company_id 매칭, FK 아님·조회용 조인)
profiles (1) ──< skills (N)
profiles (1) ──< certifications (N)
profiles (1) ──< monthly_goals (N)
market_insight_cache, sync_logs — 전역 캐시 테이블 (user_id 없음, 전체 공유)
```

## 13. Realtime 대상 테이블

Supabase Realtime publication에 포함할 테이블 (client가 `postgres_changes` 구독):

- `applications`, `schedules`, `watchlist_companies`, `watchlist_company_jobs` (사용자 데이터 + Wanted 동기화 데이터 모두 실시간 반영 필요)
- `market_insight_cache`는 저빈도 갱신(일 단위)이라 Realtime 구독 없이 페이지 로드시 조회로 충분
