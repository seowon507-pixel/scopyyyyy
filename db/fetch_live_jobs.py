#!/usr/bin/env python3
"""원티드 실 API에서 활성 공고 전체 목록 + 직군별 전수 공고 수를 가져와 JSON을 출력한다.

'시장 개요·공고 탐색·기업 비교·북마크·추천' 화면은 이 실 데이터를 쓴다.
기업 인사이트 API에서 권한이 없는 지표는 가상 값으로 채우지 않고 화면에서 제외한다.

출력 형식: {"category_totals": {"518": {"title": "개발", "total": N}, ...},
            "jobs": [...]}
- category_totals: 직군별 실제 진행중 공고 총량 (offset 이진탐색으로 전수 집계)
- jobs: V2 전체 활성 공고. 직군당 DETAIL_PER_CATEGORY건은 V1 상세 정보로 추가 보강

사용법: python3 fetch_live_jobs.py > live.json
        (export_data.sh가 실행 시 자동으로 호출해 js/data.js에 병합함)
"""
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = "https://openapi.wanted.jobs"
# /v1/tags/categories 실제 직군 ID (2026-07-13 확인)
CATEGORIES = {
    518: "개발", 507: "경영·비즈니스", 523: "마케팅·광고", 511: "디자인",
    517: "HR", 530: "영업", 513: "엔지니어링·설계", 524: "미디어",
}
DETAIL_PER_CATEGORY = 25
PAGE_SIZE = 20
LIST_WORKERS = 6
MAX_TOTAL = 20000  # 직군별 전수 집계 상한 (이진탐색 캡)


def load_env():
    env = dict(os.environ)
    path = os.path.join(ROOT, ".env")
    if os.path.exists(path):
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                env.setdefault(k.strip(), v.strip())
    return env


ENV = load_env()
HEADERS = {
    "wanted-client-id": ENV.get("WANTED_CLIENT_ID", ""),
    "wanted-client-secret": ENV.get("WANTED_CLIENT_SECRET", ""),
}


def get(path, params=None):
    url = BASE + path
    if params:
        url += "?" + urllib.parse.urlencode(params, doseq=True)
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.load(resp)


def won_to_int(s):
    digits = re.sub(r"[^0-9]", "", s or "")
    return int(digits) if digits else 0


def has_job_at(cat_id, offset):
    """offset 위치에 공고가 존재하는지 (전수 집계용 프로브)."""
    try:
        data = get("/v2/jobs", {"category_tag": cat_id, "limit": 1, "offset": offset})
        return bool(data.get("data"))
    except urllib.error.HTTPError:
        return False


def count_category_total(cat_id):
    """직군의 진행중 공고 총량을 offset 이진탐색으로 구한다 (요청 ~15회)."""
    if not has_job_at(cat_id, 0):
        return 0
    lo, hi = 1, 64
    while hi < MAX_TOTAL and has_job_at(cat_id, hi):
        lo, hi = hi, hi * 2
    hi = min(hi, MAX_TOTAL)
    # 불변식: offset lo-1 존재, offset hi 없음 → 총량 ∈ [lo, hi]
    while lo < hi:
        mid = (lo + hi) // 2
        if has_job_at(cat_id, mid):
            lo = mid + 1
        else:
            hi = mid
    return lo


def fetch_list_page(cat_id, offset):
    data = get("/v2/jobs", {"category_tag": cat_id, "limit": PAGE_SIZE, "offset": offset})
    return cat_id, offset, [row for row in data.get("data", []) if row.get("status") == "active"]


def fetch_all_listings(totals):
    """직군별 V2 목록을 전부 가져온다. 상세 API는 별도 표본에만 호출한다."""
    tasks = []
    for cat_id in CATEGORIES:
        total = totals.get(str(cat_id), {}).get("total", 0)
        tasks.extend((cat_id, offset) for offset in range(0, total, PAGE_SIZE))

    pages = {}
    with ThreadPoolExecutor(max_workers=LIST_WORKERS) as pool:
        futures = {pool.submit(fetch_list_page, cat_id, offset): (cat_id, offset) for cat_id, offset in tasks}
        for completed, future in enumerate(as_completed(futures), 1):
            cat_id, offset = futures[future]
            try:
                _, _, rows = future.result()
                pages[(cat_id, offset)] = rows
            except (urllib.error.HTTPError, urllib.error.URLError) as exc:
                print(f"[fetch_live_jobs] 목록 페이지 실패: category={cat_id} offset={offset} ({exc})", file=sys.stderr)
            if completed % 50 == 0:
                print(f"[fetch_live_jobs] 목록 {completed}/{len(tasks)} 페이지", file=sys.stderr)

    listings, seen = [], set()
    for cat_id in CATEGORIES:
        total = totals.get(str(cat_id), {}).get("total", 0)
        for offset in range(0, total, PAGE_SIZE):
            for row in pages.get((cat_id, offset), []):
                if row.get("id") in seen:
                    continue
                seen.add(row.get("id"))
                listings.append(row)
    return listings


def tag_title(tag):
    return (tag or {}).get("title") or (tag or {}).get("text") or ""


