# Architecture

## 구성
- Electron Main/Preload
- React Renderer (Vite)
- SQLite(better-sqlite3)

## 흐름
1. 사용자 입력 → Renderer 상태 업데이트
2. DB 반영(로컬 즉시 반영)
3. sync_queue 등록
4. 백그라운드 동기화 워커가 Google Calendar와 동기화
