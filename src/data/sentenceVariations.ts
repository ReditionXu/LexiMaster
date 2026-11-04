import { VocabularyQuestion } from '../types/index.ts';

export interface SentenceVariant {
  sentence: string;
  chineseHint: string;
  correctAnswer: string;
  acceptedAnswers: string[];
  grammarNote: string;
  explanation: string;
}

/**
 * 备选例句语境库：支持“每次练习相同单词，但语境句子不同”
 */
export const SENTENCE_VARIANTS: Record<string, SentenceVariant[]> = {
  infection: [
    {
      sentence: 'Patients recovering from major surgery must be closely monitored for any sign of internal _____.',
      chineseHint: '感染',
      correctAnswer: 'infection',
      acceptedAnswers: ['infection'],
      grammarNote: '不可数名词作介词宾语',
      explanation: 'sign of internal infection 意为“内部感染迹象”，使用名词 infection。',
    },
    {
      sentence: 'Sanitary hygiene practices in school cafeterias significantly reduce the hazard of bacterial _____.',
      chineseHint: '感染/传染',
      correctAnswer: 'infections',
      acceptedAnswers: ['infections', 'infection'],
      grammarNote: '名词复数形式',
      explanation: 'bacterial infections 意为“多起细菌感染”，可使用复数形式。',
    },
  ],
  predict: [
    {
      sentence: 'Few political analysts could have _____ the astonishing outcome of last week\'s referendum.',
      chineseHint: '预测',
      correctAnswer: 'predicted',
      acceptedAnswers: ['predicted'],
      grammarNote: '情态完成时 (could have + done)',
      explanation: 'could have 后面必须接动词过去分词 predicted。',
    },
    {
      sentence: 'With current statistical algorithms, it remains extraordinarily difficult to _____ stock market volatility.',
      chineseHint: '预测',
      correctAnswer: 'predict',
      acceptedAnswers: ['predict'],
      grammarNote: '形式主语 it 对应的真正主语 (to + do)',
      explanation: 'it is difficult to do sth 结构中，to 后面接动词原形 predict。',
    },
  ],
  insurance: [
    {
      sentence: 'Automobile drivers are legally obliged to maintain third-party liability _____ at all times.',
      chineseHint: '保险',
      correctAnswer: 'insurance',
      acceptedAnswers: ['insurance'],
      grammarNote: '不可数名词作宾语',
      explanation: 'liability insurance (责任保险) 为不可数名词。',
    },
  ],
  'take over': [
    {
      sentence: 'Following prolonged negotiations, the foreign enterprise finally _____ the regional distribution network.',
      chineseHint: '接手/接管',
      correctAnswer: 'took over',
      acceptedAnswers: ['took over'],
      grammarNote: '一般过去时 (take -> took)',
      explanation: 'finally 描述过去完成的接管行为，需使用过去式 took over。',
    },
    {
      sentence: 'A progressive tech startup is preparing to _____ several conventional logistics firms next quarter.',
      chineseHint: '接管/接手',
      correctAnswer: 'take over',
      acceptedAnswers: ['take over'],
      grammarNote: 'be preparing to 后接动词短语原形',
      explanation: 'preparing to do 接原形 take over。',
    },
  ],
  'show up': [
    {
      sentence: 'To the professor\'s pleasant surprise, every single enrolled student _____ for the early morning lecture.',
      chineseHint: '出现/到场',
      correctAnswer: 'showed up',
      acceptedAnswers: ['showed up'],
      grammarNote: '一般过去时 (Past Tense)',
      explanation: '描述早八讲座到场情况，使用过去式 showed up。',
    },
  ],
  challenge: [
    {
      sentence: 'Adapting to autonomous learning in college _____ traditional habits formed in high school.',
      chineseHint: '挑战/考验',
      correctAnswer: 'challenges',
      acceptedAnswers: ['challenges', 'challenged'],
      grammarNote: '动名词作主语，谓语动词用第三人称单数',
      explanation: 'Adapting ... 动名词短语作主语，一般现在时谓语动词加 -s，写作 challenges。',
    },
  ],
  inevitable: [
    {
      sentence: 'Given the accelerating speed of technological disruption, structural job reshuffling is entirely _____.',
      chineseHint: '不可避免的/必然的',
      correctAnswer: 'inevitable',
      acceptedAnswers: ['inevitable'],
      grammarNote: '系动词 is 后接形容词作表语',
      explanation: 'is entirely inevitable 意为“完全不可避免的”。',
    },
  ],
  combine: [
    {
      sentence: 'The architectural design beautifully _____ classical Chinese gardens with modern minimalist structures.',
      chineseHint: '结合/融合',
      correctAnswer: 'combines',
      acceptedAnswers: ['combines'],
      grammarNote: '第三人称单数 (3rd singular -s)',
      explanation: '主语 The architectural design 为单数，动词加 -s。',
    },
  ],
  surge: [
    {
      sentence: 'Demand for renewable solar panels has _____ across European markets over the past two years.',
      chineseHint: '激增/猛增',
      correctAnswer: 'surged',
      acceptedAnswers: ['surged'],
      grammarNote: '现在完成时 (has + done)',
      explanation: 'has 后面接动词过去分词 surged。',
    },
  ],
  preserve: [
    {
      sentence: 'Generations of dedicated curators worked diligently to _____ these fragile medieval silk banners.',
      chineseHint: '保护/保存',
      correctAnswer: 'preserve',
      acceptedAnswers: ['preserve'],
      grammarNote: '不定式 to + do 表目的',
      explanation: 'worked to do 结构中接动词原形 preserve。',
    },
  ],
  overcome: [
    {
      sentence: 'Humanity has historically _____ countless pandemics through international scientific collaboration.',
      chineseHint: '克服/战胜',
      correctAnswer: 'overcome',
      acceptedAnswers: ['overcome'],
      grammarNote: '现在完成时 (has + done: overcome-overcame-overcome)',
      explanation: 'has 后面接动词过去分词，overcome 的过去分词与原形同形，写作 overcome。',
    },
  ],
  dedicate: [
    {
      sentence: 'The newly inaugurated university auditorium was _____ to the esteemed founding chancellor.',
      chineseHint: '奉献/致力于/题献给',
      correctAnswer: 'dedicated',
      acceptedAnswers: ['dedicated'],
      grammarNote: '被动语态 (was + done)',
      explanation: 'was dedicated to 表示“被献给……”，使用过去分词。',
    },
  ],
  launch: [
    {
      sentence: 'The aerospace agency has successfully _____ a lunar exploration probe into orbit.',
      chineseHint: '发射/发起/推出',
      correctAnswer: 'launched',
      acceptedAnswers: ['launched'],
      grammarNote: '现在完成时 (has + done)',
      explanation: 'has launched 表示“已经成功发射”。',
    },
  ],
};

/**
 * 随机获取某道题目的备选句式，若无备选则保留原题
 */
export function getAlternateSentence(question: VocabularyQuestion): VocabularyQuestion {
  const variants = SENTENCE_VARIANTS[question.word.toLowerCase()];
  if (!variants || variants.length === 0) {
    return question;
  }

  // Pick a variant randomly
  const pick = variants[Math.floor(Math.random() * variants.length)];
  return {
    ...question,
    sentence: pick.sentence,
    chineseHint: pick.chineseHint,
    correctAnswer: pick.correctAnswer,
    acceptedAnswers: pick.acceptedAnswers,
    grammarNote: pick.grammarNote,
    explanation: pick.explanation,
  };
}
