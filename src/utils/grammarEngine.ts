import type { VocabularyQuestion, AnswerEvaluation, MasteryLevel, WordMasteryRecord } from '../types/index.ts';

/**
 * Compute Levenshtein distance between two strings
 */
export function getLevenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  const lenA = a.length;
  const lenB = b.length;

  if (lenA === 0) return lenB;
  if (lenB === 0) return lenA;

  for (let i = 0; i <= lenB; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= lenA; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= lenB; i++) {
    for (let j = 1; j <= lenA; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[lenB][lenA];
}

/**
 * Normalizes an answer string for robust comparison
 */
export function normalizeAnswer(ans: string): string {
  if (!ans) return '';
  return ans
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' '); // collapse extra spaces in phrasal answers
}

/**
 * Evaluates a user's answer against a question's rules and context
 */
export function evaluateAnswer(
  userRawInput: string,
  question: VocabularyQuestion
): AnswerEvaluation {
  const userNorm = normalizeAnswer(userRawInput);
  const correctNorm = normalizeAnswer(question.correctAnswer);
  const baseNorm = normalizeAnswer(question.word);
  const acceptedNorms = (question.acceptedAnswers || []).map(normalizeAnswer);

  if (!userNorm) {
    return {
      isCorrect: false,
      userNormalized: '',
      expectedNormalized: question.correctAnswer,
      feedbackType: 'empty',
      title: '未作答 (Empty Answer)',
      message: '请输入英文单词后再提交。',
      grammarTip: question.grammarNote ? `考查语法：${question.grammarNote}` : undefined,
    };
  }

  // 1. Direct match with primary answer
  if (userNorm === correctNorm) {
    return {
      isCorrect: true,
      userNormalized: userNorm,
      expectedNormalized: question.correctAnswer,
      feedbackType: 'exact_match',
      title: '回答完全正确！ (Correct)',
      message: '完美符合语法语境与词形要求。',
      grammarTip: question.grammarNote ? `语法考点：${question.grammarNote}` : undefined,
    };
  }

  // 2. Match with accepted alternatives
  if (acceptedNorms.includes(userNorm)) {
    return {
      isCorrect: true,
      userNormalized: userNorm,
      expectedNormalized: question.correctAnswer,
      feedbackType: 'accepted_alias',
      title: '回答正确！ (Accepted Alternative)',
      message: `可接受答案：${userRawInput.trim()}。标准推荐答案为：${question.correctAnswer}。`,
      grammarTip: question.grammarNote ? `语法考点：${question.grammarNote}` : undefined,
    };
  }

  // 3. Base Form Trap detection (User input base lemma while inflected form is required!)
  if (userNorm === baseNorm && baseNorm !== correctNorm) {
    return {
      isCorrect: false,
      userNormalized: userNorm,
      expectedNormalized: question.correctAnswer,
      feedbackType: 'base_form_trap',
      title: '词形未作语法变化！ (Base Form Error)',
      message: `你输入了单词原形 "${userRawInput.trim()}"。但在本句语境中，必须使用符合句式语法的正确变体形式。`,
      grammarTip: question.explanation || `本句需要结合语境使用 ${question.grammarNote || '正确的屈折变形'}，正确形式为 "${question.correctAnswer}"。`,
    };
  }

  // 4. Spelling distance check (Levenshtein)
  const distance = getLevenshteinDistance(userNorm, correctNorm);
  const threshold = correctNorm.length <= 4 ? 1 : 2;

  if (distance <= threshold) {
    return {
      isCorrect: false,
      userNormalized: userNorm,
      expectedNormalized: question.correctAnswer,
      feedbackType: 'spelling_error',
      title: '拼写瑕疵 (Spelling Error)',
      message: `你的输入 "${userRawInput.trim()}" 与正确答案非常接近，但存在轻微拼写错误。`,
      grammarTip: `正确拼写为 "${question.correctAnswer}"。${question.explanation}`,
    };
  }

  // 5. Common inflection suffix mismatch (e.g. wrote -ing instead of -ed, or -s instead of -ed)
  const endsWithEd = correctNorm.endsWith('ed') || correctNorm.endsWith('d');
  const endsWithIng = correctNorm.endsWith('ing');
  const endsWithS = correctNorm.endsWith('s') || correctNorm.endsWith('es');

  if (
    (endsWithEd && userNorm.endsWith('ing')) ||
    (endsWithIng && userNorm.endsWith('ed')) ||
    (endsWithS && !userNorm.endsWith('s'))
  ) {
    return {
      isCorrect: false,
      userNormalized: userNorm,
      expectedNormalized: question.correctAnswer,
      feedbackType: 'inflection_error',
      title: '时态/词尾屈折错误 (Inflection Error)',
      message: `词形变体选用不当。本句语法环境要求特定的屈折词尾。`,
      grammarTip: question.explanation || `语法提示：${question.grammarNote}。正确形式为 "${question.correctAnswer}"。`,
    };
  }

  // 6. Generic Incorrect Answer
  return {
    isCorrect: false,
    userNormalized: userNorm,
    expectedNormalized: question.correctAnswer,
    feedbackType: 'wrong_word',
    title: '回答有误 (Incorrect)',
    message: `未能识别出符合语境的正确答案。`,
    grammarTip: question.explanation || `正确答案是 "${question.correctAnswer}"（中文释义：${question.chineseHint}）。`,
  };
}

