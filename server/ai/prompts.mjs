// Task prompts are built on the server from a structured, size-limited payload.
// The browser can never send a free-form prompt, so the proxy is not an open relay.
import { AIError } from './errors.mjs';

const str = (v, max, name, { required = true } = {}) => {
  if (v === undefined || v === null || v === '') {
    if (required) throw new AIError('bad_request', `缺少字段：${name}`);
    return '';
  }
  if (typeof v !== 'string' && typeof v !== 'number') throw new AIError('bad_request', `字段类型错误：${name}`);
  const s = String(v).replace(/[\u0000-\u001f]/g, ' ').trim();
  if (s.length > max) throw new AIError('bad_request', `字段过长：${name}`);
  return s;
};
const arr = (v, max, name) => {
  if (v === undefined) return [];
  if (!Array.isArray(v)) throw new AIError('bad_request', `字段类型错误：${name}`);
  if (v.length > max) throw new AIError('bad_request', `数量超出上限：${name}（最多 ${max}）`);
  return v;
};
const oneOf = (v, list, dflt) => (list.includes(v) ? v : dflt);

/* ------------------------------------------------------------------ test */
export function testPrompt() {
  return {
    system: 'You are a connectivity check. Reply with JSON only.',
    user: 'Return exactly this JSON object and nothing else: {"ok": true}',
    maxTokens: 300,
  };
}

/* -------------------------------------------------------------- generate */
export const MAX_WORDS_PER_REQUEST = 8;

export function generatePrompt(payload) {
  const words = arr(payload?.words, MAX_WORDS_PER_REQUEST, 'words').map((w, i) => ({
    wordId: str(w?.wordId, 120, `words[${i}].wordId`),
    lemma: str(w?.lemma, 60, `words[${i}].lemma`),
    chineseHint: str(w?.chineseHint, 40, `words[${i}].chineseHint`),
    partOfSpeech: str(w?.partOfSpeech, 20, `words[${i}].partOfSpeech`, { required: false }),
    unit: str(w?.unitName, 60, `words[${i}].unitName`, { required: false }),
    referenceForm: str(w?.referenceForm, 60, `words[${i}].referenceForm`, { required: false }),
  }));
  if (words.length === 0) throw new AIError('bad_request', '没有目标词汇。');
  const difficulty = oneOf(payload?.difficulty, ['easy', 'medium', 'hard', 'mixed'], 'mixed');
  const focusInflection = payload?.focusInflection !== false;
  const allowExpansion = payload?.allowExpansion === true;
  const avoid = arr(payload?.avoidSentences, 30, 'avoidSentences').map((s, i) => str(s, 300, `avoidSentences[${i}]`));

  const system = [
    'You write fill-in-the-blank vocabulary items for Chinese university students preparing for college English exams.',
    'Respond with a single JSON object only — no markdown, no commentary.',
    'Schema: {"questions":[{"wordId":string,"lemma":string,"sentence":string,"chineseHint":string,"correctAnswer":string,"acceptedAnswers":string[],"grammarNote":string,"explanation":string,"difficulty":"easy"|"medium"|"hard"}]}',
    'Rules:',
    '1. Write exactly one item per target word, in the order given, copying wordId and lemma exactly.',
    allowExpansion
      ? '2. Prefer the target lemma. You may only use the given lemma for the blank.'
      : '2. The blank MUST be filled by a form of the given lemma. Never substitute a different word or a synonym.',
    '3. "sentence" is one natural English sentence of 8–30 words containing exactly one blank written as five underscores: _____ . The blank replaces only the target word form.',
    '4. Do not write the lemma or the answer anywhere else in the sentence.',
    '5. "correctAnswer" is the exact form that fits the blank (e.g. achieved, achieving, crises, more sustainable). For multi-word phrases keep the whole phrase.',
    '6. "acceptedAnswers" lists every form that is also fully correct in this context, including correctAnswer. Do not include the bare lemma unless it is genuinely correct.',
    '7. "chineseHint" is a short Chinese gloss (2–12 characters) of the word sense used — never English, never the answer.',
    '8. "grammarNote" is a short Chinese label of the tested point (≤ 16 characters), e.g. 现在完成时（过去分词）.',
    '9. "explanation" is 1–2 Chinese sentences (≤ 120 characters) explaining why that form is required.',
    focusInflection
      ? '10. Make the item test word form: vary tense, aspect, voice, participles, plurals, comparatives or derivations so that the bare lemma is usually wrong.'
      : '10. Any grammatically natural form is fine.',
    difficulty === 'mixed' ? '11. Mix difficulty across items.' : `11. Target difficulty: ${difficulty}.`,
    '12. Use academic or campus-life contexts. Avoid sensitive, violent or political content.',
  ].join('\n');

  const user = JSON.stringify({
    targets: words.map((w) => ({ wordId: w.wordId, lemma: w.lemma, chineseHint: w.chineseHint, partOfSpeech: w.partOfSpeech || undefined, unit: w.unit || undefined, exampleAnswerForm: w.referenceForm || undefined })),
    avoidTheseSentences: avoid.length ? avoid : undefined,
  });
  return { system, user, maxTokens: Math.min(4000, 600 + words.length * 450) };
}

