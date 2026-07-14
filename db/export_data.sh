#!/bin/zsh
# scopy.db → js/data.js 내보내기 (v2 — 시장 탐색 데이터)
# 대시보드는 이 파일 하나만 로드한다.
# tags/companies/jobs = generate_seed.py 가상 데이터 (시장 개요·기업 비교가 사용)
# liveJobs           = 원티드 실 API 실시간 데이터 (공고 탐색·북마크·자소서 추천이 사용)
#   → 실 API는 공고 등록일시·기업 인사이트(평균연봉·퇴사율)를 안 주거나 권한이 없어
#     시장 개요/기업 비교까지는 아직 실 데이터로 못 옮김.
set -e
cd "$(dirname "$0")"
python3 export_certifications.py
DB=scopy.db
OUT=../js/data.js
python3 fetch_live_jobs.py > /tmp/scopy_live.json 2>/tmp/scopy_live_jobs.log || true
JOB_COUNT=0
if [ -s /tmp/scopy_live.json ]; then
  JOB_COUNT=$(python3 -c "import json; print(len(json.load(open('/tmp/scopy_live.json'))['jobs']))" 2>/dev/null || echo 0)
fi
if [ "$JOB_COUNT" -gt 0 ]; then
  LIVE_JOBS=$(python3 -c "import json; print(json.dumps(json.load(open('/tmp/scopy_live.json'))['jobs'], ensure_ascii=False))")
  LIVE_TOTALS=$(python3 -c "import json; print(json.dumps(json.load(open('/tmp/scopy_live.json'))['category_totals'], ensure_ascii=False))")
  FETCHED_AT=$(date +"%Y-%m-%d %H:%M")
elif [ -f "$OUT" ] && node -e "eval(require('fs').readFileSync('$OUT','utf8')); if(!window.SCOPY_DATA.liveJobs || !window.SCOPY_DATA.liveJobs.length) process.exit(1)" 2>/dev/null; then
  echo "경고: 실 공고 조회 실패 — 직전 $OUT의 liveJobs를 그대로 유지함 ($(cat /tmp/scopy_live_jobs.log 2>/dev/null | tail -1))" >&2
  LIVE_JOBS=$(node -e "eval(require('fs').readFileSync('$OUT','utf8')); console.log(JSON.stringify(window.SCOPY_DATA.liveJobs))")
  LIVE_TOTALS=$(node -e "eval(require('fs').readFileSync('$OUT','utf8')); console.log(JSON.stringify(window.SCOPY_DATA.liveCategoryTotals || {}))")
  FETCHED_AT=$(node -e "eval(require('fs').readFileSync('$OUT','utf8')); console.log(window.SCOPY_DATA.liveFetchedAt || '-')")
  FETCHED_AT="$FETCHED_AT (갱신 실패, 이전 값 유지)"
else
  echo "경고: 실 공고 조회 실패 & 이전 데이터 없음 — liveJobs를 빈 배열로 둠 ($(cat /tmp/scopy_live_jobs.log 2>/dev/null | tail -1))" >&2
  LIVE_JOBS="[]"
  LIVE_TOTALS="{}"
  FETCHED_AT="조회 실패"
fi

{
  echo "// generate_seed.py → scopy.db → export_data.sh 로 생성됨 — 직접 수정하지 말 것"
  echo "window.SCOPY_DATA = {"
  echo "  tags: $(sqlite3 -json $DB "SELECT * FROM tags;"),"
  echo "  companies: $(sqlite3 -json $DB "
    SELECT c.*,
      (SELECT json_group_array(tg.title) FROM company_tags ct JOIN tags tg ON tg.id = ct.tag_id
        WHERE ct.company_id = c.id) AS attraction_titles
    FROM v_company_stats c;"),"
  echo "  jobs: $(sqlite3 -json $DB "
    SELECT j.*, c.name AS company_name, c.average_salary, c.left_rate, c.employee_count,
      t.title AS category_title,
      (SELECT json_group_array(tg.title) FROM job_tags jt JOIN tags tg ON tg.id = jt.tag_id
        WHERE jt.job_id = j.id AND tg.tag_type = 'skill') AS skill_titles,
      (SELECT json_group_array(tg.title) FROM job_tags jt JOIN tags tg ON tg.id = jt.tag_id
        WHERE jt.job_id = j.id AND tg.tag_type = 'subcategory') AS subcategory_titles,
      (SELECT json_group_array(tg.title) FROM company_tags ct JOIN tags tg ON tg.id = ct.tag_id
        WHERE ct.company_id = j.company_id) AS attraction_titles
    FROM jobs j
    JOIN companies c ON c.id = j.company_id
    LEFT JOIN tags t ON t.id = j.category_tag_id
    ORDER BY j.created_at DESC;"),"
  echo "  liveJobs: $LIVE_JOBS,"
  echo "  liveCategoryTotals: $LIVE_TOTALS,"
  echo "  liveFetchedAt: \"$FETCHED_AT\""
  echo "};"
} > $OUT

echo "OK → $OUT ($(wc -c < $OUT | tr -d ' ') bytes)"
