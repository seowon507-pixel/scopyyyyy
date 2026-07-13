#!/usr/bin/env python3
"""scopy v2 seed.sql 생성기 — 채용 시장 시연용 더미 데이터 (결정적, seed 고정)

사용법: python3 generate_seed.py > seed.sql
기준일: 2026-07-13, 최근 90일 공고 등록 데이터 생성
기업명은 전부 가상 — 실존 기업에 대한 지표 조작 오해를 피하기 위함.
"""
import random
from datetime import datetime, timedelta

random.seed(507)
TODAY = datetime(2026, 7, 13, 18, 0, 0)


def esc(s):
    return s.replace("'", "''")


def dt(d):
    return d.strftime("%Y-%m-%d %H:%M:%S")


out = []
out.append("-- scopy v2 시드 데이터 (generate_seed.py로 생성 — 직접 수정하지 말 것)")
out.append("PRAGMA foreign_keys = ON;")
out.append("BEGIN TRANSACTION;")

# ── 태그 ──────────────────────────────────────────────
categories = {518: "개발", 517: "데이터", 511: "디자인", 507: "기획·PM", 523: "마케팅"}
subcategories = {  # id: (직군, 직무명)
    872: (518, "서버 개발자"), 669: (518, "프론트엔드 개발자"), 677: (518, "iOS 개발자"),
    678: (518, "안드로이드 개발자"), 665: (518, "DevOps 엔지니어"),
    1634: (517, "머신러닝 엔지니어"), 1025: (517, "데이터 엔지니어"), 1024: (517, "데이터 분석가"),
    895: (511, "프로덕트 디자이너"), 899: (511, "브랜드 디자이너"),
    876: (507, "프로덕트 매니저"), 878: (507, "서비스 기획자"),
    1030: (523, "퍼포먼스 마케터"), 1032: (523, "콘텐츠 마케터"),
}
skills = {
    2217: "Python", 3078: "TypeScript", 2386: "React", 1698: "Kotlin", 2119: "Swift",
    2225: "AWS", 1411: "Kubernetes", 2276: "Go", 2412: "Java", 2551: "Node.js",
    3776: "PyTorch", 2450: "Spark", 2094: "SQL", 2731: "Airflow", 2842: "Tableau",
    1866: "Figma", 2903: "Framer", 2521: "GA4", 2634: "SEO", 2955: "Notion",
}
# 직군별 스킬 풀 (직무별 풀이 있으면 그쪽 우선)
skill_pool = {
    518: [2217, 3078, 2386, 1698, 2119, 2225, 1411, 2276, 2412, 2551],
    517: [2217, 3776, 2450, 2094, 2731, 2842, 2225],
    511: [1866, 2903],
    507: [2094, 2955, 2521],
    523: [2521, 2634, 2842],
}
sub_skill_pool = {  # 개발/데이터 직무는 현실적인 스택으로 제한
    872: [2217, 2412, 1698, 2276, 2551, 2225, 1411, 2094],   # 서버
    669: [3078, 2386, 2551],                                  # 프론트엔드
    677: [2119],                                              # iOS
    678: [1698, 2412],                                        # 안드로이드
    665: [2225, 1411, 2217, 2276],                            # DevOps
    1634: [2217, 3776, 2225],                                 # ML
    1025: [2217, 2450, 2731, 2094, 2225],                     # 데이터 엔지니어
    1024: [2094, 2217, 2842],                                 # 데이터 분석가
}
attractions = {10: "유연근무", 22: "스톡옵션", 31: "자기계발비", 45: "재택근무", 58: "식대지원"}

rows = [f"({tid}, 'category', NULL, '{esc(t)}')" for tid, t in categories.items()]
rows += [f"({tid}, 'subcategory', {p}, '{esc(t)}')" for tid, (p, t) in subcategories.items()]
rows += [f"({tid}, 'skill', NULL, '{esc(t)}')" for tid, t in skills.items()]
rows += [f"({tid}, 'attraction', NULL, '{esc(t)}')" for tid, t in attractions.items()]
out.append("INSERT INTO tags (id, tag_type, parent_id, title) VALUES\n" + ",\n".join(rows) + ";")

