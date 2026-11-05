import type { ExamSessionResult, PracticeConfig, Unit, UserAnswerRecord, VocabularyQuestion } from '../types';
import { evaluateAnswer } from '../utils/grammarEngine';
import { uuid } from './migration';

/**
 * Exam paper split.
 *
 * During an exam the UI may only ever receive `PublicExamQuestion`s. Everything
 * that could reveal the answer (lemma, correct form, accepted answers,
 * explanation, grammar note, collocation, phonetic) lives in the
 * `PrivateAnswerKey`, which is held in a module-private vault and consumed only
 * by `gradeExam()`. Rendering components are typed against the public shape, so
 * leaking an answer field is a compile-time error rather than a CSS concern.
 *
 * Limitation (documented): in this offline, browser-only mode the question bank
 * itself is in localStorage, so a determined user can still read answers with
 * developer tools. Server-side grading is required to prevent that — see docs.
 */

export interface PublicExamQuestion {
  questionId: string;
  unitId: string;
  questionNumber: number; // 1-based
  sentence: string; // contains exactly one "_____"
  chineseHint: string;
}

export interface PrivateAnswerKey {
  questionId: string;
  lemma: string;
  correctForm: string;
  acceptedAnswers: string[];
  explanation: string;
  /** Full bank question, needed by the deterministic grader. */
  source: VocabularyQuestion;
}

export interface ExamPaper {
  examId: string;
  questions: PublicExamQuestion[];
}

/** Fields that must never appear on a public question. Used by tests and a runtime guard. */
export const PRIVATE_FIELDS = [
  'word',
  'lemma',
  'correctAnswer',
  'correctForm',
  'acceptedAnswers',
  'explanation',
  'grammarNote',
  'collocation',
  'phonetic',
] as const;

const vault = new Map<string, Map<string, PrivateAnswerKey>>();

export function toPublicQuestion(q: VocabularyQuestion, index: number): PublicExamQuestion {
  // Explicit whitelist — never spread the source question.
  return {
    questionId: q.id,
    unitId: q.unitId,
    questionNumber: index + 1,
    sentence: q.sentence,
    chineseHint: q.chineseHint,
  };
}

export function toAnswerKey(q: VocabularyQuestion): PrivateAnswerKey {
  return {
    questionId: q.id,
    lemma: q.word,
    correctForm: q.correctAnswer,
    acceptedAnswers: [...q.acceptedAnswers],
    explanation: q.explanation,
    source: q,
  };
}

/** Select questions for an exam (selection logic unchanged from v2) and seal the answer key. */
export function selectExamQuestions(bank: VocabularyQuestion[], config: PracticeConfig): VocabularyQuestion[] {
  let pool = bank.filter((q) => config.unitIds.includes(q.unitId));
  if (config.order === 'random') pool = [...pool].sort(() => Math.random() - 0.5);
  const count = config.questionCount > 0 ? config.questionCount : pool.length;
  return pool.slice(0, count);
}

export function createExamPaper(selected: VocabularyQuestion[], examId = uuid()): ExamPaper {
  vault.set(examId, new Map(selected.map((q) => [q.id, toAnswerKey(q)])));
  return { examId, questions: selected.map(toPublicQuestion) };
}

/** Rebuild a sealed key for a resumed exam from the bank (the key is never persisted with the paper). */
export function resealExamPaper(paper: ExamPaper, bank: VocabularyQuestion[]): { paper: ExamPaper; missing: number } {
  const byId = new Map(bank.map((q) => [q.id, q]));
  const kept = paper.questions.filter((p) => byId.has(p.questionId));
  const questions = kept.map((p, i) => ({ ...p, questionNumber: i + 1 }));
  vault.set(paper.examId, new Map(kept.map((p) => [p.questionId, toAnswerKey(byId.get(p.questionId)!)])));
  return { paper: { examId: paper.examId, questions }, missing: paper.questions.length - kept.length };
}

export function hasAnswerKey(examId: string) {
  return vault.has(examId);
}

export function discardAnswerKey(examId: string) {
  vault.delete(examId);
}

export interface GradeInput {
  paper: ExamPaper;
  answers: Record<string, string>;
  startedAt: number;
  config: PracticeConfig;
  units: Unit[];
  now?: number;
}

/** Grade a submitted exam. Uses the unchanged deterministic grammar engine. Consumes the key. */
export function gradeExam({ paper, answers, startedAt, config, units, now = Date.now() }: GradeInput): ExamSessionResult {
  const key = vault.get(paper.examId);
  if (!key) throw new Error('答案密钥缺失，无法评分。请重新开始考试。');
  const total = paper.questions.length;
  const timeSpentSeconds = Math.max(1, Math.round((now - startedAt) / 1000));
  let correctCount = 0;
  const records: UserAnswerRecord[] = paper.questions.map((p) => {
    const k = key.get(p.questionId)!;
    const ans = answers[p.questionId] || '';
    const evaluation = evaluateAnswer(ans, k.source);
    if (evaluation.isCorrect) correctCount++;
    return {
      questionId: p.questionId,
      question: k.source,
      userAnswer: ans,
      isCorrect: evaluation.isCorrect,
      timeSpentSeconds: Math.round(timeSpentSeconds / Math.max(1, total)),
      evaluation,
      timestamp: now,
    };
  });
  vault.delete(paper.examId);
  const score = total > 0 ? Math.round((correctCount / total) * 100) : 0;
  const names = config.unitIds.map((id) => units.find((u) => u.id === id)?.name ?? '已删除单元');
  return {
    id: `EXAM-${now.toString(36).toUpperCase()}`,
    title: `${names.join(' & ')} 模拟考试`,
    unitIds: [...config.unitIds],
    unitNames: names,
    timestamp: now,
    totalQuestions: total,
    correctCount,
    incorrectCount: total - correctCount,
    score,
    accuracy: score,
    timeSpentSeconds,
    answers: records,
  };
}

/** Persisted in-progress exam. Contains ONLY public data + the user's own answers. */
export interface ActiveExamState {
  version: 1;
  paper: ExamPaper;
  config: PracticeConfig;
  answers: Record<string, string>;
  flagged: Record<string, boolean>;
  currentIndex: number;
  startedAt: number;
  deadline: number | null;
  savedAt: number;
}

export function assertPublic(q: object): void {
  for (const f of PRIVATE_FIELDS) {
    if (f in q) throw new Error(`Exam leak guard: public question contains "${f}"`);
  }
}
