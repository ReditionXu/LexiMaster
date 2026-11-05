import type { AIPracticeConfig, Unit, VocabularyQuestion, WordMasteryRecord } from '../types';
import { aiRequest, AIError, extractJSON } from './client';
import { GenTarget, Rejection, validateGenerated } from './validate';
import { getSettings } from './settings';
import { unitLabel } from '../lib/units';

/**
 * Real-time question stream with prefetch.
 *
 *   - Builds the ordered list of target words from the user's choices.
 *   - Requests small batches (default 3) and keeps ≥ 2 validated items buffered ahead.
 *   - One request in flight at a time; everything is cancellable via `dispose()`.
 *   - A word that fails validation is retried once in a later batch, then falls back
 *     to its original bank question (source: "ai-fallback").
 *   - Rate limits: waits Retry-After once (≤ 20 s), then falls back. Hard cap on total
 *     requests per session, so outages can never drain the user's quota.
 */

export interface StreamItem {
  question: VocabularyQuestion;
  /** Target bank word (for mastery), undefined for expansion words. */
  wordId?: string;
  fallbackReason?: string;
}

export interface StreamState {
  ready: StreamItem[];
  total: number;
  generating: boolean;
  exhausted: boolean;
  error?: string;
  stats: { requests: number; aiItems: number; fallbacks: number; rejected: Rejection[] };
}

const PREFETCH_AHEAD = 2;

