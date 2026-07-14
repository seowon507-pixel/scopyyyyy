#!/usr/bin/env python3
"""Convert the certificate catalog CSV into a file:// friendly JS payload."""

import csv
import hashlib
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "db" / "certifications.csv"
OFFICIAL_SOURCE = ROOT / "db" / "official_certification_exam_info.csv"
OUTPUT = ROOT / "js" / "certifications.js"


def optional_number(value):
    if value == "":
        return None
    number = float(value)
    return int(number) if number.is_integer() else number


def clean(value):
    return re.sub(r"\s+", " ", (value or "")).strip()


def generated_id(name):
    digest = hashlib.sha1(name.encode("utf-8")).hexdigest()[:12]
    return f"NTQ-{digest.upper()}"


with SOURCE.open(encoding="utf-8-sig", newline="") as source:
    curated_rows = list(csv.DictReader(source))

curated_by_name = {row["name"]: row for row in curated_rows}
official_by_name = {}
if OFFICIAL_SOURCE.exists():
    with OFFICIAL_SOURCE.open(encoding="utf-8-sig", newline="") as source:
        for raw in csv.DictReader(source):
            name = clean(raw.get("종목명"))
            if not name:
                continue
            official_by_name.setdefault(name, {})[clean(raw.get("항목"))] = clean(raw.get("내용"))

rows = []
for name, fields in official_by_name.items():
    curated = curated_by_name.get(name, {})
    description = (
        fields.get("수행직무")
        or fields.get("개요")
        or fields.get("진로 및 전망")
        or "한국산업인력공단 국가기술자격"
    )
    rows.append({
        "id": curated.get("id") or generated_id(name),
        "name": name,
        "issuer": curated.get("issuer") or fields.get("실시기관명") or "한국산업인력공단",
        "type": curated.get("type") or "국가기술자격",
        "category": curated.get("category") or "국가기술자격",
        "applications_2024": curated.get("applications_2024", ""),
        "employer_preference_rate": curated.get("employer_preference_rate", ""),
        "employer_metric": curated.get("employer_metric", ""),
        "description": description[:320],
        "source_url": curated.get("source_url") or fields.get("실시기관 홈페이지") or "https://www.q-net.or.kr",
    })

# 국가전문자격·국가공인민간자격 등 공식 시험정보 파일에 없는 보강 항목을 더한다.
for curated in curated_rows:
    if curated["name"] not in official_by_name:
        rows.append(curated)

for row in rows:
    row["applications_2024"] = optional_number(row["applications_2024"])
    row["employer_preference_rate"] = optional_number(row["employer_preference_rate"])

payload = {
    "updatedAt": "2026-07-14",
    "popularityYear": 2024,
    "employerSurveyYear": 2021,
    "sources": [
        {
            "label": "한국산업인력공단 국가기술자격 종목별 시험정보",
            "url": "https://www.data.go.kr/data/3038404/fileData.do",
        },
        {
            "label": "2025 국가기술자격통계연보",
            "url": "https://webzine.hrdkorea.or.kr/section/press/view?id=13434",
        },
        {
            "label": "기업의 국가기술자격 우대 현황 조사",
            "url": "https://webzine.hrdkorea.or.kr/section/press/view?id=11066&page=1",
        },
    ],
    "items": sorted(rows, key=lambda row: row["name"]),
}

OUTPUT.write_text(
    "// db/certifications.csv에서 생성됨 — 직접 수정하지 말 것\n"
    f"window.SCOPY_CERTIFICATIONS = {json.dumps(payload, ensure_ascii=False, indent=2)};\n",
    encoding="utf-8",
)
print(f"OK → {OUTPUT} ({len(rows)} items)")
