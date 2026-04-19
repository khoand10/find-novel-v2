# findnovel-v2

Starter project for `Node.js 18 + Express.js + MongoDB + Redis + JavaScript`.

## Requirements

- Node.js `18.x`
- npm `>= 9`
- Docker (optional, for local MongoDB/Redis)

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Create environment file:

```bash
cp .env.example .env
```

3. Start MongoDB and Redis (optional):

```bash
docker compose up -d
```

4. Run development server:

```bash
npm run dev
```

## Scripts

- `npm run dev`: run app in watch mode.
- `npm start`: run app.

## Health Endpoints

- `GET /`: simple service message.
- `GET /api/health`: service health with MongoDB and Redis status.

## Crawler Endpoints (FindNovel Only)

- `POST /api/crawler/findnovel/novel-by-url`
  - Body: `{ "novelUrl": "https://findnovel.net/book/..." }`
- Optional body:
  - `crawlChapters` (default `true`)
  - `urlStart` (default `null`)
  - `maxChapters` (default `0`, nghia la khong gioi han)
## Optional Telegram Alerts

- `TELEGRAM_ENABLED=false`
- `TELEGRAM_BOT_TOKEN=`
- `TELEGRAM_CHAT_ID=`

## Refactor Plan

- See `docs/findnovel-refactor-plan.md`.
