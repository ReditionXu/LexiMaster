// Vercel Function: POST /api/ai/{test|generate|explain|report}
// Stateless: the user's provider config (incl. API key) arrives in each request body,
// is used for that single upstream call and is never stored, logged or cached.
import { createAIHandler } from '../../server/ai/handler.mjs';

const handler = createAIHandler();

export default function aiTask(req, res) {
  return handler(req, res);
}
