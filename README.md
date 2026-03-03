# DesktopCal Sync (Electron + React + TypeScript)

DesktopCal 스타일의 Windows 설치형 캘린더 앱 MVP입니다.  
로컬 SQLite를 즉시 렌더링 소스로 사용하고, Google Calendar와 양방향 동기화합니다.

## 기술 스택

- Electron (main/preload)
- React + TypeScript + Vite (renderer)
- TailwindCSS
- better-sqlite3 (local-first DB)
- Zustand
- React Query
- Zod
- dayjs
- electron-store
- electron-builder

## 주요 기능

- 월간 그리드(큰 날짜 셀)
- 날짜 더블클릭으로 일정 추가
- 일정 CRUD
- 날짜 셀 미리보기(+more)
- Google OAuth2 로그인
- 선택 캘린더 기준 양방향 동기화
- sync_queue 기반 재시도(backoff)
- 시스템 트레이 / 트레이 최소화
- 시작프로그램 옵션 / 바탕화면 고정 옵션
- 다크/라이트 + 강조 색상

## 실행 방법

```bash
npm install
npm run dev
```

## 빌드 / 배포

```bash
npm run build
npm run dist
```

출력물은 `release/`에 생성됩니다.

## Google OAuth 설정

1. Google Cloud Console 프로젝트 생성
2. Google Calendar API 활성화
3. OAuth 동의 화면 구성
4. OAuth Client ID 생성: `Desktop app`
5. `.env` 생성

```bash
copy .env.example .env
```

`.env` 예시:

```env
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_PORT=42813
```

## DB 스키마

`db/migrations/001_init.sql`

- users
- calendars
- events (soft delete: `deleted_at`)
- sync_state
- sync_queue
- app_settings

## 검증 명령

```bash
npm run lint
npm run test
npm run build
```

## 알려진 제한사항 (MVP)

- 캘린더 권한 세분화(읽기/쓰기 분리) 미구현
- Google incremental sync token 만료 처리 단순화
- 트레이 아이콘은 임시 내장 아이콘
- 통합 테스트는 mock 기반 최소 검증 수준

## 다음 로드맵

1. Google push 알림(webhook 대체 전략) 반영
2. 동기화 충돌 UI(수동 선택) 추가
3. 반복 일정 RRULE 고급 편집
4. 드래그앤드롭 일정 이동
