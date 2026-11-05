import { describe, expect, it } from 'vitest';
import { migrateSnapshot, seedToQuestions } from '../src/lib/migration';
import { DEFAULT_QUESTIONS } from '../src/data/defaultQuestions';
import { evaluateAnswer } from '../src/utils/grammarEngine';

let n = 0;
const gen = () => `uuid-${++n}`;

const legacyQ = (id: string, unit: number) => ({
  id, unit, word: 'achieve', sentence: 'She _____ it.', chineseHint: '实现', correctAnswer: 'achieved',
  acceptedAnswers: ['achieved'], partOfSpeech: 'verb' as const, grammarNote: '', explanation: '', difficulty: 'easy' as const,
});

describe('v2 → v3 migration', () => {
  it('creates one unit per legacy number, links every question, keeps all data', () => {
    n = 0;
    const questions = DEFAULT_QUESTIONS.map((q) => ({ ...q })) as any[];
    const history = questions.slice(0, 10).map((q, i) => ({
      questionId: q.id, question: { ...q }, userAnswer: 'x', isCorrect: i % 2 === 0, timeSpentSeconds: 3,
      evaluation: evaluateAnswer('x', q as any), timestamp: 1000 + i,
    }));
    const exams = [{ id: 'E1', title: 'Unit 1 & 2 模拟考试', unit: 'all' as const, timestamp: 5, totalQuestions: 2, correctCount: 1,
      incorrectCount: 1, score: 50, accuracy: 50, timeSpentSeconds: 60, answers: history.slice(0, 2) }];
    const r = migrateSnapshot({ questions, units: null, history: history as any, exams: exams as any }, gen);

    expect(r.units.map((u) => u.name)).toEqual(['Unit 1', 'Unit 2', 'Unit 3', 'Unit 4']);
    expect(r.units.map((u) => u.legacyNumber)).toEqual([1, 2, 3, 4]);
    expect(r.questions).toHaveLength(questions.length);
    const byNum = new Map(r.units.map((u) => [u.legacyNumber, u.id]));
    for (const q of r.questions) expect(q.unitId).toBe(byNum.get((q as any).unit));
    // counts per unit are preserved (27 / 31 / 33 / 34)
    const count = (k: number) => r.questions.filter((q) => q.unitId === byNum.get(k)).length;
    expect([count(1), count(2), count(3), count(4)]).toEqual([27, 31, 33, 34]);
    // history & exams are kept and linked
    expect(r.history).toHaveLength(10);
    expect(r.history.every((h) => h.question.unitId)).toBe(true);
    expect(r.exams[0].unitIds?.length).toBeGreaterThan(0);
    expect(r.exams[0].unitNames?.[0]).toMatch(/^Unit /);
    expect(r.exams[0].answers).toHaveLength(2);
    expect(r.changed).toBe(true);
  });

  it('is idempotent', () => {
    n = 0;
    const first = migrateSnapshot({ questions: [legacyQ('a', 1), legacyQ('b', 7)] as any }, gen);
    const second = migrateSnapshot({ questions: first.questions, units: first.units, history: first.history, exams: first.exams }, gen);
    expect(second.changed).toBe(false);
    expect(second.units).toEqual(first.units);
    expect(second.questions).toEqual(first.questions);
  });

  it('supports more than 4 (and more than 20) units — no hardcoded cap', () => {
    n = 0;
    const qs = Array.from({ length: 30 }, (_, i) => legacyQ(`q${i}`, i + 1));
    const r = migrateSnapshot({ questions: qs as any }, gen);
    expect(r.units).toHaveLength(30);
    expect(new Set(r.units.map((u) => u.id)).size).toBe(30);
  });

  it('re-links orphaned unitIds (e.g. from an old backup) instead of losing words', () => {
    n = 0;
    const r = migrateSnapshot({ questions: [{ ...legacyQ('a', 2), unitId: 'gone' }] as any, units: [] }, gen);
    expect(r.units[0].legacyNumber).toBe(2);
    expect(r.questions[0].unitId).toBe(r.units[0].id);
  });

  it('history records for words no longer in the bank still get a unit via their snapshot', () => {
    n = 0;
    const h = { questionId: 'deleted', question: legacyQ('deleted', 3), userAnswer: '', isCorrect: false, timeSpentSeconds: 1, evaluation: {} as any, timestamp: 1 };
    const r = migrateSnapshot({ questions: [legacyQ('a', 1)] as any, history: [h as any] }, gen);
    expect(r.history[0].question.unitId).toBe(r.units.find((u) => u.legacyNumber === 3)!.id);
  });

  it('seedToQuestions reuses existing legacy units', () => {
    n = 0;
    const first = seedToQuestions(DEFAULT_QUESTIONS, [], gen);
    const again = seedToQuestions(DEFAULT_QUESTIONS, first.units, gen);
    expect(again.units).toHaveLength(4);
    expect(again.questions.map((q) => q.unitId)).toEqual(first.questions.map((q) => q.unitId));
  });
});