/**
 * Calculates updated mastery level given previous record and current result
 */
export function calculateMastery(
  previousRecord: WordMasteryRecord | undefined,
  wordId: string,
  isCorrect: boolean,
  userAnswer: string,
  feedbackType: AnswerEvaluation['feedbackType']
): WordMasteryRecord {
  const now = Date.now();
  const currentTotal = (previousRecord?.totalAttempts || 0) + 1;
  const currentCorrect = (previousRecord?.correctAttempts || 0) + (isCorrect ? 1 : 0);
  const consecutiveCorrect = isCorrect ? (previousRecord?.consecutiveCorrect || 0) + 1 : 0;
  const consecutiveIncorrect = !isCorrect ? (previousRecord?.consecutiveIncorrect || 0) + 1 : 0;

  // Classify error type
  const errorHistory = [...(previousRecord?.errorHistory || [])];
  if (!isCorrect) {
    let errorType: 'base_form_trap' | 'spelling_error' | 'inflection_error' | 'wrong_word' = 'wrong_word';
    if (feedbackType === 'base_form_trap') errorType = 'base_form_trap';
    else if (feedbackType === 'spelling_error') errorType = 'spelling_error';
    else if (feedbackType === 'inflection_error') errorType = 'inflection_error';

    errorHistory.push({
      userAnswer,
      timestamp: now,
      errorType,
    });
  }

  // Determine mastery level according to transparent 4-tier rules:
  // 1. Mastered: 3+ consecutive correct, or >= 3 attempts with >= 85% accuracy and last attempt correct
  // 2. Familiar: Last attempt was correct, but total attempts is 1-2 or has prior mistakes
  // 3. Weak: 2+ consecutive incorrect, or total attempts >= 2 with accuracy < 50%
  // 4. Learning: In between (tested, fluctuating, not yet solid)
  let masteryLevel: MasteryLevel = 'learning';

  const accuracy = currentCorrect / currentTotal;

  if (consecutiveCorrect >= 3 || (currentTotal >= 3 && accuracy >= 0.85 && isCorrect)) {
    masteryLevel = 'mastered';
  } else if (consecutiveIncorrect >= 2 || (currentTotal >= 2 && accuracy < 0.5 && !isCorrect)) {
    masteryLevel = 'weak';
  } else if (isCorrect) {
    masteryLevel = 'familiar';
  } else {
    masteryLevel = 'learning';
  }

  return {
    wordId,
    totalAttempts: currentTotal,
    correctAttempts: currentCorrect,
    consecutiveCorrect,
    consecutiveIncorrect,
    lastAttemptTime: now,
    lastResult: isCorrect ? 'correct' : 'incorrect',
    masteryLevel,
    errorHistory,
    bookmarked: previousRecord?.bookmarked ?? false,
  };
}
