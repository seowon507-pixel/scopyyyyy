# Supabase 데모 사용자 시드

이 시드는 Supabase Auth 테스트 사용자 3명과 각 사용자의 `user_workspaces` 데이터를 함께 만든다.

## 사전 작업

1. 프로젝트 관리자가 `supabase/migrations/202607150001_user_workspaces.sql`을 SQL Editor에서 실행한다.
2. 서비스 역할 키는 Git에 저장하지 않고 실행하는 터미널의 환경 변수로만 전달한다.
3. 아래 명령은 Supabase 프로젝트 관리자만 실행한다.

## 데이터 확인만 하기

```bash
node supabase/seed/seed-demo-users.mjs
```

## 실제 Supabase에 생성하기

```bash
SUPABASE_URL="프로젝트 URL" \
SUPABASE_SERVICE_ROLE_KEY="관리자 서비스 역할 키" \
node supabase/seed/seed-demo-users.mjs --apply
```

같은 이메일이 이미 있으면 비밀번호와 사용자 메타데이터를 갱신하고 작업공간을 덮어쓴다. 따라서
반복 실행할 수 있다. 이 계정과 비밀번호는 데모 전용이며 실제 개인정보나 운영 계정에 사용하면 안 된다.

## 데모 케이스

| 케이스 | 직무 | 이메일 |
|---|---|---|
| 취준생 | 백엔드 개발자 | `jobseeker.demo@scopy.test` |
| 대학교 1학년·진로 탐색 | 콘텐츠 마케터 | `freshman.demo@scopy.test` |
| 취업자·이직 준비 | 프로덕트 매니저 | `changer.demo@scopy.test` |
