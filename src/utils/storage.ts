import {
  VocabularyQuestion,
  WordMasteryRecord,
  UserAnswerRecord,
  ExamSessionResult,
  OverallStats,
  MasteryLevel,
} from '../types';
import { DEFAULT_QUESTIONS } from '../data/defaultQuestions';

const STORAGE_KEYS = {
  QUESTIONS: 'leximaster_questions_v2', // bumped to v2 for full 125-word official curriculum
  MASTERY: 'leximaster_mastery_v1',
  HISTORY: 'leximaster_history_v1',
  EXAMS: 'leximaster_exams_v1',
  SETTINGS: 'leximaster_settings_v1',
};

// Safe localStorage access with error boundary
function safeGet<T>(key: string, defaultValue: T): T {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (e) {
    console.error(`Failed to parse localStorage key: ${key}`, e);
    return defaultValue;
  }
}

function safeSet<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error(`Failed to write to localStorage key: ${key}`, e);
  }
}

/**
 * Question Bank management
 */
export function getStoredQuestions(): VocabularyQuestion[] {
  const stored = safeGet<VocabularyQuestion[] | null>(STORAGE_KEYS.QUESTIONS, null);
  if (!stored || stored.length === 0) {
    safeSet(STORAGE_KEYS.QUESTIONS, DEFAULT_QUESTIONS);
    return DEFAULT_QUESTIONS;
  }
  return stored;
}

export function saveStoredQuestions(questions: VocabularyQuestion[]): void {
  safeSet(STORAGE_KEYS.QUESTIONS, questions);
}

export function resetQuestionsToDefault(): VocabularyQuestion[] {
  safeSet(STORAGE_KEYS.QUESTIONS, DEFAULT_QUESTIONS);
  return DEFAULT_QUESTIONS;
}

/**
 * Mastery records map { [wordId]: WordMasteryRecord }
 */
export function getStoredMasteryRecords(): Record<string, WordMasteryRecord> {
  return safeGet<Record<string, WordMasteryRecord>>(STORAGE_KEYS.MASTERY, {});
}

export function saveStoredMasteryRecord(record: WordMasteryRecord): void {
  const current = getStoredMasteryRecords();
  current[record.wordId] = record;
  safeSet(STORAGE_KEYS.MASTERY, current);
}

export function toggleWordBookmark(wordId: string): boolean {
  const current = getStoredMasteryRecords();
  const existing = current[wordId];
  const newBookmarked = !(existing?.bookmarked ?? false);

  if (existing) {
    existing.bookmarked = newBookmarked;
  } else {
    current[wordId] = {
      wordId,
      totalAttempts: 0,
      correctAttempts: 0,
      consecutiveCorrect: 0,
      consecutiveIncorrect: 0,
      lastAttemptTime: Date.now(),
      lastResult: 'incorrect',
      masteryLevel: 'untested',
      errorHistory: [],
      bookmarked: newBookmarked,
    };
  }

  safeSet(STORAGE_KEYS.MASTERY, current);
  return newBookmarked;
}

/**
 * Historical Answers & Exams
 */
export function getStoredAnswerHistory(): UserAnswerRecord[] {
  return safeGet<UserAnswerRecord[]>(STORAGE_KEYS.HISTORY, []);
}

export function appendUserAnswerRecord(record: UserAnswerRecord): void {
  const history = getStoredAnswerHistory();
  history.push(record);
  // Cap at 2000 records to prevent storage quota issues
  if (history.length > 2000) {
    history.splice(0, history.length - 2000);
  }
  safeSet(STORAGE_KEYS.HISTORY, history);
}

export function getStoredExamResults(): ExamSessionResult[] {
  return safeGet<ExamSessionResult[]>(STORAGE_KEYS.EXAMS, []);
}

export function saveExamSessionResult(result: ExamSessionResult): void {
  const exams = getStoredExamResults();
  exams.unshift(result);
  safeSet(STORAGE_KEYS.EXAMS, exams);
}

/**
 * Compute overall metrics
 */
export function computeOverallStats(
  questions: VocabularyQuestion[],
  masteryMap: Record<string, WordMasteryRecord>,
  answerHistory: UserAnswerRecord[]
): OverallStats {
  const totalWords = questions.length;
  let testedWords = 0;
  let masteredCount = 0;
  let familiarCount = 0;
  let learningCount = 0;
  let weakCount = 0;
  let bookmarkedCount = 0;

  for (const q of questions) {
    const rec = masteryMap[q.id];
    if (rec && rec.totalAttempts > 0) {
      testedWords++;
      if (rec.masteryLevel === 'mastered') masteredCount++;
      else if (rec.masteryLevel === 'familiar') familiarCount++;
      else if (rec.masteryLevel === 'weak') weakCount++;
      else learningCount++;
    }
    if (rec?.bookmarked) {
      bookmarkedCount++;
    }
  }

  const untestedWords = Math.max(0, totalWords - testedWords);

  // Cumulative Accuracy
  const totalAnswers = answerHistory.length;
  const correctAnswers = answerHistory.filter((a) => a.isCorrect).length;
  const cumulativeAccuracy = totalAnswers > 0 ? Math.round((correctAnswers / totalAnswers) * 100) : 0;

  // Average response time
  const totalTime = answerHistory.reduce((sum, a) => sum + (a.timeSpentSeconds || 0), 0);
  const averageResponseTimeSeconds = totalAnswers > 0 ? Math.round((totalTime / totalAnswers) * 10) / 10 : 0;

  return {
    totalWords,
    testedWords,
    untestedWords,
    cumulativeAccuracy,
    masteredCount,
    familiarCount,
    learningCount,
    weakCount,
    totalPracticeCount: totalAnswers,
    averageResponseTimeSeconds,
    bookmarkedCount,
  };
}

/**
 * Backup and Export all user data as JSON
 */
export function exportAllDataAsJSON(): string {
  const data = {
    version: '1.0',
    exportTime: new Date().toISOString(),
    questions: getStoredQuestions(),
    mastery: getStoredMasteryRecords(),
    history: getStoredAnswerHistory(),
    exams: getStoredExamResults(),
  };
  return JSON.stringify(data, null, 2);
}

/**
 * Restore user data from JSON
 */
export function importAllDataFromJSON(jsonStr: string): { success: boolean; message: string } {
  try {
    const parsed = JSON.parse(jsonStr);
    if (!parsed || typeof parsed !== 'object') {
      return { success: false, message: '无效的 JSON 数据格式。' };
    }

    if (Array.isArray(parsed.questions)) {
      safeSet(STORAGE_KEYS.QUESTIONS, parsed.questions);
    }
    if (parsed.mastery && typeof parsed.mastery === 'object') {
      safeSet(STORAGE_KEYS.MASTERY, parsed.mastery);
    }
    if (Array.isArray(parsed.history)) {
      safeSet(STORAGE_KEYS.HISTORY, parsed.history);
    }
    if (Array.isArray(parsed.exams)) {
      safeSet(STORAGE_KEYS.EXAMS, parsed.exams);
    }

    return { success: true, message: '数据恢复成功！' };
  } catch (e: any) {
    return { success: false, message: `解析失败: ${e.message}` };
  }
}
