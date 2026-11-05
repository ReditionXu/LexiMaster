# Changelog

## 3.0.0
- AI: settings page, same-origin proxy with OpenAI / Anthropic / Gemini / OpenAI-compatible adapters, SSRF guard, rate limiting, server-managed key option.
- AI question generation with prefetch, cancellation, timeouts, bounded retries, strict validation and bank fallback.
- AI answer explanations after deterministic grading (never override the score); available in practice, AI practice and post-exam reports.
- AI learning report built on program-computed statistics, with one-click targeted drills.
- Dynamic units (UUID): create / rename / reorder / import / archive / trash / permanent delete; no fixed unit count anywhere.
- v1/v2 → v3 data migration with automatic pre-migration backup.
- Exam leak fix: PublicExamQuestion / PrivateAnswerKey split; no lemma, answer or explanation during exams; refresh-safe exam resume with fixed deadline.
- Fixes: timed auto-submit uses latest answers; import no longer limited to units 1–20.
- Tests: vitest suite (migration, units, exam, AI validation/stream, proxy/SSRF/adapters).

## 2.0.0
- Full visual and interaction redesign.
