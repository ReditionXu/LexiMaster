import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import confetti from 'canvas-confetti';
import { ArrowDownRight, ArrowUpRight, Check, ChevronDown, Home, RotateCcw, X } from 'lucide-react';
import { ExamSessionResult, UserAnswerRecord, VocabularyQuestion } from '../../types';
import { splitSentence } from '../../lib/insights';
import { duration, ease, riseIn, staggerContainer } from '../../lib/motion';
import { Button } from '../ui/Button';
import { Segmented } from '../ui/Segmented';
import { AnimatedNumber, ProgressRing } from '../ui/DataViz';
import { AnswerDiff, SpeakButton } from '../sentence/SentenceClozeInput';
import { AIExplainCard } from '../ai/AIExplainCard';

interface ResultReportProps {
  result: ExamSessionResult;
  previousExams?: ExamSessionResult[];
  onRetestIncorrect: (wrongQuestions: VocabularyQuestion[]) => void;
  onReturnToDashboard: () => void;
}

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export const ResultReport: React.FC<ResultReportProps> = ({
  result,
  previousExams = [],
  onRetestIncorrect,
  onReturnToDashboard,
}) => {
  const [filterMode, setFilterMode] = useState<'all' | 'incorrect' | 'correct'>(
    result.incorrectCount > 0 ? 'incorrect' : 'all'
  );
  const ringId = useRef(`result-${result.id}`).current;

  // Error diagnosis from real answer records (logic unchanged)
  const wrongAnswers = result.answers.filter((a) => !a.isCorrect);
  const baseFormMistakes = wrongAnswers.filter((a) => a.evaluation.feedbackType === 'base_form_trap').length;
  const spellingMistakes = wrongAnswers.filter((a) => a.evaluation.feedbackType === 'spelling_error').length;
  const inflectionMistakes = wrongAnswers.filter((a) => a.evaluation.feedbackType === 'inflection_error').length;
  const otherMistakes = wrongAnswers.length - baseFormMistakes - spellingMistakes - inflectionMistakes;

  const recommendations: string[] = [];
  if (result.score === 100) {
    recommendations.push('满分通过！语境时态与词形变体掌握非常扎实，建议保持手感或挑战综合混刷。');
  } else {
    if (baseFormMistakes > 0)
      recommendations.push(
        `本次有 ${baseFormMistakes} 处因直接填写单词原形而失分。大学英语填空重点考查上下文时态与被动语态，切勿忽略动词过去分词与现在分词。`
      );
    if (inflectionMistakes > 0)
      recommendations.push(
        `本次有 ${inflectionMistakes} 处时态或词尾屈折选用偏差（如 -ed / -ing / 复数 -s），建议复习现在完成时与名词复数规则。`
      );
    if (spellingMistakes > 0)
      recommendations.push(
        `本次有 ${spellingMistakes} 处为近音/拼写细微瑕疵，建议注意派生词词根拼写（如 maintain -> maintenance）。`
      );
    if (recommendations.length === 0 && wrongAnswers.length > 0)
      recommendations.push('建议点击「重练错题」，对本次失分词汇进行定向巩固。');
  }

  const wrongQuestions = wrongAnswers.map((a) => a.question);
  const displayed = result.answers
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => (filterMode === 'incorrect' ? !a.isCorrect : filterMode === 'correct' ? a.isCorrect : true));

  const prev = previousExams.find((e) => e.timestamp < result.timestamp);
  const delta = prev ? result.score - prev.score : null;

  const tier =
    result.score >= 90
      ? { en: 'Outstanding.', color: 'rgb(var(--success))' }
      : result.score >= 75
      ? { en: 'Well done.', color: 'rgb(var(--accent))' }
      : result.score >= 60
      ? { en: 'Passing — with room to grow.', color: 'rgb(var(--warning))' }
      : { en: 'Let’s close the gaps.', color: 'rgb(var(--danger))' };

  useEffect(() => {
    if (result.score >= 90 && result.totalQuestions >= 5) {
      const t = setTimeout(
        () =>
          confetti({
            particleCount: 80,
            spread: 80,
            startVelocity: 34,
            scalar: 0.85,
            ticks: 180,
            origin: { x: 0.3, y: 0.3 },
            colors: ['#4F46E5', '#8184FF', '#16915A', '#E8B252'],
            disableForReducedMotion: true,
          }),
        duration.report * 1000
      );
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const errorRows = [
    { label: '原形陷阱', hint: '需要变形却填了原形', value: baseFormMistakes, color: 'bg-warning' },
    { label: '词尾屈折', hint: '-ed / -ing / 复数混淆', value: inflectionMistakes, color: 'bg-danger' },
    { label: '拼写细节', hint: '1–2 个字符的偏差', value: spellingMistakes, color: 'bg-accent' },
    { label: '其他', hint: '用词错误或未作答', value: otherMistakes, color: 'bg-ink-3' },
  ];
  const maxErr = Math.max(1, ...errorRows.map((r) => r.value));

  return (
    <motion.div variants={staggerContainer(0.07)} initial="initial" animate="animate" className="mx-auto max-w-[920px] space-y-12">
      {/* ------------------------------------------------------------ Score */}
      <motion.section variants={riseIn} className="grid items-center gap-8 sm:grid-cols-[auto_1fr] sm:gap-12">
        <ProgressRing value={result.score / 100} size={200} stroke={9} color={tier.color} slow delay={0.15} className="mx-auto">
          <div className="flex flex-col items-center">
            <AnimatedNumber
              id={ringId}
              value={result.score}
              duration={duration.report}
              className="text-[60px] font-semibold leading-none tracking-[-0.045em] text-ink"
            />
            <span className="mt-1 text-[12.5px] text-ink-3">/ 100 分</span>
          </div>
        </ProgressRing>

        <div className="text-center sm:text-left">
          <div className="eyebrow">Assessment report</div>
          <h1 className="mt-3 font-serif text-[36px] font-medium leading-[1.1] tracking-[-0.02em] text-ink sm:text-[42px]">
            {tier.en}
          </h1>
          <p className="mt-3 text-[14.5px] text-ink-2">
            {result.title} ·{' '}
            {new Date(result.timestamp).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
          {delta !== null && (
            <p
              className={`mt-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12.5px] font-medium ${
                delta >= 0 ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'
              }`}
            >
              {delta >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
              比上次 {delta >= 0 ? '+' : ''}
              {delta} 分
            </p>
          )}
          <div className="mt-7 flex flex-col gap-2 sm:flex-row">
            {wrongAnswers.length > 0 && (
              <Button variant="primary" size="lg" leading={<RotateCcw />} onClick={() => onRetestIncorrect(wrongQuestions)}>
                重练 {wrongAnswers.length} 道错题
              </Button>
            )}
            <Button variant={wrongAnswers.length ? 'secondary' : 'primary'} size="lg" leading={<Home />} onClick={onReturnToDashboard}>
              返回首页
            </Button>
          </div>
        </div>
      </motion.section>

      {/* ------------------------------------------------------------ Stats */}
      <motion.section variants={riseIn} className="card grid grid-cols-2 divide-line sm:grid-cols-4 sm:divide-x">
        {[
          { k: '正确', v: String(result.correctCount), tone: 'text-success' },
          { k: '错误', v: String(result.incorrectCount), tone: result.incorrectCount ? 'text-danger' : 'text-ink' },
          { k: '总用时', v: fmt(result.timeSpentSeconds), tone: 'text-ink' },
          {
            k: '平均每题',
            v: `${Math.round(result.timeSpentSeconds / Math.max(1, result.totalQuestions))}s`,
            tone: 'text-ink',
          },
        ].map((s, i) => (
          <motion.div
            key={s.k}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 + i * 0.07, duration: 0.35, ease: ease.out }}
            className={`p-5 ${i < 2 ? 'border-b border-line sm:border-b-0' : ''} ${i % 2 === 0 ? 'border-r border-line sm:border-r-0' : ''}`}
          >
            <div className="text-[12.5px] text-ink-3">{s.k}</div>
            <div className={`num mt-1.5 text-[26px] font-semibold tracking-tight ${s.tone}`}>{s.v}</div>
          </motion.div>
        ))}
      </motion.section>

      {/* ------------------------------------------------------------ Diagnosis */}
      {wrongAnswers.length > 0 || recommendations.length > 0 ? (
        <motion.section variants={riseIn} className="grid gap-4 md:grid-cols-[1fr_1.1fr]">
          <div className="card p-6">
            <h3 className="text-[15px] font-semibold text-ink">失分归因</h3>
            <p className="mt-1 text-[13px] text-ink-3">来自本次 {wrongAnswers.length} 道错题的判题结果</p>
            <div className="mt-5 space-y-4">
              {errorRows.map((r, i) => (
                <div key={r.label}>
                  <div className="mb-1.5 flex items-baseline justify-between text-[13px]">
                    <span className="font-medium text-ink">
                      {r.label}
                      <span className="ml-2 font-normal text-ink-3">{r.hint}</span>
                    </span>
                    <span className="num font-semibold text-ink">{r.value}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-sunken">
                    <motion.div
                      className={`h-full rounded-full ${r.color}`}
                      initial={{ width: 0 }}
                      animate={{ width: `${(r.value / maxErr) * 100}%` }}
                      transition={{ delay: 0.6 + i * 0.06, duration: 0.6, ease: ease.out }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="card p-6">
            <h3 className="text-[15px] font-semibold text-ink">复习建议</h3>
            <ul className="mt-4 space-y-3">
              {recommendations.map((rec, i) => (
                <li key={i} className="flex gap-3 text-[14px] leading-relaxed text-ink-2">
                  <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  {rec}
                </li>
              ))}
            </ul>
          </div>
        </motion.section>
      ) : null}

      {/* ------------------------------------------------------------ Review */}
      <motion.section variants={riseIn}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[19px] font-semibold tracking-tight text-ink">逐题复盘</h2>
          <Segmented
            value={filterMode}
            onChange={setFilterMode}
            ariaLabel="筛选题目"
            options={[
              { value: 'incorrect', label: '错题', count: result.incorrectCount },
              { value: 'correct', label: '正确', count: result.correctCount },
              { value: 'all', label: '全部', count: result.answers.length },
            ]}
          />
        </div>
        <div className="card divide-y divide-line overflow-hidden">
          <AnimatePresence initial={false} mode="popLayout">
            {displayed.length === 0 ? (
              <motion.p key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-6 py-10 text-center text-[13.5px] text-ink-3">
                这里没有题目。
              </motion.p>
            ) : (
              displayed.map(({ a, i }) => <ReviewRow key={a.questionId + i} record={a} index={i} />)
            )}
          </AnimatePresence>
        </div>
      </motion.section>
    </motion.div>
  );
};

const ReviewRow: React.FC<{ record: UserAnswerRecord; index: number }> = ({ record, index }) => {
  const [open, setOpen] = useState(false);
  const q = record.question;
  const { before, after } = splitSentence(q.sentence);
  return (
    <motion.div layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-start gap-4 px-5 py-4 text-left transition-colors hover:bg-sunken/50 sm:px-6"
      >
        <span
          className={`mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
            record.isCorrect ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'
          }`}
        >
          {record.isCorrect ? <Check className="h-3 w-3" strokeWidth={3} /> : <X className="h-3 w-3" strokeWidth={3} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-serif text-[17px] leading-[1.65] text-ink">
            {before}
            <span className={`mx-0.5 italic font-medium ${record.isCorrect ? 'text-success' : 'text-ink'} underline decoration-[1.5px] underline-offset-4 ${record.isCorrect ? 'decoration-success/50' : 'decoration-danger/50'}`}>
              {record.isCorrect ? record.userAnswer : q.correctAnswer}
            </span>
            <span className="ml-1 rounded-full bg-sunken px-1.5 py-[1px] align-[2px] font-sans text-[11.5px] text-ink-2">{q.chineseHint}</span>
            {after}
          </span>
          <span className="mt-1 block text-[12px] text-ink-3">
            #{index + 1} · {q.grammarNote}
            {!record.isCorrect && (
              <>
                {' '}· 你的作答 <span className="font-serif italic text-danger">{record.userAnswer || '未作答'}</span>
              </>
            )}
          </span>
        </span>
        <ChevronDown className={`mt-1.5 h-4 w-4 shrink-0 text-ink-3 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.26, ease: ease.out }}
            className="overflow-hidden"
          >
            <div className="space-y-3 px-5 pb-5 pl-14 sm:px-6 sm:pl-[60px]">
              {!record.isCorrect && <AnswerDiff user={record.userAnswer} correct={q.correctAnswer} />}
              <p className="text-[13.5px] leading-relaxed text-ink-2">{q.explanation}</p>
              {/* Exam already submitted — explanations are allowed now. Manual to control cost. */}
              {!record.isCorrect && <AIExplainCard question={q} userAnswer={record.userAnswer} evaluation={record.evaluation} trigger="manual" compact />}
              <div className="flex items-center gap-2 text-[12px] text-ink-3">
                <span>原形 <span className="font-serif italic text-ink-2">{q.word}</span></span>
                <SpeakButton question={q} label />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
