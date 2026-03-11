# DesktopCal Sync

Windows 데스크톱 위젯 스타일 캘린더 앱입니다.  
로컬(SQLite) 우선으로 일정 데이터를 관리하고, Google Calendar와 양방향 동기화합니다.

## 주요 기능

- 월간 캘린더 + 날짜별 일정 보기
- 일정 CRUD (생성/수정/삭제)
- Google OAuth 로그인 및 양방향 동기화
- OpenClaw 연동 자연어 일정 등록
  - `reply + signals(create_event)` 형태 응답 처리
  - 캘린더 자동 분류(취업/공부/일정) 및 기본 `일정` 우선
- 코테 타이머
  - 시작/일시정지/재개/완료/중단
  - 저장(세션 보관) / 이어하기 / 삭제
  - 저장 목록 팝업(진행중/완료 탭)
  - 앱 재시작 후에도 저장 목록 유지

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
  main/      # DB, IPC, 동기화, 타이머, 오버레이
  preload/   # renderer <-> main bridge
src/
  app/       # App, TimerOverlayApp
  components/# UI 컴포넌트
shared/      # IPC 채널, 공용 타입
db/
  migrations/
```

## 실행 방법

```bash
npm install
npm run dev
```

- `dev`: Vite + Electron 개발 실행 (핫 리로드)

## 빌드/실행

```bash
npm run build
npm run start
```

- `start`: 최신 renderer/electron 빌드 후 Electron 실행

## 배포(설치파일 생성)

```bash
npm run dist
```

생성 경로:

- `release/DesktopCal Sync Setup 1.0.0.exe`
- `release/win-unpacked/`

## 환경 변수

루트에 `.env` 파일을 생성해 설정합니다.

```env
# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_PORT=42813

# OpenClaw
OPENCLAW_CHAT_URL=http://your-openclaw-endpoint
OPENCLAW_MODEL=openclaw:main
OPENCLAW_API_KEY=
```

## OpenClaw 응답 계약(권장)

일정 자동 등록을 안정적으로 사용하려면 OpenClaw 응답을 아래 형식으로 고정하세요.

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
- 앱은 `reply`를 표시하고, `signals`를 실행합니다.

## 테스트/검증

```bash
npm run lint
npm run test
npm run build
```

## 참고

- 캘린더가 여러 개면 `calendarId`/`calendarTitle` 우선으로 라우팅합니다.
- 중단 버튼은 확인 팝업이 뜨며, `네` 선택 시 저장 없이 종료됩니다.
