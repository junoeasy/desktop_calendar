# Desktop Calendar

Electron 기반 데스크탑 캘린더 앱입니다.  
Google Calendar 연동(OAuth 2.0)으로 내 일정을 가져와 보여줍니다.

## 1. 준비

1. Google Cloud Console에서 프로젝트 생성
2. `Google Calendar API` 활성화
3. OAuth 동의 화면 설정
4. OAuth 클라이언트 생성: `Desktop app`
5. 클라이언트 정보에서 `Client ID`, `Client Secret` 확인

## 2. 환경 변수 설정

`.env.example`을 `.env`로 복사 후 값 입력:

```bash
copy .env.example .env
```

```env
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_PORT=42813
```

## 3. 실행

```bash
npm install
npm run start
```

## 4. 기능

- 월간 캘린더 렌더링
- Google 로그인 / 로그아웃
- 다가오는 일정 조회

## 5. 참고

- 토큰은 OS 사용자 데이터 폴더(`app.getPath("userData")`)에 저장됩니다.
- 첫 로그인 시 브라우저가 열리고 권한 승인 후 자동으로 앱에 연결됩니다.
