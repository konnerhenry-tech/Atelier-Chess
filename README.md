# Atelier Chess

Play chess against Stockfish, challenge other players online, review games move by move, solve puzzles and learn with an AI coach.

## Stack
Vite + React + TypeScript, chess.js, in-browser Stockfish (Web Worker), Express + `ws` server (`server.ts`), Firebase Auth/Firestore, Gemini coach.

## Run locally
```
npm install
cp .env.example .env   # add GEMINI_API_KEY for the coach
npm run dev
```

## Hosting note
The static build (`dist/`) is enough for play-vs-AI, analysis and puzzles. **Online multiplayer (`/ws`), the AI coach (`/api/coach`) and external account import (`/api/external-account`) need the Node server** (`server.ts`) and will not work on a static-only host such as plain Cloudflare static assets.