def build_list_job(row):
    company = row.get("company") or {}
    category = row.get("category_tags") or {}
    parent = category.get("parent_tag") or {}
    children = category.get("child_tags") or []
    address = row.get("address") or {}
    reward = row.get("reward") or {}
    logo = row.get("logo_img") or company.get("logo_img") or {}
    attractions = [tag_title(tag) for tag in company.get("company_tags", []) if tag_title(tag)]
    return {
        "id": row.get("id"),
        "company_id": company.get("id"),
        "company_name": company.get("name") or "기업 정보 없음",
        "company_link": company.get("link") or (f"https://www.wanted.co.kr/company/{company['id']}" if company.get("id") else ""),
        "company_logo": logo.get("thumb") or logo.get("origin"),
        "name": row.get("name") or row.get("position") or "공고명 없음",
        "status": row.get("status"),
        "category_tag_id": parent.get("id"),
        "category_title": tag_title(parent),
        "subcategory_titles": json.dumps([tag_title(tag) for tag in children if tag_title(tag)], ensure_ascii=False),
        "skill_titles": "[]",
        "attraction_titles": json.dumps(attractions, ensure_ascii=False),
        "employment_type": row.get("employment_type") or "regular",
        "annual_from": None,
        "annual_to": None,
        "location": address.get("location", ""),
        "full_location": address.get("full_location") or address.get("location", ""),
        "country": "KR",
        "reward_total": won_to_int(reward.get("total")),
        "due_time": row.get("due_time"),
        "url": row.get("url"),
    }


def build_job(stub, d):
    if not d or d.get("status") != "active":
        return None
    cat = d["category_tags"]["parent_tag"]
    subs = [tag_title(t) for t in d["category_tags"].get("child_tags", [])]
    skills = [tag_title(t) for t in d.get("skill_tags", [])]
    company = d["company"]
    attractions = [tag_title(t) for t in company.get("company_tags", [])]
    reward = d.get("reward") or {}
    address = d.get("address") or {}
    logo = company.get("logo_img") or {}
    return {
        "id": d["id"],
        "company_id": company["id"],
        "company_name": company["name"],
        "company_link": company.get("link") or f"https://www.wanted.co.kr/company/{company['id']}",
        "company_logo": logo.get("thumb") or logo.get("origin"),
        "name": d["detail"]["name"],
        "status": d["status"],
        "category_tag_id": cat["id"],
        "category_title": tag_title(cat),
        "subcategory_titles": json.dumps(subs, ensure_ascii=False),
        "skill_titles": json.dumps(skills, ensure_ascii=False),
        "attraction_titles": json.dumps(attractions, ensure_ascii=False),
        "employment_type": stub.get("employment_type") or "regular",
        "annual_from": d.get("annual_from", 0),
        "annual_to": d.get("annual_to", 10),
        "location": address.get("location", ""),
        "full_location": address.get("full_location") or address.get("location", ""),
        "country": "KR",
        "reward_total": won_to_int(reward.get("total")),
        "due_time": d.get("due_time"),
        "url": d.get("url"),
    }


def main():
    if not HEADERS["wanted-client-id"] or not HEADERS["wanted-client-secret"]:
        print("[fetch_live_jobs] WANTED_CLIENT_ID/SECRET 없음 — .env 확인", file=sys.stderr)
        print(json.dumps({"category_totals": {}, "jobs": []}))
        return

    totals = {}
    for cat_id, title in CATEGORIES.items():
        try:
            total = count_category_total(cat_id)
        except urllib.error.URLError as e:
            print(f"[fetch_live_jobs] {title} 전수 집계 실패: {e}", file=sys.stderr)
            total = 0
        totals[str(cat_id)] = {"title": title, "total": total}
        print(f"[fetch_live_jobs] {title}: 진행중 공고 {total}건", file=sys.stderr)

    try:
        listings = fetch_all_listings(totals)
    except urllib.error.URLError as e:
        print(f"[fetch_live_jobs] 목록 조회 실패: {e}", file=sys.stderr)
        print(json.dumps({"category_totals": totals, "jobs": []}, ensure_ascii=False))
        return

    jobs = [build_list_job(row) for row in listings]
    job_index = {job["id"]: index for index, job in enumerate(jobs)}
    detail_candidates, category_counts = [], {}
    for row in listings:
        parent = (row.get("category_tags") or {}).get("parent_tag") or {}
        cat_id = parent.get("id")
        if category_counts.get(cat_id, 0) >= DETAIL_PER_CATEGORY:
            continue
        category_counts[cat_id] = category_counts.get(cat_id, 0) + 1
        detail_candidates.append({"id": row["id"], "employment_type": row.get("employment_type")})

    print(f"[fetch_live_jobs] 전체 목록 {len(jobs)}건 · 상세 보강 후보 {len(detail_candidates)}건", file=sys.stderr)
    for i, stub in enumerate(detail_candidates):
        try:
            d = get(f"/v1/jobs/{stub['id']}")
        except urllib.error.HTTPError as e:
            print(f"[fetch_live_jobs] {stub['id']} 상세 조회 실패: {e}", file=sys.stderr)
            continue
        job = build_job(stub, d)
        if job:
            jobs[job_index[job["id"]]] = job
        if (i + 1) % 40 == 0:
            print(f"[fetch_live_jobs] 상세 {i + 1}/{len(detail_candidates)}", file=sys.stderr)

    print(f"[fetch_live_jobs] 완료 — 활성 공고 전체 목록 {len(jobs)}건", file=sys.stderr)
    print(json.dumps({"category_totals": totals, "jobs": jobs}, ensure_ascii=False))


if __name__ == "__main__":
    main()
