# scopy — 채용 시장 탐색 대시보드 (v2.1)

원티드(Wanted) 공개 API(V2 `/jobs` + V1 검색·기업·인사이트·태그) 기반의 **구직자용**
채용 시장 대시보드. 기획 문서는 [prd.md](prd.md) 참고.

> v1(기업 채용담당자용 ATS 대시보드)은 방향 변경으로 폐기·재구축함.
> v2.2부터 시장 개요·공고 탐색·북마크·자소서 추천은 원티드 실 API 데이터를 쓴다 (기업 비교만 가상 데이터 — 이유는 prd.md §3 참고).

## 실행

```bash
open index.html        # 브라우저에서 바로 열면 됨 (빌드 불필요)
```

## 화면

1. **시장 개요** — 진행중 공고(직군별 전수 집계)·채용 기업·보상금·신입 KPI + 직군/스킬/경력대/지역/매력태그 차트 + 마감 임박 공고 (실 API)
2. **공고 탐색** — 검색·직군·경력·정렬 필터 + 공고 카드 (D-day, 북마크), 카드 클릭 시 실제 지원 페이지로 이동 (실 API)
3. **기업 비교** — 평균연봉·채용 활발 Top 10 차트 + 인사이트 테이블 (가상 데이터 — `/insight/company` 권한 없음)
4. **북마크** — 저장한 공고 (localStorage, 실 API)
5. **자소서 관리** — 자소서 작성/저장 + 감지된 키워드 기반 추천 기업 (실 API)

## 구조

```
prd.md                  제품 요구사항 문서 (v2.1)
index.html              대시보드 (SPA)
css/style.css           스타일 (라이트/다크 테마)
js/charts.js            SVG 차트 엔진 (의존성 없음)
js/app.js               앱 로직 (필터·뷰·북마크·자소서 추천)
js/data.js              내보낸 데이터 (생성 파일 — 직접 수정 금지). tags/companies/jobs=가상, liveJobs=실 API
db/schema.sql           SQLite 스키마 (가상 데이터 전용)
db/seed.sql             시드 데이터 (생성 파일)
db/scopy.db             SQLite DB 파일
db/generate_seed.py     가상 시드 생성기 (결정적, 기업명은 전부 가상)
db/fetch_live_jobs.py   원티드 실 API 수집기 — 직군별 전수 공고 수 + 상세 표본 (.env 필요)
db/export_data.sh       scopy.db + fetch_live_jobs.py 결과 → js/data.js 내보내기
```

## 데이터 재생성

```bash
cd db
python3 generate_seed.py > seed.sql
rm -f scopy.db && sqlite3 scopy.db < schema.sql && sqlite3 scopy.db < seed.sql
./export_data.sh        # 가상 데이터 재생성 + 실 API 재호출을 한 번에 수행
```

`export_data.sh`는 내부적으로 `fetch_live_jobs.py`를 호출해 원티드 실 API를 다시 불러온다.
`.env`(git 제외)에 `WANTED_CLIENT_ID`/`WANTED_CLIENT_SECRET`이 없거나 API 호출이 실패하면
`liveJobs`를 빈 배열로 두고 계속 진행한다.

## API 활용 확장 여지

지금 안 쓰는 엔드포인트 중 이 앱 범위를 벗어나지 않고 더 붙일 수 있는 것들은 prd.md §3-1 참고
(검색 자동완성, 기업의 다른 공고 보기, 스킬 사전 동기화). `/insight/company`(권한 없음)와
`/ai/*`(유료 계약 전용)는 이 파트너 키로는 못 붙는다.
