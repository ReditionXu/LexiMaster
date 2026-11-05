// Vercel Function: GET /api/health
// Reuses the same handler as `npm run dev` / `npm start` — one implementation everywhere.
import { createAIHandler } from '../server/ai/handler.mjs';

const handler = createAIHandler();

export default function health(req, res) {
  return handler(req, res);
}
