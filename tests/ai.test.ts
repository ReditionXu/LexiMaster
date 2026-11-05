import { describe, expect, it, vi } from 'vitest';
import { isFormOf, validateGenerated, validateExplanation, validateReport, GenTarget } from '../src/ai/validate';
import { extractJSON, AIError } from '../src/ai/client';
import { AIQuestionStream, buildTargets } from '../src/ai/generator';
import { buildLearningStats } from '../src/ai/learningStats';
import { seedToQuestions } from '../src/lib/migration';
import { DEFAULT_QUESTIONS } from '../src/data/defaultQuestions';
import { evaluateAnswer } from '../src/utils/grammarEngine';

const target: GenTarget = { wordId: 'U1-009', unitId: 'u1', lemma: 'improve', chineseHint: '改善', partOfSpeech: 'verb', bankSentence: 'Old sentence about _____ things.' };
const good = {
  wordId: 'U1-009', lemma: 'improve', sentence: 'She has _____ her English significantly since she joined the club.',
  chineseHint: '改善', correctAnswer: 'improved', acceptedAnswers: ['improved'], grammarNote: '现在完成时（过去分词）',
  explanation: 'has 后接过去分词，构成现在完成时，因此用 improved。', difficulty: 'medium',
};

describe('isFormOf', () => {
  it.each([
    ['improved', 'improve'], ['improving', 'improve'], ['studies', 'study'], ['crises', 'crisis'], ['phenomena', 'phenomenon'],
    ['went', 'go'], ['children', 'child'], ['sustainable', 'sustain'], ['took over', 'take over'], ['better', 'good'], ['more efficient', 'efficient'],
  ])('%s is a form of %s', (a, l) => expect(isFormOf(a, l)).toBe(true));
  it.each([['enhanced', 'improve'], ['big', 'large'], ['put over', 'take over'], ['impression', 'improve']])('%s is NOT a form of %s', (a, l) =>
    expect(isFormOf(a, l)).toBe(false)
  );
});

describe('validateGenerated', () => {
  it('accepts a well-formed item and assigns a system id + unit/word links', () => {
    const r = validateGenerated({ questions: [good] }, [target]);
    expect(r.rejected).toEqual([]);
    const q = r.valid[0].question;
    expect(q.id).toMatch(/^ai-/);
    expect(q.unitId).toBe('u1');
    expect(q.wordId).toBe('U1-009');
    expect(q.source).toBe('ai');
    // the deterministic grader agrees: improve (base form) is wrong, improved is right
    expect(evaluateAnswer('improve', q).isCorrect).toBe(false);
    expect(evaluateAnswer('improved', q).isCorrect).toBe(true);
  });
  const bad: [string, Record<string, unknown>, RegExp][] = [
    ['unrequested word id', { wordId: 'X' }, /未请求/],
    ['other lemma (no expansion)', { lemma: 'enhance', correctAnswer: 'enhanced', acceptedAnswers: ['enhanced'] }, /目标词以外/],
    ['two blanks', { sentence: 'She has _____ her _____ significantly since last year.' }, /恰好有 1 个/],
    ['no blank', { sentence: 'She has improved her English significantly since last year.' }, /恰好有 1 个/],
    ['answer leaked in sentence', { sentence: 'She has _____ her English; it improved a lot since last year.' }, /泄露/],
    ['lemma leaked', { sentence: 'To improve, she has _____ her English a lot this year.' }, /原形/],
    ['answer not a form of lemma', { correctAnswer: 'enhanced', acceptedAnswers: ['enhanced'] }, /词形/],
    ['english in chinese hint', { chineseHint: 'improve' }, /中文提示/],
    ['missing grammar note', { grammarNote: '' }, /语法考点/],
    ['missing explanation', { explanation: '' }, /解释/],
    ['chinese inside sentence', { sentence: 'She has _____ her English 很多 since she joined the club.' }, /中文/],
  ];
  it.each(bad)('rejects: %s', (_n, patch, re) => {
    const r = validateGenerated({ questions: [{ ...good, ...patch }] }, [target]);
    expect(r.valid).toHaveLength(0);
    expect(r.rejected[0].reason).toMatch(re);
  });
  it('rejects non-JSON-shaped output and duplicates', () => {
    expect(validateGenerated({ nope: 1 }, [target]).rejected[0].reason).toMatch(/questions/);
    const seen = new Set<string>();
    expect(validateGenerated({ questions: [good] }, [target], { seen }).valid).toHaveLength(1);
    expect(validateGenerated({ questions: [good] }, [target], { seen }).rejected[0].reason).toMatch(/重复/);
  });
  it('expansion is off by default and only allowed when authorised', () => {
    const other = { ...good, lemma: 'enhance', correctAnswer: 'enhanced', acceptedAnswers: ['enhanced'] };
    expect(validateGenerated({ questions: [other] }, [target]).valid).toHaveLength(0);
    const r = validateGenerated({ questions: [other] }, [target], { allowExpansion: true });
    expect(r.valid[0].question.wordId).toBeUndefined(); // not linked to the bank word → no mastery update
  });
});

