#!/bin/zsh
# scopy.db → js/data.js 내보내기 (v2 — 시장 탐색 데이터)
# 대시보드는 이 파일 하나만 로드한다. 실서비스 전환 시 이 산출물을 원티드 API 호출로 교체.
set -e
cd "$(dirname "$0")"
DB=scopy.db
OUT=../js/data.js

{
  echo "// generate_seed.py → scopy.db → export_data.sh 로 생성됨 — 직접 수정하지 말 것"
  echo "window.SCOPY_DATA = {"
  echo "  tags: $(sqlite3 -json $DB "SELECT * FROM tags;"),"
  echo "  companies: $(sqlite3 -json $DB "SELECT * FROM v_company_stats;"),"
  echo "  jobs: $(sqlite3 -json $DB "
    SELECT j.*, c.name AS company_name, c.average_salary, c.left_rate, c.employee_count,
      t.title AS category_title,
      (SELECT json_group_array(tg.title) FROM job_tags jt JOIN tags tg ON tg.id = jt.tag_id
        WHERE jt.job_id = j.id AND tg.tag_type = 'skill') AS skill_titles,
      (SELECT json_group_array(tg.title) FROM job_tags jt JOIN tags tg ON tg.id = jt.tag_id
        WHERE jt.job_id = j.id AND tg.tag_type = 'subcategory') AS subcategory_titles
    FROM jobs j
    JOIN companies c ON c.id = j.company_id
    LEFT JOIN tags t ON t.id = j.category_tag_id
    ORDER BY j.created_at DESC;")"
  echo "};"
} > $OUT

echo "OK → $OUT ($(wc -c < $OUT | tr -d ' ') bytes)"
