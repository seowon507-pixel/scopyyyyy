const txtFile = (name, content) => ({
  fileName: name,
  fileType: "text/plain",
  fileData: `data:text/plain;charset=utf-8;base64,${Buffer.from(content, "utf8").toString("base64")}`,
});

const workspace = ({ certifications, activities, education, careers, projects, skills, links, preferences, coverLetters, resume, applications }) => ({
  "scopy-certifications": JSON.stringify(certifications),
  "scopy-activities": JSON.stringify(activities),
  "scopy-education": JSON.stringify(education),
  "scopy-careers": JSON.stringify(careers),
  "scopy-projects": JSON.stringify(projects),
  "scopy-skills": JSON.stringify(skills),
  "scopy-profile-links": JSON.stringify(links),
  "scopy-preferred-categories": JSON.stringify(preferences),
  "scopy-coverletters": JSON.stringify(coverLetters),
  "scopy-resume-profile": JSON.stringify(resume),
  "scopy-applications": JSON.stringify(applications),
  "scopy-bookmarks": "[]",
  "scopy-recent-views": "[]",
});

const application = (id, status, company, name, category, dueTime, appliedAt, note) => ({
  id,
  jobId: `demo-${id}`,
  job: {
    id: `demo-${id}`,
    name,
    company_name: company,
    due_time: dueTime,
    url: "https://www.wanted.co.kr/",
    category_title: category,
  },
  status,
  appliedAt,
  note,
  createdAt: id,
  updatedAt: id,
});

const seekerCover = `백엔드 개발자로 성장하기 위해 Java와 Spring Boot를 중심으로 학습했습니다.
팀 프로젝트에서는 사용자 인증과 주문 API를 담당했고, 쿼리 개선으로 평균 응답 시간을 줄였습니다.
인턴 경험을 통해 코드 리뷰와 협업 규칙의 중요성을 배웠으며 안정적인 서비스를 만드는 개발자가 되고 싶습니다.`;

const freshmanCover = `사람들이 어떤 이야기에 관심을 갖고 행동하는지 관찰하는 것을 좋아해 콘텐츠 마케팅 직무를 탐색하고 있습니다.
아직 구체적인 경력 방향을 정하는 단계이지만 학과 행사 홍보에서 카드뉴스 기획과 설문조사를 경험했습니다.
앞으로 교내 홍보단과 브랜드 공모전 활동을 통해 글쓰기, 콘텐츠 성과 분석, 협업 경험을 차근차근 쌓고 싶습니다.`;

const changerCover = `B2B SaaS 서비스 운영과 데이터 기반 기능 개선을 담당해 왔습니다.
고객 문의와 이용 데이터를 분석해 온보딩 이탈 구간을 찾고, 개발·디자인 조직과 개선안을 실행했습니다.
다음 조직에서는 더 큰 사용자 문제를 정의하고 제품 지표의 변화까지 책임지는 프로덕트 매니저로 성장하고자 합니다.`;