describe('explanation & report validation', () => {
  it('explanation never overrides the verdict', () => {
    const e = validateExplanation({ errorCategory: 'none', reason: '其实是对的', grammarPoint: '现在完成时', alternativeMayBeValid: true }, 'incorrect');
    expect(e.errorCategory).toBe('other_grammar');
    expect(validateExplanation({ errorCategory: 'tense', reason: '对了', grammarPoint: '时态' }, 'correct').errorCategory).toBe('none');
    expect(() => validateExplanation({ reason: '' }, 'incorrect')).toThrow();
  });
  it('report keeps only known word / unit ids', () => {
    const r = validateReport(
      { summary: '总体不错', weakWords: [{ wordId: 'a', reason: 'x' }, { wordId: 'ghost', reason: 'y' }], recommendations: [{ title: '练习', detail: 'd', wordIds: ['a', 'ghost'], unitIds: ['u1', 'nope'] }] },
      { wordIds: new Set(['a']), unitIds: new Set(['u1']) }
    );
    expect(r.weakWords.map((w) => w.wordId)).toEqual(['a']);
    expect(r.recommendations[0].wordIds).toEqual(['a']);
    expect(r.recommendations[0].unitIds).toEqual(['u1']);
  });
});

describe('extractJSON', () => {
  it('handles fences and chatter', () => {
    expect(extractJSON('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJSON('Sure! Here it is: {"a":{"b":"}"}} hope that helps')).toEqual({ a: { b: '}' } });
    expect(() => extractJSON('no json here')).toThrow();
  });
});

describe('AIQuestionStream', () => {
  const { questions, units } = seedToQuestions(DEFAULT_QUESTIONS, []);
  const cfg = { unitIds: [units[0].id], questionCount: 4, difficulty: 'mixed' as const, weakFirst: false, random: false, focusInflection: true };
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const itemFor = (t: any) => ({
    wordId: t.wordId, lemma: t.lemma, sentence: `Every student in our seminar has _____ the reading list with great care.`,
    chineseHint: '测试', correctAnswer: t.lemma, acceptedAnswers: [t.lemma], grammarNote: '测试', explanation: '这是一个测试解释。',
  });

  it('prefetches in small batches and falls back to the bank on invalid output (after one retry)', async () => {
    const targets = buildTargets(questions, cfg, {});
    const calls: any[] = [];
    const request = vi.fn(async (_task: string, payload: any) => {
      calls.push(payload.words.map((w: any) => w.wordId));
      return { content: JSON.stringify({ questions: [] }) }; // always invalid
    });
    const s = new AIQuestionStream(targets, units, cfg, request as any);
    s.pump(0);
    for (let i = 0; i < 30; i++) await tick();
    s.setConsumed(3);
    for (let i = 0; i < 30; i++) await tick();
    expect(s.state.ready).toHaveLength(4);
    expect(s.state.ready.every((x) => x.question.source === 'ai-fallback')).toBe(true);
    expect(s.state.exhausted).toBe(true);
    // each word was requested at most twice (original + one retry) — bounded cost
    const flat = calls.flat();
    for (const t of targets) expect(flat.filter((id) => id === t.id).length).toBeLessThanOrEqual(2);
    s.dispose();
  });

  it('stops calling the API after a fatal error (e.g. bad key) and serves the bank', async () => {
    const targets = buildTargets(questions, { ...cfg, questionCount: 6 }, {});
    const request = vi.fn(async () => {
      throw new AIError('auth_failed', 'bad key');
    });
    const s = new AIQuestionStream(targets, units, cfg, request as any);
    s.pump(0);
    for (let i = 0; i < 20; i++) await tick();
    expect(request).toHaveBeenCalledTimes(1);
    expect(s.state.ready).toHaveLength(6);
    expect(s.state.error).toMatch(/bad key/);
    s.dispose();
  });

  it('dispose() cancels in-flight work', async () => {
    const targets = buildTargets(questions, cfg, {});
    let aborted = false;
    const request = vi.fn((_t: string, _p: any, o: any) => new Promise((_, rej) => o.signal.addEventListener('abort', () => { aborted = true; rej(new AIError('cancelled', 'x')); })));
    const s = new AIQuestionStream(targets, units, cfg, request as any);
    s.pump(0);
    await tick();
    s.dispose();
    await tick();
    expect(aborted).toBe(true);
  });
});

describe('learning stats', () => {
  it('computes from real records and flags insufficient samples', () => {
    const { questions, units } = seedToQuestions(DEFAULT_QUESTIONS, []);
    const h = questions.slice(0, 5).map((q, i) => ({ questionId: q.id, question: q, userAnswer: q.word, isCorrect: i % 2 === 0, timeSpentSeconds: 4, evaluation: evaluateAnswer(i % 2 === 0 ? q.correctAnswer : 'zzz', q), timestamp: Date.now() }));
    const s = buildLearningStats(questions, units, {}, h as any, []);
    expect(s.sampleSize).toBe(5);
    expect(s.sampleSufficient).toBe(false);
    expect(s.totals.accuracyPct).toBe(60);
    expect(s.units.find((u) => u.unitId === units[0].id)!.answers).toBe(5);
    expect(s.errorTypes.reduce((a, b) => a + b.count, 0)).toBe(2);
  });
});

describe('validator calibration against the real textbook bank', () => {
  it('every accepted answer in the bank counts as a form of its lemma (no false rejections)', async () => {
    const { SENTENCE_VARIANTS } = await import('../src/data/sentenceVariations');
    const misses: string[] = [];
    for (const q of DEFAULT_QUESTIONS) for (const a of q.acceptedAnswers) if (!isFormOf(a, q.word)) misses.push(`${q.word}→${a}`);
    for (const [w, vs] of Object.entries(SENTENCE_VARIANTS)) for (const v of vs) for (const a of v.acceptedAnswers) if (!isFormOf(a, w)) misses.push(`${w}→${a}`);
    expect(misses).toEqual([]);
  });
});
