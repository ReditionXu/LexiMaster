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

export interface VocabularyQuestion {
  id: string; // e.g. "U1-001"
  unit: number; // 1, 2, 3, 4
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
}

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
  unit: number | 'all';
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
  | 'manager';

export interface PracticeConfig {
  mode: 'practice' | 'exam' | 'review';
  units: number[]; // e.g. [1], [2], or [1, 2]
  questionCount: number; // 10, 20, 30, or all (0)
  order: 'sequential' | 'random' | 'weakest-first';
  timed: boolean;
  timeLimitMinutes?: number;
  /** Optional explicit question list (e.g. retest exactly the words just missed). Overrides `units` filtering in practice. */
  questionIds?: string[];
  /** Optional label shown in the session header. */
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
