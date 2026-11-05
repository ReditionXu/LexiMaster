import type { Difficulty, PartOfSpeech, VocabularyQuestion } from '../types';
import { evaluateAnswer } from '../utils/grammarEngine';
import { uuid } from '../lib/migration';

/**
 * Strict validation of AI output. Nothing the model returns reaches the learner
 * unless it passes every check here; failures are reported per item so the
 * generator can retry once or fall back to the bank.
 */

export interface GenTarget {
  wordId: string;
  unitId: string;
  lemma: string;
  chineseHint: string;
  partOfSpeech: PartOfSpeech;
  phonetic?: string;
  bankSentence?: string;
}

export interface Rejection {
  wordId?: string;
  reason: string;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const ANSWER_RE = /^[A-Za-z][A-Za-z' -]{0,58}$/;
const CJK_RE = /[\u3400-\u9fff]/;

/* Common irregular forms (base → forms). Enough to cover textbook vocabulary. */
const IRREGULAR: Record<string, string[]> = {
  be: ['am', 'is', 'are', 'was', 'were', 'been', 'being'], have: ['has', 'had', 'having'], do: ['does', 'did', 'done', 'doing'],
  go: ['goes', 'went', 'gone', 'going'], get: ['got', 'gotten'], make: ['made'], take: ['took', 'taken'], give: ['gave', 'given'],
  come: ['came'], see: ['saw', 'seen'], know: ['knew', 'known'], think: ['thought'], bring: ['brought'], buy: ['bought'],
  catch: ['caught'], teach: ['taught'], seek: ['sought'], fight: ['fought'], find: ['found'], build: ['built'], send: ['sent'],
  spend: ['spent'], lend: ['lent'], lose: ['lost'], leave: ['left'], keep: ['kept'], sleep: ['slept'], feel: ['felt'],
  meet: ['met'], lead: ['led'], hold: ['held'], stand: ['stood'], understand: ['understood'], tell: ['told'], sell: ['sold'],
  say: ['said'], pay: ['paid'], lay: ['laid'], begin: ['began', 'begun'], drink: ['drank', 'drunk'], swim: ['swam', 'swum'],
  ring: ['rang', 'rung'], sing: ['sang', 'sung'], run: ['ran'], write: ['wrote', 'written'], ride: ['rode', 'ridden'],
  rise: ['rose', 'risen'], arise: ['arose', 'arisen'], drive: ['drove', 'driven'], choose: ['chose', 'chosen'], speak: ['spoke', 'spoken'],
  break: ['broke', 'broken'], steal: ['stole', 'stolen'], freeze: ['froze', 'frozen'], wake: ['woke', 'woken'], wear: ['wore', 'worn'],
  tear: ['tore', 'torn'], bear: ['bore', 'born', 'borne'], swear: ['swore', 'sworn'], grow: ['grew', 'grown'], throw: ['threw', 'thrown'],
  blow: ['blew', 'blown'], fly: ['flew', 'flown', 'flies'], draw: ['drew', 'drawn'], show: ['showed', 'shown'], fall: ['fell', 'fallen'],
  eat: ['ate', 'eaten'], forget: ['forgot', 'forgotten'], forgive: ['forgave', 'forgiven'], hide: ['hid', 'hidden'], bite: ['bit', 'bitten'],
  shake: ['shook', 'shaken'], mistake: ['mistook', 'mistaken'], overcome: ['overcame'], undergo: ['underwent', 'undergone'],
  withdraw: ['withdrew', 'withdrawn'], forbid: ['forbade', 'forbidden'], strike: ['struck', 'stricken'], stick: ['stuck'],
  dig: ['dug'], sink: ['sank', 'sunk'], spring: ['sprang', 'sprung'], shrink: ['shrank', 'shrunk'], hang: ['hung', 'hanged'], shine: ['shone'], shoot: ['shot'], feed: ['fed'], flee: ['fled'], bleed: ['bled'],
  breed: ['bred'], deal: ['dealt'], mean: ['meant'], hear: ['heard'], sit: ['sat'], win: ['won'], light: ['lit', 'lighted'],
  child: ['children'], man: ['men'], woman: ['women'], person: ['people'], mouse: ['mice'], foot: ['feet'], tooth: ['teeth'],
  good: ['better', 'best'], well: ['better', 'best'], bad: ['worse', 'worst'], badly: ['worse', 'worst'], far: ['farther', 'further', 'farthest', 'furthest'],
  little: ['less', 'least'], many: ['more', 'most'], much: ['more', 'most'],
};

/** Is `answer` a plausible inflection / derivation of `lemma`? (single words or phrases) */
export function isFormOf(answer: string, lemma: string): boolean {
  const a = norm(answer);
  const l = norm(lemma);
  if (!a || !l) return false;
  if (a === l) return true;
  const aw = a.split(' ');
  const lw = l.split(' ');
  // comparatives with more/most
  if ((aw[0] === 'more' || aw[0] === 'most' || aw[0] === 'less' || aw[0] === 'least') && isFormOf(aw.slice(1).join(' '), l)) return true;
  if (lw.length > 1 || /[/().]/.test(l)) {
    // phrase: first word may inflect ("take over" → "took over"), the rest stays
    if (lw.length > 1 && aw.length === lw.length && !/[/().]/.test(lw[0])) {
      const restOk = lw.slice(1).every((w, i) => w === aw[i + 1]);
      if (restOk && isFormOf(aw[0], lw[0])) return true;
    }
    // dictionary-style lemmas: "one's heart goes out to sb.", "write of/about", "take charge (of)"
    return isPhraseFormOf(a, l);
  }
  if (aw.length > 1) return false;
  if (IRREGULAR[l]?.includes(a)) return true;
  let p = 0;
  while (p < a.length && p < l.length && a[p] === l[p]) p++;
  if (a.length > l.length + 8) return false;
  // Shares (almost) the whole lemma: achieve→achieved, study→studies, child→children, sustain→sustainable
  if (p >= l.length - 1 && p >= Math.min(3, l.length)) return true;
  // Shorter shared stem only with a recognised inflectional/derivational ending: crisis→crises, maintain→maintenance
  return p >= Math.max(3, l.length - 3) && SUFFIX_RE.test(a.slice(p));
}

const SUFFIX_RE =
  /^(e|es|s|ed|d|ing|ies|ied|ier|iest|er|ers|est|ly|ily|ment|ments|ness|tion|tions|sion|sions|ation|ations|ance|ances|ence|ences|enance|ant|ants|ent|ents|ity|ities|ive|ively|al|ally|able|ably|ible|ibly|ful|less|ous|ously|ize|ise|ized|ised|izing|ising|ist|ists|ian|ism|ure|ary|ory|ic|ical|ically|en|a|ae|i|um|on|ae)$/;

const FUNCTION_WORDS = new Set(
  "sb sth one ones one's oneself someone something the a an of to in on for with about upon into at by be is are was were his her their my your its our him them me us himself herself themselves myself yourself itself ourselves".split(' ')
);
function contentTokens(s: string) {
  return norm(s)
    .replace(/[^a-z' ]+/g, ' ')
    .split(' ')
    .map((w) => w.replace(/'s?$/, ''))
    .filter((w) => w.length >= 2 && !FUNCTION_WORDS.has(w));
}
function irregularBase(w: string) {
  if (IRREGULAR[w]) return w;
  for (const [b, forms] of Object.entries(IRREGULAR)) if (forms.includes(w)) return b;
  return undefined;
}
function sameFamily(a: string, b: string): boolean {
  if (a === b) return true;
  const ba = irregularBase(a);
  if (ba && ba === irregularBase(b)) return true;
  return isFormOf(a, b) || isFormOf(b, a);
}
function isPhraseFormOf(answer: string, lemma: string): boolean {
  const L = contentTokens(lemma);
  const A = contentTokens(answer);
  if (!L.length || !A.length) return false;
  const placeholders = /\b(sb|sth|one's|oneself|someone)\b|\.\.\.|\//.test(lemma);
  let extra = 0;
  for (const w of A) if (!L.some((x) => sameFamily(w, x))) extra++;
  if (extra > (placeholders ? 1 : 0)) return false;
  const firstGroup = contentTokens(norm(lemma).split(' ')[0]);
  const heads = firstGroup.length ? firstGroup : [L[0]];
  return A.some((w) => heads.some((h) => sameFamily(w, h)));
}

function containsWord(haystack: string, needle: string) {
  const n = norm(needle).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
  return new RegExp(`(^|[^A-Za-z])${n}([^A-Za-z]|$)`, 'i').test(haystack);
}

export function normalizeSentenceKey(s: string) {
  return s.toLowerCase().replace(/_{3,}/g, '_').replace(/[^a-z_]+/g, ' ').trim();
}

export interface ValidateOptions {
  allowExpansion?: boolean;
  /** Sentence keys already used in this session (dedupe). */
  seen?: Set<string>;
}

export function validateGenerated(raw: unknown, targets: GenTarget[], opts: ValidateOptions = {}) {
  const valid: { targetId: string; question: VocabularyQuestion }[] = [];
  const rejected: Rejection[] = [];
  const byId = new Map(targets.map((t) => [t.wordId, t]));
  const done = new Set<string>();
  const list = (raw as any)?.questions;
  if (!Array.isArray(list)) {
    return { valid, rejected: targets.map((t) => ({ wordId: t.wordId, reason: '返回内容缺少 questions 数组' })) };
  }
  for (const item of list.slice(0, targets.length * 2)) {
    const r = validateItem(item, byId, opts, done);
    if ('question' in r) {
      valid.push({ targetId: r.wordId, question: r.question });
      done.add(r.wordId);
    } else rejected.push(r);
  }
  for (const t of targets) if (!done.has(t.wordId) && !rejected.some((x) => x.wordId === t.wordId)) rejected.push({ wordId: t.wordId, reason: '缺少该词的题目' });
  return { valid, rejected };
}

function validateItem(item: any, byId: Map<string, GenTarget>, opts: ValidateOptions, done: Set<string>): { question: VocabularyQuestion; wordId: string } | Rejection {
  if (!item || typeof item !== 'object') return { reason: '题目不是对象' };
  const wordId = typeof item.wordId === 'string' ? item.wordId : '';
  const t = byId.get(wordId);
  if (!t) return { wordId, reason: '题目引用了未请求的词汇 ID' };
  if (done.has(wordId)) return { wordId, reason: '同一词汇重复出题' };
  const fail = (reason: string): Rejection => ({ wordId, reason });

  const lemma = typeof item.lemma === 'string' ? item.lemma.trim() : '';
  if (!lemma || !ANSWER_RE.test(lemma)) return fail('单词原形缺失或格式错误');
  const sameLemma = norm(lemma) === norm(t.lemma);
  if (!sameLemma && !opts.allowExpansion) return fail(`使用了目标词以外的单词「${lemma}」`);

  let sentence = typeof item.sentence === 'string' ? item.sentence.replace(/\s+/g, ' ').trim() : '';
  sentence = sentence.replace(/_{3,}/g, '_____');
  const blanks = sentence.match(/_____/g)?.length ?? 0;
  if (blanks !== 1) return fail(`句子中应恰好有 1 个空格，实际 ${blanks} 个`);
  if (sentence.length < 25 || sentence.length > 300) return fail('句子长度不合适');
  const words = sentence.split(' ').length;
  if (words < 6 || words > 45) return fail('句子词数不合适');
  if (CJK_RE.test(sentence)) return fail('英文句子中混入了中文');
  if (!/[.!?]["')]?$/.test(sentence)) return fail('句子缺少结束标点');

  const correct = typeof item.correctAnswer === 'string' ? item.correctAnswer.trim() : '';
  if (!ANSWER_RE.test(correct)) return fail('正确答案格式错误');
  if (!isFormOf(correct, lemma)) return fail(`答案「${correct}」不是「${lemma}」的词形`);

  const withoutBlank = sentence.replace('_____', ' ');
  if (containsWord(withoutBlank, correct)) return fail('句子其他位置泄露了答案');
  if (containsWord(withoutBlank, lemma)) return fail('句子其他位置出现了目标词原形');

  const hint = typeof item.chineseHint === 'string' ? item.chineseHint.trim() : '';
  if (!hint || !CJK_RE.test(hint) || /[A-Za-z]/.test(hint) || hint.length > 16) return fail('中文提示缺失或不合规');

  let accepted: string[] = Array.isArray(item.acceptedAnswers) ? item.acceptedAnswers.filter((a: unknown) => typeof a === 'string').map((a: string) => a.trim()) : [];
  accepted = accepted.filter((a) => ANSWER_RE.test(a) && isFormOf(a, lemma));
  if (!accepted.some((a) => norm(a) === norm(correct))) accepted.unshift(correct);
  accepted = Array.from(new Map(accepted.map((a) => [norm(a), a])).values()).slice(0, 6);

  const grammarNote = typeof item.grammarNote === 'string' ? item.grammarNote.trim() : '';
  if (!grammarNote || grammarNote.length > 30) return fail('语法考点缺失或过长');
  const explanation = typeof item.explanation === 'string' ? item.explanation.trim() : '';
  if (explanation.length < 4 || explanation.length > 260) return fail('语法解释缺失或过长');
  const difficulty: Difficulty = ['easy', 'medium', 'hard'].includes(item.difficulty) ? item.difficulty : 'medium';

  const key = normalizeSentenceKey(sentence);
  if (opts.seen?.has(key)) return fail('与本次已出过的题目重复');
  if (t.bankSentence && normalizeSentenceKey(t.bankSentence) === key) return fail('与题库原句相同');

  const question: VocabularyQuestion = {
    id: `ai-${uuid()}`,
    unitId: t.unitId,
    word: lemma,
    sentence,
    chineseHint: hint,
    correctAnswer: correct,
    acceptedAnswers: accepted,
    partOfSpeech: t.partOfSpeech,
    grammarNote,
    explanation,
    difficulty,
    phonetic: sameLemma ? t.phonetic : undefined,
    source: 'ai',
    wordId: sameLemma ? t.wordId : undefined,
  };
  // Deterministic self-check: the grader must accept the model's own answers.
  for (const a of accepted) {
    if (!evaluateAnswer(a, question).isCorrect) return fail('答案未通过确定性评分自检');
  }
  opts.seen?.add(key);
  return { question, wordId };
}

/* ------------------------------------------------------------ explanation */
export type ErrorCategory = 'spelling' | 'tense' | 'number' | 'part_of_speech' | 'collocation' | 'other_grammar' | 'none';
export const ERROR_CATEGORY_LABEL: Record<ErrorCategory, string> = {
  spelling: '拼写错误',
  tense: '时态 / 语态错误',
  number: '单复数错误',
  part_of_speech: '词性错误',
  collocation: '固定搭配错误',
  other_grammar: '其他语法错误',
  none: '回答正确',
};

export interface AIExplanation {
  errorCategory: ErrorCategory;
  reason: string;
  grammarPoint: string;
  usage: string;
  memoryTip: string;
  alternativeMayBeValid: boolean;
  alternativeNote?: string;
}

const clip = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function validateExplanation(raw: any, verdict: 'correct' | 'incorrect'): AIExplanation {
  const cats = Object.keys(ERROR_CATEGORY_LABEL);
  let cat: ErrorCategory = cats.includes(raw?.errorCategory) ? raw.errorCategory : 'other_grammar';
  if (verdict === 'correct') cat = 'none';
  if (verdict === 'incorrect' && cat === 'none') cat = 'other_grammar';
  const out: AIExplanation = {
    errorCategory: cat,
    reason: clip(raw?.reason, 160),
    grammarPoint: clip(raw?.grammarPoint, 120),
    usage: clip(raw?.usage, 200),
    memoryTip: clip(raw?.memoryTip, 100),
    alternativeMayBeValid: verdict === 'incorrect' && raw?.alternativeMayBeValid === true,
    alternativeNote: clip(raw?.alternativeNote, 160) || undefined,
  };
  if (!out.reason || !out.grammarPoint) throw new Error('AI 解析缺少必要字段');
  if (!CJK_RE.test(out.reason + out.grammarPoint)) throw new Error('AI 解析不是中文');
  return out;
}

/* ----------------------------------------------------------------- report */
export interface AIReport {
  summary: string;
  weakWords: { wordId: string; reason: string }[];
  grammarIssues: { type: string; insight: string }[];
  recommendations: { title: string; detail: string; wordIds: string[]; unitIds: string[]; focusInflection: boolean }[];
}

export function validateReport(raw: any, known: { wordIds: Set<string>; unitIds: Set<string> }): AIReport {
  const summary = clip(raw?.summary, 400);
  if (!summary) throw new Error('AI 报告缺少总结');
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  const weakWords = arr(raw?.weakWords)
    .filter((w: any) => typeof w?.wordId === 'string' && known.wordIds.has(w.wordId))
    .slice(0, 8)
    .map((w: any) => ({ wordId: w.wordId, reason: clip(w.reason, 120) }));
  const grammarIssues = arr(raw?.grammarIssues)
    .slice(0, 4)
    .map((g: any) => ({ type: clip(g?.type, 40), insight: clip(g?.insight, 200) }))
    .filter((g) => g.type && g.insight);
  const recommendations = arr(raw?.recommendations)
    .slice(0, 4)
    .map((r: any) => ({
      title: clip(r?.title, 60),
      detail: clip(r?.detail, 240),
      wordIds: arr(r?.wordIds).filter((id: any) => typeof id === 'string' && known.wordIds.has(id)).slice(0, 20),
      unitIds: arr(r?.unitIds).filter((id: any) => typeof id === 'string' && known.unitIds.has(id)),
      focusInflection: r?.focusInflection !== false,
    }))
    .filter((r) => r.title);
  return { summary, weakWords, grammarIssues, recommendations };
}
