import { describe, expect, it } from 'vitest';
import { createExamPaper, gradeExam, PRIVATE_FIELDS, resealExamPaper, assertPublic, hasAnswerKey } from '../src/lib/exam';
import { seedToQuestions } from '../src/lib/migration';
import { DEFAULT_QUESTIONS } from '../src/data/defaultQuestions';

const { questions, units } = seedToQuestions(DEFAULT_QUESTIONS, []);
const config = { mode: 'exam' as const, unitIds: [units[0].id], questionCount: 5, order: 'sequential' as const, timed: false };

describe('exam paper split (answer leak fix)', () => {
  it('public questions contain only whitelisted fields', () => {
    const paper = createExamPaper(questions.slice(0, 5));
    for (const p of paper.questions) {
      expect(Object.keys(p).sort()).toEqual(['chineseHint', 'questionId', 'questionNumber', 'sentence', 'unitId']);
      for (const f of PRIVATE_FIELDS) expect(p).not.toHaveProperty(f);
      expect(() => assertPublic(p)).not.toThrow();
    }
  });

  it('serialised public paper never contains the lemma or answer of any question', () => {
    const sel = questions.slice(0, 20);
    const paper = createExamPaper(sel);
    const json = JSON.stringify(paper);
    for (const q of sel) {
      // The answer may legitimately appear inside another sentence; check fields, not substrings of sentences.
      const p = paper.questions.find((x) => x.questionId === q.id)!;
      expect(p.sentence).toContain('_____');
      expect(json).not.toContain(`"correctAnswer"`);
      expect(json).not.toContain(`"word"`);
      expect(json).not.toContain(`"acceptedAnswers"`);
      expect(json).not.toContain(`"explanation"`);
    }
  });

  it('grades with the deterministic engine and consumes the key', () => {
    const sel = questions.slice(0, 3);
    const paper = createExamPaper(sel);
    const answers = { [sel[0].id]: sel[0].correctAnswer, [sel[1].id]: sel[1].word + 'zz', [sel[2].id]: '' };
    const r = gradeExam({ paper, answers, startedAt: Date.now() - 30_000, config, units });
    expect(r.correctCount).toBe(1);
    expect(r.incorrectCount).toBe(2);
    expect(r.unitNames).toEqual(['Unit 1']);
    expect(r.answers[0].question.correctAnswer).toBe(sel[0].correctAnswer); // revealed only after grading
    expect(hasAnswerKey(paper.examId)).toBe(false);
    expect(() => gradeExam({ paper, answers, startedAt: 0, config, units })).toThrow();
  });

  it('resumed exams rebuild the key from the bank and drop deleted questions', () => {
    const sel = questions.slice(0, 4);
    const paper = createExamPaper(sel);
    const persisted = JSON.parse(JSON.stringify(paper));
    const { paper: resumed, missing } = resealExamPaper(persisted, questions.filter((q) => q.id !== sel[1].id));
    expect(missing).toBe(1);
    expect(resumed.questions.map((q) => q.questionNumber)).toEqual([1, 2, 3]);
    const r = gradeExam({ paper: resumed, answers: { [sel[0].id]: sel[0].correctAnswer }, startedAt: 0, config, units });
    expect(r.totalQuestions).toBe(3);
    expect(r.correctCount).toBe(1);
  });
});
