#!/bin/zsh
# scopy.db → js/data.js 내보내기 (v2.4 — 전 화면 실 API 데이터)
# 대시보드는 이 파일 하나만 로드한다.
# liveJobs = 원티드 실 API 실시간 데이터 — 시장 개요·공고 탐색·기업 비교·북마크·
#            자소서 추천 전부가 이걸 쓴다.
# tags/companies/jobs(generate_seed.py 가상 시드)는 v2.4에서 제거함 — 기업 비교가
# 마지막까지 가상 데이터를 쓰던 화면이었는데, 이제 LIVE를 기업 단위로 집계해서
# 대체했다(평균연봉·입사율·퇴사율·1인당매출·인원은 /v1/insight/company가 여전히
# 401이라 못 내지만, 그 항목 자체를 화면에서 뺐다 — 가짜 값으로 채우지 않음).
# scopy.db/generate_seed.py는 리포에 남아있지만 이 스크립트는 더 이상 참조하지 않는다.
set -e
cd "$(dirname "$0")"
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
  echo "// db/fetch_live_jobs.py → export_data.sh 로 생성됨 — 직접 수정하지 말 것"
  echo "window.SCOPY_DATA = {"
  echo "  liveJobs: $LIVE_JOBS,"
  echo "  liveCategoryTotals: $LIVE_TOTALS,"
  echo "  liveFetchedAt: \"$FETCHED_AT\""
  echo "};"
} > $OUT

echo "OK → $OUT ($(wc -c < $OUT | tr -d ' ') bytes)"