export const DEMO_USERS = [
  {
    persona: "취준생",
    displayName: "김도윤",
    targetRole: "백엔드 개발자",
    email: "jobseeker.demo@scopy.test",
    password: "ScopyDemo!2026-Job",
    payload: workspace({
      certifications: [
        { id: 1101, name: "정보처리기사", issuer: "한국산업인력공단", date: "2026-05-20", type: "국가기술자격", category: "정보통신" },
        { id: 1102, name: "SQL 개발자(SQLD)", issuer: "한국데이터산업진흥원", date: "2025-12-12", type: "국가공인민간자격", category: "데이터" },
        { id: 1103, name: "AWS Certified Cloud Practitioner", issuer: "Amazon Web Services", date: "2026-03-08", type: "국제자격", category: "클라우드" },
      ],
      activities: [
        { id: 1201, type: "인턴", title: "커머스 플랫폼 백엔드 개발 인턴", org: "데모커머스", date: "2026-02-28" },
        { id: 1202, type: "교육", title: "클라우드 기반 웹 개발 부트캠프", org: "청년개발아카데미", date: "2025-11-30" },
        { id: 1203, type: "공모전", title: "공공데이터 활용 서비스 경진대회 우수상", org: "한국데이터진흥원", date: "2025-09-14" },
      ],
      education: [{ id: 1301, school: "한국대학교", major: "컴퓨터공학과", status: "졸업예정" }],
      careers: [{ id: 1401, company: "데모커머스", position: "백엔드 개발 인턴", start: "2025-12", end: "2026-02", summary: "주문 조회 API와 관리자 배치 기능을 개발하고 테스트 코드를 작성했습니다." }],
      projects: [
        { id: 1501, title: "동네 공동구매 플랫폼", role: "백엔드·팀장", period: "2025.07–2025.10", result: "Spring Boot 기반 인증·주문 API를 구현하고 인덱스 개선으로 평균 응답 시간을 35% 줄였습니다." },
        { id: 1502, title: "채용공고 기술스택 분석기", role: "데이터 수집·API", period: "2026.03–2026.05", result: "공고 데이터를 직무별로 정리하고 FastAPI 검색 API와 대시보드를 제작했습니다." },
      ],
      skills: ["Java", "Spring Boot", "MySQL", "Redis", "Docker", "GitHub Actions"],
      links: [
        { id: 1601, label: "GitHub", url: "https://github.com/scopy-demo-jobseeker" },
        { id: 1602, label: "기술 블로그", url: "https://example.com/jobseeker-blog" },
      ],
      preferences: ["518", "513", "507"],
      coverLetters: [{ id: 1701, title: "백엔드 개발자 지원 자소서", content: seekerCover, updatedAt: 1782860400000, ...txtFile("backend-cover-letter.txt", seekerCover) }],
      resume: { name: "김도윤", email: "jobseeker.demo@scopy.test", phone: "010-1000-1001", targetRole: "백엔드 개발자", summary: "API 성능 개선과 안정적인 배포 경험을 갖춘 신입 백엔드 개발자입니다.", includeCoverLetter: false },
      applications: [
        application(1801, "interview", "테크웨이브", "주니어 백엔드 개발자", "개발", "2026-08-20", "2026-07-03", "7월 22일 기술 면접 · 프로젝트 성능 개선 사례 준비"),
        application(1802, "applied", "그린커머스", "커머스 플랫폼 서버 개발자", "개발", "2026-08-31", "2026-07-10", "코딩테스트 안내 대기"),
        application(1803, "planned", "클라우드박스", "신입 Java 개발자", "개발", "2026-09-05", "", "지원 전 이력서 프로젝트 순서 수정"),
      ],
    }),
  },
  {
    persona: "대학교 1학년·진로 탐색",
    displayName: "박서연",
    targetRole: "콘텐츠 마케터",
    email: "freshman.demo@scopy.test",
    password: "ScopyDemo!2026-Uni",
    payload: workspace({
      certifications: [{ id: 2101, name: "컴퓨터활용능력 2급", issuer: "대한상공회의소", date: "2026-05-16", type: "국가기술자격", category: "사무" }],
      activities: [
        { id: 2201, type: "교육", title: "대학생을 위한 SNS 콘텐츠 기획 워크숍", org: "교내 취업지원센터", date: "2026-04-18" },
        { id: 2202, type: "대외활동", title: "학과 신입생 행사 홍보팀", org: "한국대학교", date: "2026-06-12" },
      ],
      education: [{ id: 2301, school: "한국대학교", major: "국어국문학과", status: "재학" }],
      careers: [],
      projects: [{ id: 2501, title: "학과 신입생 행사 홍보", role: "카드뉴스 기획·설문조사", period: "2026.04–2026.06", result: "재학생 설문 42건을 바탕으로 카드뉴스 6편을 제작하고 행사 신청자 120명을 모집했습니다." }],
      skills: ["글쓰기", "SNS 콘텐츠 기획", "Canva", "PowerPoint", "설문조사", "엑셀 기초"],
      links: [{ id: 2601, label: "콘텐츠 모음", url: "https://example.com/freshman-marketing-portfolio" }],
      preferences: ["523", "524", "507"],
      coverLetters: [{ id: 2701, title: "콘텐츠 마케팅 진로 탐색 소개서", content: freshmanCover, updatedAt: 1782860500000, ...txtFile("content-marketing-exploration.txt", freshmanCover) }],
      resume: { name: "박서연", email: "freshman.demo@scopy.test", phone: "010-1000-1002", targetRole: "콘텐츠 마케터", summary: "글쓰기와 사람들의 반응 분석을 바탕으로 콘텐츠 마케팅을 탐색 중인 국문학 전공 1학년입니다.", includeCoverLetter: false },
      applications: [application(2801, "planned", "캠퍼스메이커스", "대학생 콘텐츠 홍보 서포터즈", "마케팅·광고", "2026-08-15", "", "지원 전에 행사 홍보 결과와 카드뉴스를 한 장으로 정리")],
    }),
  },
  {
    persona: "취업자·이직 준비",
    displayName: "이현우",
    targetRole: "프로덕트 매니저",
    email: "changer.demo@scopy.test",
    password: "ScopyDemo!2026-Move",
    payload: workspace({
      certifications: [
        { id: 3101, name: "데이터분석 준전문가(ADsP)", issuer: "한국데이터산업진흥원", date: "2024-06-07", type: "국가공인민간자격", category: "데이터" },
        { id: 3102, name: "SQL 개발자(SQLD)", issuer: "한국데이터산업진흥원", date: "2023-09-15", type: "국가공인민간자격", category: "데이터" },
        { id: 3103, name: "Google Analytics Certification", issuer: "Google", date: "2025-02-11", type: "민간자격", category: "마케팅·분석" },
      ],
      activities: [
        { id: 3201, type: "교육", title: "프로덕트 데이터 분석 심화 과정", org: "프로덕트스쿨", date: "2025-10-25" },
        { id: 3202, type: "대외활동", title: "B2B SaaS PM 커뮤니티 운영진", org: "PM 네트워크", date: "2026-06-30" },
      ],
      education: [{ id: 3301, school: "서울비즈니스대학교", major: "경영정보학과", status: "졸업" }],
      careers: [
        { id: 3401, company: "워크플로우랩", position: "프로덕트 매니저", start: "2023-03", end: "", summary: "B2B SaaS 온보딩과 협업 기능을 담당했습니다. 활성화율을 18% 개선하고 고객 문의를 24% 줄였습니다." },
        { id: 3402, company: "마켓인사이트", position: "서비스 운영 매니저", start: "2021-07", end: "2023-02", summary: "사용자 문의와 운영 데이터를 분석해 반복 업무 자동화 정책을 기획했습니다." },
      ],
      projects: [
        { id: 3501, title: "B2B 온보딩 개편", role: "PM", period: "2025.01–2025.05", result: "퍼널 분석과 고객 인터뷰를 바탕으로 초기 설정 흐름을 개편해 14일 활성화율을 18% 높였습니다." },
        { id: 3502, title: "고객 요청 우선순위 체계", role: "PM·데이터 분석", period: "2024.06–2024.09", result: "요청 유형과 고객 등급을 결합한 점수 체계를 도입해 분기 로드맵 의사결정 시간을 단축했습니다." },
      ],
      skills: ["Product Discovery", "SQL", "Amplitude", "GA4", "Jira", "Figma", "이해관계자 관리"],
      links: [
        { id: 3601, label: "경력 포트폴리오", url: "https://example.com/pm-portfolio" },
        { id: 3602, label: "LinkedIn", url: "https://www.linkedin.com/in/scopy-demo-changer" },
      ],
      preferences: ["507", "523", "518"],
      coverLetters: [{ id: 3701, title: "프로덕트 매니저 이직 자소서", content: changerCover, updatedAt: 1782860600000, ...txtFile("pm-career-cover-letter.txt", changerCover) }],
      resume: { name: "이현우", email: "changer.demo@scopy.test", phone: "010-1000-1003", targetRole: "프로덕트 매니저", summary: "B2B SaaS에서 제품 발견부터 지표 개선까지 수행한 5년 차 서비스·제품 기획자입니다.", includeCoverLetter: false },
      applications: [
        application(3801, "document", "플로우데이터", "B2B 프로덕트 매니저", "경영·비즈니스", "2026-08-18", "2026-07-08", "과제 전형 제출 완료 · 결과 대기"),
        application(3802, "applied", "핀테크브릿지", "Product Manager", "경영·비즈니스", "2026-08-29", "2026-07-12", "리크루터 연락 경로 기록"),
        application(3803, "planned", "그로스클라우드", "Senior Product Manager", "경영·비즈니스", "2026-09-10", "", "영문 경력기술서 보완 후 지원"),
      ],
    }),
  },
];
