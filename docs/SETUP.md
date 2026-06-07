# Setup

## 요구사항
- Node.js 20+
- npm
- Windows 또는 macOS

## 설치
```bash
npm install
copy .env.example .env
```

## 개발 실행
```bash
npm run dev
```

## 검증
```bash
npm run lint
npm run test
npm run build
```

## 설치 파일 생성
```bash
npm run dist      # 현재 OS용 패키지
npm run dist:win  # Windows NSIS installer
npm run dist:mac  # macOS DMG/ZIP
npm run dist:mac:x64    # Intel Mac
npm run dist:mac:arm64  # Apple Silicon Mac
```
