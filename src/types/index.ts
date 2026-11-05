export type Difficulty = 'easy' | 'medium' | 'hard';

export type PartOfSpeech =
  | 'verb'
  | 'noun'
  | 'adjective'
  | 'adverb'
  | 'phrase'
  | 'preposition'
  | 'prep'
  | 'other';

/**
 * A unit (word list). Units are first-class entities with a stable UUID —
 * never identified by array position or by name.
 */
export interface Unit {
  id: string; // UUID, stable forever
  name: string; // e.g. "Unit 1", "CET-4 Vocabulary"
  description?: string; // optional subtitle, e.g. "College Life & Ambition"
  order: number; // display order (ascending)
  archived: boolean; // hidden from practice, kept in the bank
  deletedAt?: number; // soft-deleted (in trash); restorable until purged
  createdAt: number;
  updatedAt: number;
  /** Original numeric unit (1–4…) for data migrated from v1/v2. Used only for migration & reset. */
  legacyNumber?: number;
}

export type QuestionSource = 'bank' | 'ai' | 'ai-fallback';

export interface VocabularyQuestion {
  id: string; // e.g. "U1-001"
  /** Stable reference to the owning Unit. */
  unitId: string;
  /** @deprecated v1/v2 numeric unit, kept only for backwards-compatible exports. Never use for logic. */
  unit?: number;
  word: string; // Lemma / base form, e.g. "achieve"
  sentence: string; // Sentence with blank, e.g. "She finally _____ her dream of becoming a doctor."
  chineseHint: string; // "实现"
  correctAnswer: string; // "achieved"
  acceptedAnswers: string[]; // ["achieved"]
  partOfSpeech: PartOfSpeech;
  grammarNote: string; // e.g. "一般过去时", "现在完成时(过去分词)", "名词复数"
  explanation: string; // Detailed grammar rule & context explanation
  difficulty: Difficulty;
  collocation?: string; // e.g. "achieve one's dream"
  phonetic?: string; // e.g. "/əˈtʃiːv/"
  isCustom?: boolean; // true if imported by user
  /** Where this question came from. Absent = bank. */
  source?: QuestionSource;
  /** For AI-generated questions: the bank vocabulary item (question id) this question targets. */
  wordId?: string;
}

/** Seed/legacy question shape: numeric unit, no unitId yet. Converted by the v3 migration. */
export type SeedQuestion = Omit<VocabularyQuestion, 'unitId'> & { unit: number; unitId?: string };

export type MasteryLevel = 'mastered' | 'familiar' | 'learning' | 'weak' | 'untested';

export interface WordMasteryRecord {
  wordId: string;
  totalAttempts: number;
  correctAttempts: number;
  consecutiveCorrect: number;
  consecutiveIncorrect: number;
  lastAttemptTime: number;
  lastResult: 'correct' | 'incorrect';
  masteryLevel: MasteryLevel;
  errorHistory: {
    userAnswer: string;
    timestamp: number;
    errorType: 'base_form_trap' | 'spelling_error' | 'inflection_error' | 'wrong_word';
  }[];
  bookmarked?: boolean;
}

export interface UserAnswerRecord {
  questionId: string;
  question: VocabularyQuestion;
  userAnswer: string;
  isCorrect: boolean;
  timeSpentSeconds: number;
  evaluation: AnswerEvaluation;
  timestamp: number;
}

export interface AnswerEvaluation {
  isCorrect: boolean;
  userNormalized: string;
  expectedNormalized: string;
  feedbackType: 'exact_match' | 'accepted_alias' | 'base_form_trap' | 'spelling_error' | 'inflection_error' | 'wrong_word' | 'empty';
  title: string;
  message: string;
  grammarTip?: string;
}

export interface ExamSessionResult {
  id: string;
  title: string;
  /** @deprecated v1/v2 field. */
  unit?: number | 'all';
  /** Units covered by this exam (stable IDs). */
  unitIds?: string[];
  /** Snapshot of unit names at exam time, so history survives renames/deletion. */
  unitNames?: string[];
  timestamp: number;
  totalQuestions: number;
  correctCount: number;
  incorrectCount: number;
  score: number; // 0 - 100
  accuracy: number; // 0 - 100%
  timeSpentSeconds: number;
  answers: UserAnswerRecord[];
}

export type AppView =
  | 'dashboard'
  | 'practice-setup'
  | 'practice'
  | 'exam'
  | 'results'
  | 'review'
  | 'analytics'
  | 'manager'
  | 'ai-settings'
  | 'ai-practice';

export interface PracticeConfig {
  mode: 'practice' | 'exam' | 'review';
  /** Unit IDs to draw questions from. */
  unitIds: string[];
  questionCount: number; // 10, 20, 30, or all (0)
  order: 'sequential' | 'random' | 'weakest-first';
  timed: boolean;
  timeLimitMinutes?: number;
  /** Optional explicit question list (e.g. retest exactly the words just missed). Overrides `units` filtering in practice. */
  questionIds?: string[];
  /** Optional label shown in the session header. */
  label?: string;
}

/** Options for AI-generated practice (dynamic question generation). */
export interface AIPracticeConfig {
  unitIds: string[];
  questionCount: number;
  difficulty: 'easy' | 'medium' | 'hard' | 'mixed';
  weakFirst: boolean;
  random: boolean;
  focusInflection: boolean;
  /** Explicit target word ids (e.g. from an AI report recommendation). */
  wordIds?: string[];
  /** Allow the model to introduce words outside the chosen units. Off by default. */
  allowExpansion?: boolean;
  label?: string;
}

export interface OverallStats {
  totalWords: number;
  testedWords: number;
  untestedWords: number;
  cumulativeAccuracy: number;
  masteredCount: number;
  familiarCount: number;
  learningCount: number;
  weakCount: number;
  totalPracticeCount: number;
  averageResponseTimeSeconds: number;
  bookmarkedCount: number;
}
