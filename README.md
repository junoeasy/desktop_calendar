# DesktopCal Sync

Windows 데스크톱 스타일 캘린더 앱입니다.  
로컬(SQLite) 우선 구조로 일정을 관리하고 Google Calendar와 양방향 동기화합니다.

## 주요 기능

- 월간 캘린더 + 날짜별 일정 보기
- 일정 CRUD (생성/수정/삭제)
- Google OAuth 로그인 및 동기화
- OpenClaw 연동 자연어 일정 등록
  - `reply + signals(create_event)` 응답 처리
  - 캘린더 자동 분류(취업/공부/일정)
- 코딩테스트 타이머
  - 시작/일시정지/재개/완료/중단
  - 세션 저장/복원/삭제
  - 오버레이 창 표시

## 기술 스택

- Electron (main / preload)
- React + TypeScript + Vite
- Tailwind CSS
- better-sqlite3
- React Query / Zustand
- Zod
- electron-store
- electron-builder

## 프로젝트 구조

```text
electron/
  main/      # DB, IPC, 동기화, 인증, 타이머, 업데이트
  preload/   # renderer <-> main bridge
src/
  app/       # App, TimerOverlayApp
  components/# UI 컴포넌트
shared/      # IPC 채널/공용 타입
db/
  migrations/
```

## 실행 방법

```bash
npm install
npm run dev
```

- `dev`: Vite + Electron 개발 실행

## 빌드/실행

```bash
npm run build
npm run start
```

- `start`: 최신 renderer/electron 빌드 후 Electron 실행

## 배포(설치 파일 생성)

```bash
npm run dist
```

생성 경로:

- `release/DesktopCal Sync Setup <version>.exe`
- `release/win-unpacked/`

## 공개 앱 설정

Google OAuth의 공통 `client_id`는 `config/app.public.json`에서 관리합니다.

```json
{
  "googleClientId": "YOUR_GOOGLE_DESKTOP_CLIENT_ID.apps.googleusercontent.com",
  "googleClientSecret": "YOUR_GOOGLE_DESKTOP_CLIENT_SECRET",
  "googleRedirectPort": 42813
}
```

- 이 파일은 빌드 산출물에 포함됩니다.
- `client_id`는 공개값이므로 파일에 포함되어도 됩니다.

## 환경 변수

루트에 `.env` 파일을 생성해 설정합니다. (개발/운영 환경 값)

```env
# OpenClaw endpoint (개발/로컬 테스트용)
OPENCLAW_CHAT_URL=http://your-openclaw-endpoint
OPENCLAW_MODEL=openclaw:main

# Auto update (개발/로컬 테스트용)
AUTO_UPDATE_URL=
```

## OpenClaw 응답 계약(권장)

일정 자동 등록을 안정적으로 사용하려면 아래 JSON 형식을 권장합니다.

```json
{
  "reply": "사용자에게 보여줄 답변",
  "signals": [
    {
      "kind": "create_event",
      "payload": {
        "title": "테스트 일정",
        "startsAt": "2026-03-11T09:00:00+09:00",
        "endsAt": "2026-03-11T10:00:00+09:00",
        "allDay": false,
        "description": null,
        "location": null,
        "calendarId": null,
        "calendarTitle": "일정"
      }
    }
  ]
}
```

- 일반 대화: `signals: []`
- 일정 생성: `signals[].kind === "create_event"`

## 테스트 검증

```bash
npm run lint
npm run test
npm run build
```

## Auto Update (electron-updater)

- `AUTO_UPDATE_URL`은 로컬/개발 테스트용으로 사용하세요.
- `.env`를 배포 바이너리에 포함하지 마세요.
- 패키징된 앱은 시작 시 업데이트 확인을 수행합니다.

## GitHub Releases 배포

- 업데이트 업로드 대상: `junoeasy/desktop_calendar`
- CI 배포 시에는 GitHub Actions Secret(`GITHUB_TOKEN` 또는 `GH_TOKEN`)을 사용하세요.
- `npm run dist:publish`로 설치 파일과 `latest.yml`을 업로드합니다.

## 보안 참고

- 클라이언트 앱 `.env`에는 비밀 API 키를 넣지 않는 것을 권장합니다.
- 외부 API 비밀키는 백엔드 프록시/서버 환경변수에서 관리하세요.
