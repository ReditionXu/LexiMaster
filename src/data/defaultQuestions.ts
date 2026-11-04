import type { VocabularyQuestion } from '../types/index.ts';
import { OFFICIAL_QUESTIONS } from './officialQuestions.ts';

/**
 * 完整大学英语作业教材全量题库 (125 词题)
 * 涵盖：
 * - Unit 1: 27 题
 * - Unit 2: 31 题
 * - Unit 3: 33 题
 * - Unit 4: 34 题
 */
export const DEFAULT_QUESTIONS: VocabularyQuestion[] = OFFICIAL_QUESTIONS;