/* --------------------------------------------------------------- explain */
export function explainPrompt(payload) {
  const p = {
    sentence: str(payload?.sentence, 400, 'sentence'),
    chineseHint: str(payload?.chineseHint, 40, 'chineseHint'),
    lemma: str(payload?.lemma, 60, 'lemma'),
    correctAnswer: str(payload?.correctAnswer, 60, 'correctAnswer'),
    acceptedAnswers: arr(payload?.acceptedAnswers, 10, 'acceptedAnswers').map((a, i) => str(a, 60, `acceptedAnswers[${i}]`)),
    userAnswer: str(payload?.userAnswer, 80, 'userAnswer', { required: false }),
    verdict: oneOf(payload?.verdict, ['correct', 'incorrect'], 'incorrect'),
    engineDiagnosis: str(payload?.feedbackType, 40, 'feedbackType', { required: false }),
    grammarNote: str(payload?.grammarNote, 60, 'grammarNote', { required: false }),
  };
  const system = [
    'You are a patient English grammar tutor for Chinese university students. Write in Simplified Chinese; keep English words as-is.',
    'The scoring decision has ALREADY been made by a deterministic grader and is FINAL. Never contradict it and never change the correct answer.',
    'Respond with one JSON object only:',
    '{"errorCategory":"spelling"|"tense"|"number"|"part_of_speech"|"collocation"|"other_grammar"|"none","reason":string,"grammarPoint":string,"usage":string,"memoryTip":string,"alternativeMayBeValid":boolean,"alternativeNote":string}',
    '- errorCategory: the main cause of the student\'s mistake ("none" if the verdict is correct). spelling = misspelt; tense = wrong tense/aspect/voice or participle; number = singular/plural; part_of_speech = wrong word class (e.g. noun vs adjective); collocation = fixed phrase misuse; other_grammar = anything else.',
    '- reason (≤ 80 chars): why the student\'s answer is wrong in THIS sentence (or why it is right).',
    '- grammarPoint (≤ 60 chars): the grammar rule tested.',
    '- usage (≤ 100 chars): how the correct form is used, with one short example phrase.',
    '- memoryTip (≤ 50 chars): one short, practical memory tip.',
    '- alternativeMayBeValid: true ONLY if you are confident the student\'s answer is also grammatically correct and natural here; then explain in alternativeNote (≤ 80 chars). This is advisory only and does not change the score.',
  ].join('\n');
  return { system, user: JSON.stringify(p), maxTokens: 900 };
}

/* ---------------------------------------------------------------- report */
export function reportPrompt(payload) {
  const json = JSON.stringify(payload ?? {});
  if (json.length > 24000) throw new AIError('payload_too_large', '学习数据过大。');
  const system = [
    'You are a learning analyst for an English vocabulary app. Write in Simplified Chinese.',
    'You receive statistics that the app computed from the student\'s real answer history. Treat them as the only source of truth.',
    'Never invent numbers, scores, trends or words. Only quote numbers that appear in the data. If "sampleSufficient" is false, say clearly that data is insufficient and keep conclusions tentative.',
    'Respond with one JSON object only:',
    '{"summary":string,"weakWords":[{"wordId":string,"reason":string}],"grammarIssues":[{"type":string,"insight":string}],"recommendations":[{"title":string,"detail":string,"wordIds":string[],"unitIds":string[],"focusInflection":boolean}]}',
    '- summary (≤ 160 chars): recent performance.',
    '- weakWords: up to 8, chosen ONLY from data.weakWords / data.topErrorWords by wordId, each with a ≤ 60-char reason.',
    '- grammarIssues: up to 4, based on data.errorTypes.',
    '- recommendations: 2–4 concrete next steps. wordIds and unitIds MUST come from the data. Each recommendation should be practicable as a short targeted drill.',
  ].join('\n');
  return { system, user: json, maxTokens: 1800 };
}