# ── 기업 (전부 가상) ──────────────────────────────────
# (이름, 산업, 인원규모급, 연봉급, 퇴사율급, 지역)  급: 0=스타트업 1=중견급 2=대형급
company_defs = [
    ("코드나인", "소프트웨어 개발업", 2, 2, 0, "서울 강남구"),
    ("데이터포지", "정보서비스업", 1, 2, 0, "서울 서초구"),
    ("핀틀리", "핀테크·금융서비스업", 1, 2, 1, "서울 영등포구"),
    ("메딕솔루션", "헬스케어 플랫폼업", 1, 1, 0, "서울 송파구"),
    ("커머스랩", "전자상거래업", 2, 1, 2, "서울 잠실"),
    ("클라우드베이스", "클라우드 인프라업", 1, 2, 0, "경기 성남시 분당구"),
    ("무빙테크", "모빌리티 플랫폼업", 1, 1, 1, "서울 성수동"),
    ("에듀플로우", "에듀테크업", 0, 0, 1, "서울 마포구"),
    ("그린에너지랩", "에너지 IT업", 0, 1, 0, "대전 유성구"),
    ("푸디언", "푸드테크업", 0, 0, 2, "서울 용산구"),
    ("트래블노트", "여행 플랫폼업", 0, 0, 1, "제주 제주시"),
    ("시큐어원", "정보보안업", 1, 2, 0, "판교"),
    ("애드모먼트", "광고 플랫폼업", 0, 1, 2, "서울 강남구"),
    ("로보틱스원", "로봇·자동화업", 1, 1, 0, "경기 수원시"),
    ("콘텐츠빌", "콘텐츠 플랫폼업", 0, 0, 1, "서울 합정동"),
    ("바이오데이터", "바이오 인포매틱스업", 0, 2, 0, "인천 송도"),
    ("리테일마인드", "리테일 테크업", 1, 1, 1, "서울 중구"),
    ("게임스튜디오한", "게임 개발업", 1, 1, 2, "판교"),
    ("스페이스로직", "부동산 플랫폼업", 0, 1, 1, "서울 역삼동"),
    ("펫프렌즈랩", "반려동물 서비스업", 0, 0, 1, "서울 성동구"),
]
emp_band = [(18, 60), (80, 400), (500, 2200)]
sal_band = [(4200, 5400), (5400, 7000), (7000, 9600)]
left_band = [(6, 12), (12, 20), (20, 31)]

rows = []
for i, (name, ind, eb, sb, lb, loc) in enumerate(company_defs, start=1):
    emp = random.randint(*emp_band[eb])
    sal = random.randint(*sal_band[sb]) // 100 * 100
    hired = sal - random.randint(300, 900)
    left = random.randint(*left_band[lb])
    hire = left + random.randint(2, 18)  # 성장 중이면 입사율 > 퇴사율
    founded_y = random.randint(2008, 2022)
    age = 2026 - founded_y
    spp = random.randint(120, 420)
    sales = spp * emp
    rows.append(
        f"({i}, '{esc(name)}', '{esc(ind)}', '{esc(loc)}', '{founded_y}-{random.randint(1,12):02d}-01', "
        f"{age}, {emp}, {sal}, {hired}, {sales}, {spp}, {hire}, {left}, "
        f"'https://www.wanted.co.kr/company/{i}')"
    )
out.append("INSERT INTO companies (id, name, industry_name, address, founded_date, age, "
           "employee_count, average_salary, hired_salary, sales_amount, sales_per_person, "
           "hire_rate, left_rate, link) VALUES\n" + ",\n".join(rows) + ";")

