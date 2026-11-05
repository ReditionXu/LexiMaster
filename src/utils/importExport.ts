import * as XLSX from 'xlsx';
import { VocabularyQuestion, PartOfSpeech, Difficulty } from '../types';

export interface ImportValidationResult {
  validQuestions: VocabularyQuestion[];
  errors: { row: number; reason: string; rawData?: any }[];
  warnings: string[];
  totalParsed: number;
}

// Regex to find blank placeholders: _____ or {blank} or [blank]
const BLANK_REGEX = /_{3,}|\{blank\}|\[blank\]/g;

/**
 * Validates and normalizes a single question row
 */
/**
 * Maps an import row's unit reference (target unit, a number like 3, "Unit 3", or a unit name)
 * to a stable unit ID. There is no limit on how many units exist.
 */
export type UnitResolver = (ref: unknown, rowIndex: number) => string | undefined;

export function validateQuestionRow(
  raw: any,
  index: number,
  existingIds: Set<string>,
  resolveUnit?: UnitResolver
): { question?: VocabularyQuestion; error?: string } {
  if (!raw || typeof raw !== 'object') {
    return { error: `第 ${index + 1} 行数据格式错误，不是有效的对象。` };
  }

  // Unit resolution (dynamic — no fixed number of units)
  const unitRef = raw.unitId ?? raw.unit ?? raw.unitName;
  const unitId = resolveUnit?.(unitRef, index);
  if (!unitId) {
    return { error: `第 ${index + 1} 行无法确定所属单元（unit 列为空或无效），请选择导入目标单元或填写单元名称/编号。` };
  }
  const legacyNum = Number(String(unitRef ?? '').replace(/^unit\s*/i, ''));
  const unitTag = Number.isInteger(legacyNum) && legacyNum > 0 ? `U${legacyNum}` : 'U';

  // Word base form
  const word = String(raw.word || '').trim();
  if (!word) {
    return { error: `第 ${index + 1} 行缺少单词原形 (word)。` };
  }

  // Sentence validation
  const sentence = String(raw.sentence || '').trim();
  if (!sentence) {
    return { error: `第 ${index + 1} 行缺少英文例句 (sentence)。` };
  }

  // Check blank position in sentence
  const blanks = sentence.match(BLANK_REGEX);
  if (!blanks || blanks.length === 0) {
    return {
      error: `第 ${index + 1} 行句子未包含填空占位符（如 '_____' 或 '{blank}'）。例句: "${sentence}"`,
    };
  }
  if (blanks.length > 1) {
    return {
      error: `第 ${index + 1} 行句子包含多个填空占位符 (${blanks.length} 个)，请保证每道题恰好一个填空位。`,
    };
  }

  // Chinese hint
  const chineseHint = String(raw.chineseHint || raw.hint || raw.chinese || '').trim();
  if (!chineseHint) {
    return { error: `第 ${index + 1} 行缺少中文释义提示 (chineseHint)。` };
  }

  // Correct answer
  const correctAnswer = String(raw.correctAnswer || raw.answer || '').trim();
  if (!correctAnswer) {
    return { error: `第 ${index + 1} 行缺少正确答案 (correctAnswer)。` };
  }

  // Accepted answers
  let acceptedAnswers: string[] = [];
  if (Array.isArray(raw.acceptedAnswers)) {
    acceptedAnswers = raw.acceptedAnswers.map((s: any) => String(s).trim()).filter(Boolean);
  } else if (typeof raw.acceptedAnswers === 'string') {
    acceptedAnswers = (raw.acceptedAnswers as string)
      .split(/[,|;/]/)
      .map((s: string) => s.trim())
      .filter(Boolean);
  }
  if (!acceptedAnswers.includes(correctAnswer)) {
    acceptedAnswers.unshift(correctAnswer);
  }

  // Part of speech
  const validPOS: PartOfSpeech[] = ['verb', 'noun', 'adjective', 'adverb', 'phrase', 'other'];
  const rawPOS = String(raw.partOfSpeech || 'verb').toLowerCase();
  const partOfSpeech: PartOfSpeech = validPOS.includes(rawPOS as any) ? (rawPOS as any) : 'verb';

  // Difficulty
  const validDiff: Difficulty[] = ['easy', 'medium', 'hard'];
  const rawDiff = String(raw.difficulty || 'medium').toLowerCase();
  const difficulty: Difficulty = validDiff.includes(rawDiff as any) ? (rawDiff as any) : 'medium';

  // ID handling: prevent duplicate IDs
  let id = String(raw.id || '').trim();
  if (!id || existingIds.has(id)) {
    id = `${unitTag}-${word.slice(0, 4).toUpperCase()}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`;
  }
  existingIds.add(id);

  // Normalize sentence blank to standard "_____"
  const standardizedSentence = sentence.replace(BLANK_REGEX, '_____');

  const question: VocabularyQuestion = {
    id,
    unitId,
    word,
    sentence: standardizedSentence,
    chineseHint,
    correctAnswer,
    acceptedAnswers,
    partOfSpeech,
    grammarNote: String(raw.grammarNote || '').trim() || '语境语法填空',
    explanation: String(raw.explanation || '').trim() || `本题考查 ${word} 在当前语境下的正确形式 "${correctAnswer}"。`,
    difficulty,
    collocation: raw.collocation ? String(raw.collocation).trim() : undefined,
    phonetic: raw.phonetic ? String(raw.phonetic).trim() : undefined,
    isCustom: true,
  };

  return { question };
}

