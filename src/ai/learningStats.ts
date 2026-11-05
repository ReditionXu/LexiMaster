import type { ExamSessionResult, Unit, UserAnswerRecord, VocabularyQuestion, WordMasteryRecord } from '../types';
import { activeUnits } from '../lib/units';
import { startOfDay } from '../lib/insights';

/**
 * Aggregates real learning data for the AI report. Every number here is computed
 * by the program from stored records — the model only interprets them.
 */
export const MIN_ANSWERS_FOR_REPORT = 20;

export interface LearningStats {
  generatedAt: string;
  sampleSize: number;
  sampleSufficient: boolean;
  totals: { words: number; practicedWords: number; mastered: number; familiar: number; learning: number; weak: number; answers: number; accuracyPct: number; avgSecondsPerAnswer: number };
  units: { unitId: string; name: string; words: number; answers: number; accuracyPct: number | null; mastered: number; weak: number }[];
  errorTypes: { type: string; label: string; count: number }[];
  topErrorWords: { wordId: string; lemma: string; correctForm: string; errors: number; attempts: number; lastWrongAnswer: string; mastery: string }[];
  weakWords: { wordId: string; lemma: string; unitId: string; mastery: string }[];
  recentExams: { date: string; score: number; questions: number; units: string[] }[];
  trend: { last7DaysAnswers: number; last7DaysAccuracyPct: number | null; previous7DaysAnswers: number; previous7DaysAccuracyPct: number | null };
}

const LABELS: Record<string, string> = {
  base_form_trap: '原形陷阱（该变形却填原形）',
  inflection_error: '词尾屈折（-ed/-ing/复数等）',
  spelling_error: '拼写细节',
  wrong_word: '用词错误',
  empty: '未作答',
};

export function buildLearningStats(
  questions: VocabularyQuestion[],
  units: Unit[],
  mastery: Record<string, WordMasteryRecord>,
  history: UserAnswerRecord[],
  exams: ExamSessionResult[]
): LearningStats {
  const live = activeUnits(units);
  const liveIds = new Set(live.map((u) => u.id));
  const bank = questions.filter((q) => liveIds.has(q.unitId));
  const bankById = new Map(bank.map((q) => [q.id, q]));
  const pct = (c: number, t: number) => (t > 0 ? Math.round((c / t) * 100) : null);

  let mastered = 0, familiar = 0, learning = 0, weak = 0, practiced = 0;
  for (const q of bank) {
    const r = mastery[q.id];
    if (!r || r.totalAttempts === 0) continue;
    practiced++;
    if (r.masteryLevel === 'mastered') mastered++;
    else if (r.masteryLevel === 'familiar') familiar++;
    else if (r.masteryLevel === 'weak') weak++;
    else learning++;
  }

  const correct = history.filter((h) => h.isCorrect).length;
  const time = history.reduce((s, h) => s + (h.timeSpentSeconds || 0), 0);

  const unitsOut = live.map((u) => {
    const hs = history.filter((h) => h.question?.unitId === u.id);
    const qs = bank.filter((q) => q.unitId === u.id);
    return {
      unitId: u.id,
      name: u.name,
      words: qs.length,
      answers: hs.length,
      accuracyPct: pct(hs.filter((h) => h.isCorrect).length, hs.length),
      mastered: qs.filter((q) => mastery[q.id]?.masteryLevel === 'mastered').length,
      weak: qs.filter((q) => mastery[q.id]?.masteryLevel === 'weak').length,
    };
  });

  const errCount: Record<string, number> = {};
  for (const h of history) {
    if (h.isCorrect) continue;
    const t = h.evaluation?.feedbackType || 'wrong_word';
    errCount[t] = (errCount[t] || 0) + 1;
  }
  const errorTypes = Object.entries(errCount)
    .map(([type, count]) => ({ type, label: LABELS[type] || type, count }))
    .sort((a, b) => b.count - a.count);

  const topErrorWords = bank
    .map((q) => ({ q, r: mastery[q.id] }))
    .filter(({ r }) => r && r.totalAttempts - r.correctAttempts > 0)
    .sort((a, b) => b.r.totalAttempts - b.r.correctAttempts - (a.r.totalAttempts - a.r.correctAttempts))
    .slice(0, 15)
    .map(({ q, r }) => ({
      wordId: q.id,
      lemma: q.word,
      correctForm: q.correctAnswer,
      errors: r.totalAttempts - r.correctAttempts,
      attempts: r.totalAttempts,
      lastWrongAnswer: r.errorHistory?.[r.errorHistory.length - 1]?.userAnswer?.slice(0, 40) ?? '',
      mastery: r.masteryLevel,
    }));

  const weakWords = bank
    .filter((q) => mastery[q.id]?.masteryLevel === 'weak')
    .slice(0, 25)
    .map((q) => ({ wordId: q.id, lemma: q.word, unitId: q.unitId, mastery: 'weak' }));

  const DAY = 86_400_000;
  const today = startOfDay(Date.now());
  const inRange = (from: number, to: number) => history.filter((h) => h.timestamp >= from && h.timestamp < to);
  const last = inRange(today - 6 * DAY, today + DAY);
  const prev = inRange(today - 13 * DAY, today - 6 * DAY);

  return {
    generatedAt: new Date().toISOString(),
    sampleSize: history.length,
    sampleSufficient: history.length >= MIN_ANSWERS_FOR_REPORT,
    totals: {
      words: bank.length,
      practicedWords: practiced,
      mastered,
      familiar,
      learning,
      weak,
      answers: history.length,
      accuracyPct: pct(correct, history.length) ?? 0,
      avgSecondsPerAnswer: history.length ? Math.round((time / history.length) * 10) / 10 : 0,
    },
    units: unitsOut,
    errorTypes,
    topErrorWords,
    weakWords,
    recentExams: exams.slice(0, 5).map((e) => ({
      date: new Date(e.timestamp).toISOString().slice(0, 10),
      score: e.score,
      questions: e.totalQuestions,
      units: e.unitNames ?? [],
    })),
    trend: {
      last7DaysAnswers: last.length,
      last7DaysAccuracyPct: pct(last.filter((h) => h.isCorrect).length, last.length),
      previous7DaysAnswers: prev.length,
      previous7DaysAccuracyPct: pct(prev.filter((h) => h.isCorrect).length, prev.length),
    },
  };
}

/** Stable hash of the stats (minus timestamp), to reuse a cached report when nothing changed. */
export function statsFingerprint(s: LearningStats) {
  const { generatedAt, ...rest } = s;
  const str = JSON.stringify(rest);
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return String(h);
}
