# scopy — 채용 시장 탐색 대시보드 (v2)

원티드(Wanted) 공개 API(V2 `/jobs` + V1 검색·기업·인사이트·태그) 기반의 **구직자용**
채용 시장 대시보드. 기획 문서는 [prd.md](prd.md) 참고.

> v1(기업 채용담당자용 ATS 대시보드)은 방향 변경으로 폐기·재구축함.

## 실행

```bash
open index.html        # 브라우저에서 바로 열면 됨 (빌드 불필요)
```

## 화면

1. **시장 개요** — 신규 공고·채용 기업·평균 보상금·신입 가능 KPI + 추이/직군/스킬/경력대 차트
2. **공고 탐색** — 검색·직군·경력·정렬 필터 + 공고 카드 (기업 연봉·퇴사율, D-day, 북마크)
3. **기업 비교** — 평균연봉·채용 활발 Top 10 차트 + 인사이트 테이블
4. **북마크** — 저장한 공고 (localStorage)

## 구조

```
prd.md                  제품 요구사항 문서 (v2)
index.html              대시보드 (SPA)
css/style.css           스타일 (라이트/다크 테마)
js/charts.js            SVG 차트 엔진 (의존성 없음)
js/app.js               앱 로직 (필터·뷰·북마크)
js/data.js              DB에서 내보낸 데이터 (생성 파일 — 직접 수정 금지)
db/schema.sql           SQLite 스키마 (테이블 5개 + 뷰 3개)
db/seed.sql             시드 데이터 (생성 파일)
db/scopy.db             SQLite DB 파일
db/generate_seed.py     시드 생성기 (결정적, 기업명은 전부 가상)
db/export_data.sh       scopy.db → js/data.js 내보내기
```

## 데이터 재생성

```bash
cd db
python3 generate_seed.py > seed.sql
rm -f scopy.db && sqlite3 scopy.db < schema.sql && sqlite3 scopy.db < seed.sql
./export_data.sh
```

## 실서비스 전환

`js/data.js` 로더를 원티드 API 호출로 교체하면 된다 (prd.md §3 매핑 표 참조).
인증 헤더: `wanted-client-id` / `wanted-client-secret`.
