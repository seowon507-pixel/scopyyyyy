-- scopy v2 — 채용 시장 탐색 대시보드 DB 스키마 (SQLite)
-- Wanted OpenAPI V2 /jobs + V1 companies/insight/tags 응답 구조 준거 (prd.md §3, §8)

PRAGMA foreign_keys = ON;

-- 기업 (/v1/companies/{id} + /v1/insight/company)
CREATE TABLE companies (
    id               INTEGER PRIMARY KEY,
    name             TEXT    NOT NULL,
    industry_name    TEXT,                       -- 산업분류코드명 (SectionName)
    address          TEXT,
    founded_date     TEXT,                       -- 설립일 (ISO date)
    age              INTEGER,                    -- 업력 (년)
    employee_count   INTEGER,                    -- 고용보험 가입자 수 (employeeCountEI)
    average_salary   INTEGER,                    -- 평균연봉 (만원)
    hired_salary     INTEGER,                    -- 신규입사자 평균연봉 (만원)
    sales_amount     INTEGER,                    -- 매출액 (백만원)
    sales_per_person INTEGER,                    -- 1인당 매출 (백만원)
    hire_rate        INTEGER,                    -- 입사율 (%)
    left_rate        INTEGER,                    -- 퇴사율 (%)
    link             TEXT                        -- 기업 페이지 링크
);

-- 태그 (/v1/tags/categories, /v1/tags/skills)
CREATE TABLE tags (
    id        INTEGER PRIMARY KEY,
    tag_type  TEXT NOT NULL CHECK (tag_type IN ('category', 'subcategory', 'skill', 'attraction')),
    parent_id INTEGER REFERENCES tags (id),      -- 직무(subcategory)의 소속 직군
    title     TEXT NOT NULL
);

-- 공개 채용공고 (/v2/jobs + /v1/jobs/{id})
CREATE TABLE jobs (
    id                 INTEGER PRIMARY KEY,
    company_id         INTEGER NOT NULL REFERENCES companies (id),
    name               TEXT    NOT NULL,          -- 포지션명
    status             TEXT    NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active', 'close', 'archived')),
    category_tag_id    INTEGER REFERENCES tags (id), -- 직군
    employment_type    TEXT    NOT NULL DEFAULT 'regular'
                       CHECK (employment_type IN ('regular', 'contract', 'intern', 'freelancer')),
    annual_from        INTEGER NOT NULL DEFAULT 0, -- 최소 경력 (신입 = 0)
    annual_to          INTEGER NOT NULL DEFAULT 10,
    location           TEXT,
    country            TEXT    DEFAULT 'KR' CHECK (country IN ('KR', 'JP', 'TW', 'HK', 'SG', 'WW')),
    reward_total       INTEGER DEFAULT 0,          -- 전체 보상금 (원)
    reward_recommender INTEGER DEFAULT 0,
    reward_recommendee INTEGER DEFAULT 0,
    created_at         TEXT    NOT NULL,           -- 공고 등록일시 (추이 분석 축)
    due_time           TEXT,                       -- 마감일 (NULL = 상시)
    url                TEXT                        -- 원티드 공고 상세 URL
);

-- 공고-태그 매핑 (직무/스킬)
CREATE TABLE job_tags (
    job_id INTEGER NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags (id),
    PRIMARY KEY (job_id, tag_id)
);

-- 관심 공고 (클라이언트는 localStorage, 서버 전환 대비 정의)
CREATE TABLE bookmarks (
    job_id     INTEGER PRIMARY KEY REFERENCES jobs (id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_jobs_company    ON jobs (company_id);
CREATE INDEX idx_jobs_status     ON jobs (status);
CREATE INDEX idx_jobs_category   ON jobs (category_tag_id);
CREATE INDEX idx_jobs_created_at ON jobs (created_at);
CREATE INDEX idx_job_tags_tag    ON job_tags (tag_id);

-- 직군별 공고 현황
CREATE VIEW v_category_stats AS
SELECT t.id, t.title,
       COUNT(j.id)                                          AS total_jobs,
       SUM(CASE WHEN j.status = 'active' THEN 1 ELSE 0 END) AS active_jobs
FROM tags t
LEFT JOIN jobs j ON j.category_tag_id = t.id
WHERE t.tag_type = 'category'
GROUP BY t.id;

-- 스킬 수요 (공고에 붙은 스킬 태그 빈도)
CREATE VIEW v_skill_demand AS
SELECT t.id, t.title, COUNT(jt.job_id) AS job_count
FROM tags t
JOIN job_tags jt ON jt.tag_id = t.id
JOIN jobs j ON j.id = jt.job_id AND j.status = 'active'
WHERE t.tag_type = 'skill'
GROUP BY t.id
ORDER BY job_count DESC;

-- 기업별 채용 현황
CREATE VIEW v_company_stats AS
SELECT c.*,
       COUNT(j.id)                                          AS total_jobs,
       SUM(CASE WHEN j.status = 'active' THEN 1 ELSE 0 END) AS active_jobs
FROM companies c
LEFT JOIN jobs j ON j.company_id = c.id
GROUP BY c.id;