/**
 * Parse JSON Question Array
 */
export function parseJSONQuestions(
  jsonText: string,
  existingQuestions: VocabularyQuestion[],
  resolveUnit?: UnitResolver
): ImportValidationResult {
  const result: ImportValidationResult = {
    validQuestions: [],
    errors: [],
    warnings: [],
    totalParsed: 0,
  };

  let parsed: any;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e: any) {
    result.errors.push({ row: 0, reason: `JSON 格式解析失败: ${e.message}` });
    return result;
  }

  const items = Array.isArray(parsed) ? parsed : parsed.questions || [parsed];
  result.totalParsed = items.length;

  const existingIds = new Set(existingQuestions.map((q) => q.id));

  items.forEach((item: any, idx: number) => {
    const { question, error } = validateQuestionRow(item, idx, existingIds, resolveUnit);
    if (error) {
      result.errors.push({ row: idx + 1, reason: error, rawData: item });
    } else if (question) {
      result.validQuestions.push(question);
    }
  });

  return result;
}

/**
 * Parse CSV format
 */
export function parseCSVQuestions(
  csvText: string,
  existingQuestions: VocabularyQuestion[],
  resolveUnit?: UnitResolver
): ImportValidationResult {
  const result: ImportValidationResult = {
    validQuestions: [],
    errors: [],
    warnings: [],
    totalParsed: 0,
  };

  const workbook = XLSX.read(csvText, { type: 'string' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    result.errors.push({ row: 0, reason: 'CSV 文件内容为空。' });
    return result;
  }

  const rawRows: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
  result.totalParsed = rawRows.length;

  const existingIds = new Set(existingQuestions.map((q) => q.id));

  rawRows.forEach((row, idx) => {
    const { question, error } = validateQuestionRow(row, idx, existingIds, resolveUnit);
    if (error) {
      result.errors.push({ row: idx + 1, reason: error, rawData: row });
    } else if (question) {
      result.validQuestions.push(question);
    }
  });

  return result;
}

/**
 * Parse Excel (XLSX / XLS) format from binary buffer
 */
export function parseExcelQuestions(
  fileBuffer: ArrayBuffer,
  existingQuestions: VocabularyQuestion[],
  resolveUnit?: UnitResolver
): ImportValidationResult {
  const result: ImportValidationResult = {
    validQuestions: [],
    errors: [],
    warnings: [],
    totalParsed: 0,
  };

  try {
    const workbook = XLSX.read(fileBuffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      result.errors.push({ row: 0, reason: 'Excel 文件内没有有效的工作表。' });
      return result;
    }

    const rawRows: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
    result.totalParsed = rawRows.length;

    const existingIds = new Set(existingQuestions.map((q) => q.id));

    rawRows.forEach((row, idx) => {
      const { question, error } = validateQuestionRow(row, idx, existingIds, resolveUnit);
      if (error) {
        result.errors.push({ row: idx + 2, reason: error, rawData: row }); // Excel is 1-indexed header + 1
      } else if (question) {
        result.validQuestions.push(question);
      }
    });
  } catch (e: any) {
    result.errors.push({ row: 0, reason: `Excel 文件读取失败: ${e.message}` });
  }

  return result;
}

/**
 * Export Question Bank to XLSX
 */
export function exportQuestionsToExcel(
  questions: VocabularyQuestion[],
  filename = 'LexiMaster_Vocabulary.xlsx',
  unitName: (id: string) => string = (id) => id
) {
  const rows = questions.map((q) => ({
    id: q.id,
    unit: unitName(q.unitId),
    word: q.word,
    sentence: q.sentence,
    chineseHint: q.chineseHint,
    correctAnswer: q.correctAnswer,
    acceptedAnswers: q.acceptedAnswers.join('; '),
    partOfSpeech: q.partOfSpeech,
    grammarNote: q.grammarNote,
    explanation: q.explanation,
    difficulty: q.difficulty,
    collocation: q.collocation || '',
    phonetic: q.phonetic || '',
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Vocabulary');
  XLSX.writeFile(workbook, filename);
}

/**
 * Export Question Bank to CSV
 */
export function exportQuestionsToCSV(
  questions: VocabularyQuestion[],
  filename = 'LexiMaster_Vocabulary.csv',
  unitName: (id: string) => string = (id) => id
) {
  const rows = questions.map((q) => ({
    id: q.id,
    unit: unitName(q.unitId),
    word: q.word,
    sentence: q.sentence,
    chineseHint: q.chineseHint,
    correctAnswer: q.correctAnswer,
    acceptedAnswers: q.acceptedAnswers.join('; '),
    partOfSpeech: q.partOfSpeech,
    grammarNote: q.grammarNote,
    explanation: q.explanation,
    difficulty: q.difficulty,
    collocation: q.collocation || '',
    phonetic: q.phonetic || '',
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const csvContent = XLSX.utils.sheet_to_csv(worksheet);
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Download sample Excel template for users to easily fill in Unit 1 and Unit 2
 */
export function downloadVocabularyTemplate(format: 'xlsx' | 'csv' = 'xlsx') {
  const sampleRows = [
    {
      unit: 'Unit 1',
      word: 'achieve',
      sentence: 'She finally _____ her dream of becoming a surgeon.',
      chineseHint: '实现',
      correctAnswer: 'achieved',
      acceptedAnswers: 'achieved',
      partOfSpeech: 'verb',
      grammarNote: '一般过去时',
      explanation: '句中描述过去发生的动作，需使用过去式 achieved。',
      difficulty: 'easy',
      collocation: 'achieve dream',
      phonetic: '/əˈtʃiːv/',
    },
    {
      unit: 'Unit 1',
      word: 'reduce',
      sentence: 'The council adopted strict guidelines to _____ energy waste.',
      chineseHint: '减少',
      correctAnswer: 'reduce',
      acceptedAnswers: 'reduce',
      partOfSpeech: 'verb',
      grammarNote: '不定式 to + do',
      explanation: '不定式 to 后接动词原形 reduce。',
      difficulty: 'easy',
      collocation: 'reduce waste',
      phonetic: '/rɪˈdjuːs/',
    },
    {
      unit: 'Unit 2',
      word: 'sustain',
      sentence: 'Green innovation provides _____ solutions for long-term urban growth.',
      chineseHint: '可持续的',
      correctAnswer: 'sustainable',
      acceptedAnswers: 'sustainable',
      partOfSpeech: 'adjective',
      grammarNote: '形容词修饰名词',
      explanation: '修饰名词 solutions，使用形容词 sustainable。',
      difficulty: 'medium',
      collocation: 'sustainable development',
      phonetic: '/səˈsteɪnəbl/',
    },
  ];

  const worksheet = XLSX.utils.json_to_sheet(sampleRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Template');

  if (format === 'xlsx') {
    XLSX.writeFile(workbook, 'LexiMaster_Import_Template.xlsx');
  } else {
    const csvContent = XLSX.utils.sheet_to_csv(worksheet);
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'LexiMaster_Import_Template.csv';
    link.click();
    URL.revokeObjectURL(url);
  }
}