export function buildTargets(bank: VocabularyQuestion[], cfg: AIPracticeConfig, mastery: Record<string, WordMasteryRecord>): VocabularyQuestion[] {
  let pool: VocabularyQuestion[];
  if (cfg.wordIds?.length) {
    const byId = new Map(bank.map((q) => [q.id, q]));
    pool = cfg.wordIds.map((id) => byId.get(id)).filter(Boolean) as VocabularyQuestion[];
  } else {
    pool = bank.filter((q) => cfg.unitIds.includes(q.unitId));
  }
  // One target per lemma (the bank can hold several sentences for a word).
  const seen = new Set<string>();
  pool = pool.filter((q) => {
    const k = q.word.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (cfg.random) pool = [...pool].sort(() => Math.random() - 0.5);
  if (cfg.weakFirst) {
    const score = (q: VocabularyQuestion) => {
      const r = mastery[q.id];
      if (!r || r.totalAttempts === 0) return 2;
      return { weak: 0, learning: 1, familiar: 3, mastered: 4, untested: 2 }[r.masteryLevel] ?? 2;
    };
    pool = [...pool].sort((a, b) => score(a) - score(b));
  }
  return pool.slice(0, Math.max(1, cfg.questionCount));
}

export class AIQuestionStream {
  private targets: VocabularyQuestion[];
  private cursor = 0; // next target index to request
  private retryQueue: VocabularyQuestion[] = [];
  private retried = new Set<string>();
  private controller = new AbortController();
  private seen = new Set<string>();
  private inFlight = false;
  private disposed = false;
  private maxRequests: number;
  private listeners = new Set<(s: StreamState) => void>();
  state: StreamState;

  constructor(
    targets: VocabularyQuestion[],
    private units: Unit[],
    private cfg: AIPracticeConfig,
    private request: typeof aiRequest = aiRequest
  ) {
    this.targets = targets;
    this.state = { ready: [], total: targets.length, generating: false, exhausted: targets.length === 0, stats: { requests: 0, aiItems: 0, fallbacks: 0, rejected: [] } };
    const batch = Math.max(1, Math.min(6, getSettings().batchSize || 3));
    this.batchSize = batch;
    this.maxRequests = Math.ceil(targets.length / batch) * 2 + 1;
    for (const t of targets) this.seen.add(t.sentence.toLowerCase());
  }
  private batchSize: number;

  subscribe(fn: (s: StreamState) => void) {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }
  private set(p: Partial<StreamState>) {
    this.state = { ...this.state, ...p, stats: { ...this.state.stats, ...(p.stats || {}) } };
    this.listeners.forEach((l) => l(this.state));
  }

  dispose() {
    this.disposed = true;
    this.controller.abort();
    this.listeners.clear();
  }

  /** Ensure enough items are buffered ahead of the learner's position. */
  pump(consumed: number) {
    if (this.disposed || this.inFlight) return;
    const buffered = this.state.ready.length - consumed;
    const remaining = this.targets.length - this.cursor + this.retryQueue.length;
    if (remaining <= 0) {
      if (!this.state.exhausted) this.set({ exhausted: true, generating: false });
      return;
    }
    if (buffered >= PREFETCH_AHEAD + 1) return;
    void this.fetchBatch();
  }

  private fallback(t: VocabularyQuestion, reason: string): StreamItem {
    return { question: { ...t, source: 'ai-fallback', wordId: t.id }, wordId: t.id, fallbackReason: reason };
  }

  private async fetchBatch() {
    const batch: VocabularyQuestion[] = [];
    while (batch.length < this.batchSize && this.retryQueue.length) batch.push(this.retryQueue.shift()!);
    while (batch.length < this.batchSize && this.cursor < this.targets.length) batch.push(this.targets[this.cursor++]);
    if (!batch.length) return;

    if (this.state.stats.requests >= this.maxRequests) {
      this.push(batch.map((t) => this.fallback(t, '已达本次练习的请求上限')));
      return this.pump(0);
    }

    this.inFlight = true;
    this.set({ generating: true, error: undefined });
    const targets: GenTarget[] = batch.map((t) => ({
      wordId: t.id,
      unitId: t.unitId,
      lemma: t.word,
      chineseHint: t.chineseHint,
      partOfSpeech: t.partOfSpeech,
      phonetic: t.phonetic,
      bankSentence: t.sentence,
    }));
    const payload = {
      words: batch.map((t) => ({ wordId: t.id, lemma: t.word, chineseHint: t.chineseHint, partOfSpeech: t.partOfSpeech, unitName: unitLabel(this.units, t.unitId, ''), referenceForm: t.correctAnswer })),
      difficulty: this.cfg.difficulty,
      focusInflection: this.cfg.focusInflection,
      allowExpansion: !!this.cfg.allowExpansion,
      avoidSentences: [...batch.map((t) => t.sentence)].slice(0, 30),
    };

    let attempt = 0;
    while (!this.disposed) {
      try {
        this.set({ stats: { ...this.state.stats, requests: this.state.stats.requests + 1 } });
        const res = await this.request('generate', payload, { signal: this.controller.signal });
        const json = extractJSON(res.content);
        const { valid, rejected } = validateGenerated(json, targets, { allowExpansion: this.cfg.allowExpansion, seen: this.seen });
        const items: StreamItem[] = [];
        for (const t of batch) {
          const q = valid.find((v) => v.targetId === t.id)?.question;
          if (q) items.push({ question: q, wordId: q.wordId });
          else {
            const why = rejected.find((r) => r.wordId === t.id)?.reason ?? '未生成';
            if (!this.retried.has(t.id)) {
              this.retried.add(t.id);
              this.retryQueue.push(t);
            } else items.push(this.fallback(t, `AI 题目未通过校验：${why}`));
          }
        }
        this.set({ stats: { ...this.state.stats, rejected: [...this.state.stats.rejected, ...rejected].slice(-30) } });
        this.push(items);
        break;
      } catch (e) {
        if (this.disposed) return;
        const err = e instanceof AIError ? e : new AIError('invalid_output', (e as Error).message);
        if (err.code === 'rate_limited' && attempt === 0 && (err.retryAfter ?? 5) <= 20) {
          attempt++;
          this.set({ error: `服务商限流，${err.retryAfter ?? 5} 秒后重试一次…` });
          await new Promise((r) => setTimeout(r, (err.retryAfter ?? 5) * 1000));
          continue;
        }
        if (err.code === 'cancelled') return;
        // Any other failure: fall back to bank questions for this batch — practice continues.
        const fatal = ['auth_failed', 'model_not_found', 'not_configured', 'disabled', 'budget_exceeded', 'offline'].includes(err.code);
        this.push(batch.map((t) => this.fallback(t, err.message)));
        if (fatal) {
          // Stop calling the API; serve the rest from the bank.
          const rest = [...this.retryQueue.splice(0), ...this.targets.slice(this.cursor)];
          this.cursor = this.targets.length;
          this.push(rest.map((t) => this.fallback(t, err.message)));
        }
        this.set({ error: err.message });
        break;
      }
    }
    this.inFlight = false;
    const remaining = this.targets.length - this.cursor + this.retryQueue.length;
    this.set({ generating: false, exhausted: remaining === 0 });
    // Keep the buffer topped up.
    this.pump(this.consumedHint);
  }

  /** Stop using the API and serve every remaining target from the bank. */
  fallbackRemaining(reason = '已切换为题库练习') {
    this.controller.abort();
    this.inFlight = false;
    const rest = [...this.retryQueue.splice(0), ...this.targets.slice(this.cursor)];
    // Anything that was in flight is also covered: targets already requested but not delivered.
    const delivered = new Set(this.state.ready.map((i) => i.wordId ?? i.question.id));
    const inFlightLost = this.targets.slice(0, this.cursor).filter((t) => !delivered.has(t.id) && !rest.includes(t));
    this.cursor = this.targets.length;
    this.push([...inFlightLost, ...rest].map((t) => this.fallback(t, reason)));
    this.set({ generating: false, exhausted: true });
  }

  private consumedHint = 0;
  setConsumed(n: number) {
    this.consumedHint = n;
    this.pump(n);
  }

  private push(items: StreamItem[]) {
    if (!items.length) return;
    const ai = items.filter((i) => i.question.source === 'ai').length;
    const fb = items.length - ai;
    const ready = [...this.state.ready, ...items];
    this.set({
      ready,
      stats: { ...this.state.stats, aiItems: this.state.stats.aiItems + ai, fallbacks: this.state.stats.fallbacks + fb },
    });
  }
}