# ── 공고 ──────────────────────────────────────────────
# 직군 가중치: 개발이 가장 많고 데이터 > 기획 > 디자인 > 마케팅
cat_weights = {518: 4.2, 517: 1.8, 507: 1.3, 511: 1.1, 523: 0.9}
title_patterns = {
    872: ["백엔드 엔지니어", "서버 개발자", "Java 백엔드 개발자", "플랫폼 서버 엔지니어"],
    669: ["프론트엔드 개발자", "웹 프론트엔드 엔지니어", "React 개발자"],
    677: ["iOS 개발자", "iOS 앱 엔지니어"],
    678: ["안드로이드 개발자", "Android 엔지니어"],
    665: ["DevOps 엔지니어", "SRE", "인프라 엔지니어"],
    1634: ["머신러닝 엔지니어", "ML 리서치 엔지니어", "AI 엔지니어"],
    1025: ["데이터 엔지니어", "데이터 플랫폼 엔지니어"],
    1024: ["데이터 분석가", "프로덕트 애널리스트"],
    895: ["프로덕트 디자이너", "UX/UI 디자이너"],
    899: ["브랜드 디자이너", "그래픽 디자이너"],
    876: ["프로덕트 매니저", "프로덕트 오너"],
    878: ["서비스 기획자", "전략 기획 매니저"],
    1030: ["퍼포먼스 마케터", "그로스 마케터"],
    1032: ["콘텐츠 마케터", "브랜드 마케터"],
}
sub_by_cat = {}
for sid, (cat, _t) in subcategories.items():
    sub_by_cat.setdefault(cat, []).append(sid)

N_JOBS = 190
job_rows, jt_rows = [], []
jid = 300001
for _ in range(N_JOBS):
    cat = random.choices(list(cat_weights), weights=cat_weights.values())[0]
    sub = random.choice(sub_by_cat[cat])
    base = random.choice(title_patterns[sub])
    prefix = random.choice(["", "", "", "시니어 ", "주니어 ", "리드 "])
    name = f"{prefix}{base}"
    comp = random.randint(1, len(company_defs))

    if prefix == "주니어 ":
        af, at_ = 0, random.choice([2, 3])
    elif prefix in ("시니어 ", "리드 "):
        af, at_ = random.choice([5, 7, 8]), 10
    else:
        af = random.choice([0, 0, 1, 2, 3, 3, 5])
        at_ = min(10, af + random.choice([3, 4, 5, 7]))
    emp_type = random.choices(["regular", "contract", "intern"], weights=[86, 8, 6])[0]
    if emp_type == "intern":
        af, at_ = 0, 1

    days_ago = min(89, int(random.triangular(0, 89, 18)))
    created = TODAY - timedelta(days=days_ago, hours=random.randint(0, 12))
    status = "close" if (days_ago > 55 and random.random() < 0.42) else "active"
    if status == "active" and random.random() < 0.72:
        due = f"'{(created + timedelta(days=random.randint(30, 75))).strftime('%Y-%m-%d')}'"
    elif status == "close":
        due = f"'{(TODAY - timedelta(days=random.randint(1, 20))).strftime('%Y-%m-%d')}'"
    else:
        due = "NULL"  # 상시
    reward = random.choice([500000, 700000, 1000000, 1000000, 1500000, 2000000])

    job_rows.append(
        f"({jid}, {comp}, '{esc(name)}', '{status}', {cat}, '{emp_type}', {af}, {at_}, "
        f"'{esc(company_defs[comp - 1][5])}', 'KR', {reward}, {reward // 2}, {reward // 2}, "
        f"'{dt(created)}', {due}, 'https://www.wanted.co.kr/wd/{jid}')"
    )
    pool = sub_skill_pool.get(sub, skill_pool[cat])
    n_skills = random.randint(2, 4)
    for tid in {sub, *random.sample(pool, min(n_skills, len(pool)))}:
        jt_rows.append(f"({jid}, {tid})")
    jid += 1

out.append("INSERT INTO jobs (id, company_id, name, status, category_tag_id, employment_type, "
           "annual_from, annual_to, location, country, reward_total, reward_recommender, "
           "reward_recommendee, created_at, due_time, url) VALUES\n" + ",\n".join(job_rows) + ";")
out.append("INSERT INTO job_tags (job_id, tag_id) VALUES\n" + ",\n".join(jt_rows) + ";")

out.append("COMMIT;")
print("\n".join(out))
