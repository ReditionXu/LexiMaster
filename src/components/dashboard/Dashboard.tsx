import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, ArrowUpRight, Flame, RefreshCw, Shuffle, Timer } from 'lucide-react';
import {
  VocabularyQuestion,
  WordMasteryRecord,
  OverallStats,
  AppView,
  PracticeConfig,
  UserAnswerRecord,
  ExamSessionResult,
  AnswerEvaluation,
} from '../../types';
import { evaluateAnswer, calculateMastery } from '../../utils/grammarEngine';
import {
  getDailyActivity,
  getStreakDays,
  getUnitMetrics,
  MASTERY_META,
  relativeTime,
} from '../../lib/insights';
import { ease, riseIn, spring, staggerContainer } from '../../lib/motion';
import { Button } from '../ui/Button';
import { AnimatedNumber, ProgressRing, Sparkline, StackedBar } from '../ui/DataViz';
import { SectionTitle } from '../ui/Common';
import { ClozeLine } from '../sentence/SentenceClozeInput';
import { activeUnits, unitDisplay, unitLabel, unitTone } from '../../lib/units';
import type { Unit } from '../../types';

interface DashboardProps {
  questions: VocabularyQuestion[];
  units: Unit[];
  /** Shown when an exam was interrupted (e.g. by a refresh). */
  pendingExam?: { title: string; answered: number; total: number } | null;
  onResumeExam?: () => void;
  onDiscardExam?: () => void;
  onOpenAIPractice?: () => void;
  masteryRecords: Record<string, WordMasteryRecord>;
  history: UserAnswerRecord[];
  exams: ExamSessionResult[];
  stats: OverallStats;
  onStartPractice: (config: PracticeConfig) => void;
  onStartExam: (config: PracticeConfig) => void;
  onNavigate: (view: AppView) => void;
  onRecordAnswer: (record: UserAnswerRecord, mastery: WordMasteryRecord) => void;
}

const toneVar: Record<string, string> = {
  accent: 'rgb(var(--accent))',
  sky: 'rgb(var(--sky))',
  plum: 'rgb(var(--plum))',
  ink: 'rgb(var(--ink-2))',
};

export const Dashboard: React.FC<DashboardProps> = ({
  questions,
  units: allUnits,
  pendingExam,
  onResumeExam,
  onDiscardExam,
  onOpenAIPractice,
  masteryRecords,
  history,
  stats,
  onStartPractice,
  onStartExam,
  onNavigate,
  onRecordAnswer,
}) => {
  const unitList = activeUnits(allUnits);
  const units = unitList.map((u) => u.id);
  // The first two units (by the user's own ordering) are featured — no hardcoded unit numbers.
  const featured = units.slice(0, 2);
  const extended = units.slice(2);
  const streak = useMemo(() => getStreakDays(history), [history]);
  const today = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });

  const startMidterm = () =>
    onStartPractice({ mode: 'practice', unitIds: featured.length ? featured : units, questionCount: 0, order: 'random', timed: false });
  const startMock = () =>
    onStartExam({
      mode: 'exam',
      unitIds: featured.length ? featured : units,
      questionCount: 20,
      order: 'random',
      timed: true,
      timeLimitMinutes: 15,
    });

  return (
    <motion.div variants={staggerContainer(0.06)} initial="initial" animate="animate" className="flex flex-col gap-10 sm:gap-12">
      {pendingExam && (
        <motion.div
          variants={riseIn}
          className="order-0 flex flex-col gap-3 rounded-xl border border-accent/30 bg-accent-soft/50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between lg:order-none"
          role="status"
        >
          <div className="text-[14px] text-ink">
            <span className="font-semibold">有一场未完成的模拟考试</span>
            <span className="ml-2 text-ink-2">
              {pendingExam.title} · 已答 {pendingExam.answered}/{pendingExam.total}
            </span>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={onDiscardExam}>
              放弃
            </Button>
            <Button size="sm" variant="primary" onClick={onResumeExam} trailing={<ArrowRight />} nudge>
              继续考试
            </Button>
          </div>
        </motion.div>
      )}

      {/* ------------------------------------------------------------------ Hero */}
      <section className="contents lg:order-1 lg:grid lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-14 lg:pt-2">
        <motion.div variants={riseIn} className="order-1 lg:order-none">
          <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-ink-2">
            <span>{today}</span>
            {streak > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-[12px] font-medium text-warning-ink">
                <Flame className="h-3 w-3" />
                连续学习 {streak} 天
              </span>
            )}
          </div>
          <h1 className="font-serif text-display font-medium text-ink">
            Make every{' '}
            <span className="relative inline-block italic">
              word
              <motion.span
                aria-hidden
                className="absolute -bottom-[0.04em] left-0 h-[0.07em] w-full origin-left rounded-full bg-accent"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.7, delay: 0.35, ease: ease.out }}
              />
            </span>{' '}
            count.
          </h1>
          <p className="mt-5 max-w-[30rem] text-[16px] leading-[1.75] text-ink-2">
            在真实语境中练习词汇，精准发现薄弱点，让每一次复习都更有效。
          </p>
          <div className="mt-8 grid grid-cols-2 gap-2.5 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
            <Button variant="primary" size="lg" onClick={startMidterm} trailing={<ArrowRight />} nudge className="max-sm:!px-3 max-sm:!text-[14px]">
              Start Practicing
            </Button>
            <Button variant="secondary" size="lg" onClick={startMock} leading={<Timer />} className="max-sm:!px-3 max-sm:!text-[14px]">
              Take a Mock Exam
            </Button>
          </div>
          <p className="mt-5 text-[12.5px] text-ink-3">
            默认练习前两个单元 · 模考 20 题 / 15 分钟 ·{' '}
            <button onClick={() => onNavigate('practice-setup')} className="underline decoration-line-strong underline-offset-4 hover:text-ink">
              自定义
            </button>
            {onOpenAIPractice && (
              <>
                {' · '}
                <button onClick={onOpenAIPractice} className="underline decoration-line-strong underline-offset-4 hover:text-ink">
                  AI 智能出题
                </button>
              </>
            )}
          </p>
        </motion.div>

        <motion.div variants={riseIn} className="order-4 lg:order-none">
          <QuickCheck
            questions={questions}
            units={allUnits}
            featured={featured}
            masteryRecords={masteryRecords}
            stats={stats}
            onRecordAnswer={onRecordAnswer}
          />
        </motion.div>
      </section>

      {/* ------------------------------------------------------------------ Stats */}
      <motion.section variants={riseIn} className="order-3 lg:order-2">
        <StatsStrip
          stats={stats}
          history={history}
          questions={questions}
          masteryRecords={masteryRecords}
          onReview={() => onNavigate('review')}
        />
      </motion.section>

      {/* ------------------------------------------------------------------ Units */}
      <motion.section variants={riseIn} className="order-2 lg:order-3">
        <SectionTitle
          title="选择单元"
          hint="期中考试重点考查 Unit 1 与 Unit 2，也可以混合全部单元练习。"
          action={
            <Button variant="ghost" size="sm" onClick={() => onNavigate('practice-setup')} trailing={<ArrowRight />} nudge>
              自定义练习
            </Button>
          }
        />
        <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0 md:grid-cols-2 lg:grid-cols-3 [&>*]:w-[84%] [&>*]:shrink-0 [&>*]:snap-start sm:[&>*]:w-auto">
          {featured.map((u) => (
            <UnitCard
              key={u}
              unit={unitList.find((x) => x.id === u)!}
              index={unitList.findIndex((x) => x.id === u)}
              tone={unitTone(allUnits, u)}
              questions={questions}
              masteryRecords={masteryRecords}
              onPractice={() =>
                onStartPractice({ mode: 'practice', unitIds: [u], questionCount: 0, order: 'sequential', timed: false })
              }
              onExam={(total) =>
                onStartExam({
                  mode: 'exam',
                  unitIds: [u],
                  questionCount: Math.min(total, 20),
                  order: 'random',
                  timed: true,
                  timeLimitMinutes: 10,
                })
              }
            />
          ))}
          <MixedCard
            questions={questions}
            masteryRecords={masteryRecords}
            units={units}
            onPractice={() =>
              onStartPractice({ mode: 'practice', unitIds: units, questionCount: 0, order: 'random', timed: false })
            }
            onExam={() =>
              onStartExam({ mode: 'exam', unitIds: units, questionCount: 30, order: 'random', timed: true, timeLimitMinutes: 20 })
            }
          />
        </div>

        {extended.length > 0 && (
          <div className="mt-8">
            <div className="eyebrow mb-3">拓展单元</div>
            <div className="grid gap-3 sm:grid-cols-2">
              {extended.map((u) => (
                <CompactUnitRow
                  key={u}
                  unit={unitList.find((x) => x.id === u)!}
                  index={unitList.findIndex((x) => x.id === u)}
                  questions={questions}
                  masteryRecords={masteryRecords}
                  onPractice={() =>
                    onStartPractice({ mode: 'practice', unitIds: [u], questionCount: 0, order: 'sequential', timed: false })
                  }
                />
              ))}
            </div>
          </div>
        )}
      </motion.section>
    </motion.div>
  );
};

/* ==========================================================================
   QuickCheck — a real, answerable question from the user's bank.
   Answers are recorded exactly like in practice mode.
   ========================================================================== */
const QuickCheck: React.FC<{
  questions: VocabularyQuestion[];
  units: Unit[];
  featured: string[];
  masteryRecords: Record<string, WordMasteryRecord>;
  stats: OverallStats;
  onRecordAnswer: DashboardProps['onRecordAnswer'];
}> = ({ questions, units, featured, masteryRecords, stats, onRecordAnswer }) => {
  const [seed, setSeed] = useState(0);
  const [value, setValue] = useState('');
  const [evaluation, setEvaluation] = useState<AnswerEvaluation | null>(null);
  const [shakeSignal, setShakeSignal] = useState(0);
  const [startedAt, setStartedAt] = useState(() => Date.now());

  // Pick: weak → learning → untested (Unit 1/2 first) → anything. Stable per seed.
  const question = useMemo(() => {
    if (questions.length === 0) return null;
    const lvl = (q: VocabularyQuestion) => masteryRecords[q.id]?.masteryLevel ?? 'untested';
    const tiers = [
      questions.filter((q) => lvl(q) === 'weak'),
      questions.filter((q) => lvl(q) === 'learning'),
      questions.filter((q) => lvl(q) === 'untested' && featured.includes(q.unitId)),
      questions.filter((q) => lvl(q) === 'untested'),
      questions,
    ];
    const pool = tiers.find((t) => t.length > 0)!;
    return pool[(seed * 7 + Math.floor(pool.length / 3)) % pool.length];
    // Re-pick only when the user asks for a new one (seed) or the bank changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, questions]);

  if (!question) return null;

  const level = masteryRecords[question.id]?.masteryLevel ?? 'untested';
  const status = evaluation ? (evaluation.isCorrect ? 'correct' : 'incorrect') : 'idle';
  const masteryPct = stats.totalWords > 0 ? (stats.masteredCount + stats.familiarCount * 0.5) / stats.totalWords : 0;

  const submit = () => {
    if (evaluation) return next();
    if (!value.trim()) return;
    const res = evaluateAnswer(value, question);
    setEvaluation(res);
    if (!res.isCorrect) setShakeSignal((s) => s + 1);
    const mastery = calculateMastery(masteryRecords[question.id], question.id, res.isCorrect, value, res.feedbackType);
    onRecordAnswer(
      {
        questionId: question.id,
        question,
        userAnswer: value,
        isCorrect: res.isCorrect,
        timeSpentSeconds: Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
        evaluation: res,
        timestamp: Date.now(),
      },
      mastery
    );
  };

  const next = () => {
    setSeed((s) => s + 1);
    setValue('');
    setEvaluation(null);
    setStartedAt(Date.now());
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-surface shadow-md">
      <div className="ambient pointer-events-none absolute inset-0 opacity-90" aria-hidden />
      <div className="relative p-6 sm:p-7">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/40 motion-reduce:hidden" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
            </span>
            <span className="eyebrow !text-ink-2">Quick check</span>
            <span className="text-[12px] text-ink-3">
              {unitLabel(units, question.unitId)} · {question.partOfSpeech}
            </span>
          </div>
          <button
            onClick={next}
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[12.5px] text-ink-3 transition-colors hover:bg-sunken hover:text-ink"
            aria-label="换一题"
          >
            <motion.span key={seed} initial={{ rotate: -120 }} animate={{ rotate: 0 }} transition={spring.gentle} className="inline-flex">
              <RefreshCw className="h-3.5 w-3.5" />
            </motion.span>
            换一题
          </button>
        </div>

        <div className="min-h-[148px] pt-6 sm:min-h-[156px]">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={question.id + seed}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0, transition: { duration: 0.26, ease: ease.out } }}
              exit={{ opacity: 0, y: -6, transition: { duration: 0.14 } }}
            >
              <ClozeLine
                question={question}
                value={value}
                onChange={setValue}
                onEnter={submit}
                status={status}
                readOnly={!!evaluation}
                size="md"
                autoFocus={false}
                placeholder="type here"
                shakeSignal={shakeSignal}
              />
              <div className="mt-3 text-[12.5px] text-ink-3">
                原形 <span className="font-serif italic text-[14px] text-ink-2">{question.word}</span>
                {question.phonetic && <span className="ml-1.5">{question.phonetic}</span>}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="mt-2 flex min-h-[40px] items-center justify-between gap-3">
          <AnimatePresence mode="wait" initial={false}>
            {evaluation ? (
              <motion.p
                key="res"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-[13.5px] text-ink-2"
              >
                {evaluation.isCorrect ? (
                  <span className="font-medium text-success">正确 · {question.grammarNote}</span>
                ) : (
                  <>
                    正确答案{' '}
                    <span className="font-serif text-[15px] italic font-medium text-success">{question.correctAnswer}</span>
                  </>
                )}
              </motion.p>
            ) : (
              <motion.p key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-[12.5px] text-ink-3">
                当前状态 <span className={MASTERY_META[level].text}>{MASTERY_META[level].label}</span> · 按 <span className="kbd">Enter</span> 提交
              </motion.p>
            )}
          </AnimatePresence>
          <Button
            size="sm"
            variant={evaluation ? 'inverse' : 'secondary'}
            onClick={submit}
            disabled={!evaluation && !value.trim()}
            trailing={evaluation ? <ArrowRight /> : undefined}
            nudge
          >
            {evaluation ? '下一题' : '检查'}
          </Button>
        </div>
      </div>

      <div className="relative flex items-center gap-4 border-t border-line bg-sunken/50 px-6 py-4 sm:px-7">
        <ProgressRing value={masteryPct} size={36} stroke={3.5}>
          <span className="num text-[9.5px] font-semibold text-ink-2">{Math.round(masteryPct * 100)}</span>
        </ProgressRing>
        <div className="min-w-0 flex-1 text-[12.5px] leading-snug">
          <div className="font-medium text-ink">整体掌握度 {Math.round(masteryPct * 100)}%</div>
          <div className="text-ink-3">
            已练 {stats.testedWords} / {stats.totalWords} 词 · 优先抽取你的薄弱词
          </div>
        </div>
      </div>
    </div>
  );
};

/* ==========================================================================
   StatsStrip — four metrics, four different visual forms, one surface.
   ========================================================================== */
const StatsStrip: React.FC<{
  stats: OverallStats;
  history: UserAnswerRecord[];
  questions: VocabularyQuestion[];
  masteryRecords: Record<string, WordMasteryRecord>;
  onReview: () => void;
}> = ({ stats, history, questions, masteryRecords, onReview }) => {
  const activity = useMemo(() => getDailyActivity(history, 14), [history]);
  const weakWords = useMemo(
    () =>
      questions
        .filter((q) => masteryRecords[q.id]?.masteryLevel === 'weak')
        .sort(
          (a, b) =>
            (masteryRecords[b.id]?.totalAttempts ?? 0) -
            (masteryRecords[b.id]?.correctAttempts ?? 0) -
            ((masteryRecords[a.id]?.totalAttempts ?? 0) - (masteryRecords[a.id]?.correctAttempts ?? 0))
        )
        .slice(0, 3),
    [questions, masteryRecords]
  );
  const activeDays = activity.filter((d) => d.total > 0).length;
  const acc = stats.cumulativeAccuracy;
  const accTone = stats.totalPracticeCount === 0 ? 'text-ink-3' : acc >= 85 ? 'text-success' : acc >= 60 ? 'text-ink' : 'text-warning-ink';

  const cell = 'relative flex flex-col p-5 sm:px-6 sm:py-5';
  const label = 'text-[13px] font-medium text-ink-2';
  const big = 'text-[34px] sm:text-[40px] font-semibold leading-none tracking-[-0.03em] text-ink';

  return (
    <div className="card grid grid-cols-2 overflow-hidden lg:grid-cols-[1.25fr_1fr_1fr_1.15fr]">
      {/* Practiced */}
      <div className={`${cell} col-span-2 border-b border-line lg:col-span-1 lg:border-b-0 lg:border-r`}>
        <span className={label}>已练习词汇</span>
        <div className="mt-4 flex items-baseline gap-1.5">
          <AnimatedNumber id="dash-tested" value={stats.testedWords} className={big} />
          <span className="num text-[15px] text-ink-3">/ {stats.totalWords}</span>
        </div>
        <StackedBar
          className="mt-5"
          total={stats.totalWords}
          segments={[
            { value: stats.masteredCount, color: MASTERY_META.mastered.color, label: '已掌握' },
            { value: stats.familiarCount, color: MASTERY_META.familiar.color, label: '基本掌握' },
            { value: stats.learningCount, color: MASTERY_META.learning.color, label: '学习中' },
            { value: stats.weakCount, color: MASTERY_META.weak.color, label: '待强化' },
          ]}
        />
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-ink-3">
          {(['mastered', 'familiar', 'learning', 'weak'] as const).map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${MASTERY_META[k].dot}`} />
              {MASTERY_META[k].label}
            </span>
          ))}
        </div>
      </div>

      {/* Accuracy */}
      <div className={`${cell} border-r border-line`}>
        <span className={label}>累计正确率</span>
        <div className="mt-4 flex items-end justify-between gap-2">
          <div className="flex items-baseline">
            <AnimatedNumber id="dash-acc" value={acc} className={`${big} ${accTone}`} />
            <span className={`ml-0.5 text-[20px] font-semibold ${accTone}`}>%</span>
          </div>
          <ProgressRing
            value={acc / 100}
            size={40}
            stroke={4}
            color={acc >= 85 ? 'rgb(var(--success))' : acc >= 60 ? 'rgb(var(--accent))' : 'rgb(var(--warning))'}
            className="hidden sm:inline-flex"
          />
        </div>
        <span className="mt-auto pt-4 text-[12px] text-ink-3">
          <span className="num">{stats.totalPracticeCount}</span> 次作答
        </span>
      </div>

      {/* Mastered */}
      <div className={`${cell} lg:border-r lg:border-line`}>
        <span className={label}>已掌握</span>
        <div className="mt-4 flex items-baseline gap-2">
          <AnimatedNumber id="dash-mastered" value={stats.masteredCount} className={big} />
          {stats.familiarCount > 0 && (
            <span className="text-[12.5px] font-medium text-accent">+{stats.familiarCount} 基本</span>
          )}
        </div>
        <div className="mt-auto pt-4">
          {activeDays > 1 ? (
            <div className="flex items-end justify-between gap-2">
              <Sparkline data={activity.map((d) => d.correct)} width={110} height={28} />
              <span className="hidden text-[11px] text-ink-3 sm:inline">近 14 天</span>
            </div>
          ) : (
            <span className="text-[12px] text-ink-3">连续答对 3 次即晋级</span>
          )}
        </div>
      </div>

      {/* Weak */}
      <div className={`${cell} col-span-2 border-t border-line lg:col-span-1 lg:border-t-0`}>
        <div className="flex items-center justify-between">
          <span className={label}>待强化</span>
          <span
            className={`inline-flex items-center gap-1.5 text-[11.5px] font-medium ${
              stats.weakCount > 0 ? 'text-danger' : 'text-success'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${stats.weakCount > 0 ? 'bg-danger' : 'bg-success'}`} />
            {stats.weakCount > 0 ? '需要关注' : '状态良好'}
          </span>
        </div>
        <div className="mt-4 flex items-baseline gap-2">
          <AnimatedNumber id="dash-weak" value={stats.weakCount} className={big} />
          <span className="text-[12.5px] text-ink-3">{stats.learningCount} 个学习中</span>
        </div>
        <div className="mt-auto pt-4">
          {weakWords.length > 0 ? (
            <button onClick={onReview} className="group flex w-full items-center gap-1.5 text-left">
              <span className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                {weakWords.map((q) => (
                  <span key={q.id} className="rounded-md bg-danger-soft px-1.5 py-0.5 font-serif text-[13.5px] italic text-danger">
                    {q.word}
                  </span>
                ))}
              </span>
              <ArrowUpRight className="h-4 w-4 shrink-0 text-ink-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ink" />
            </button>
          ) : (
            <span className="text-[12px] text-ink-3">暂无反复出错的词</span>
          )}
        </div>
      </div>
    </div>
  );
};

/* ==========================================================================
   Unit cards
   ========================================================================== */
const UnitCard: React.FC<{
  unit: Unit;
  index: number;
  tone: string;
  questions: VocabularyQuestion[];
  masteryRecords: Record<string, WordMasteryRecord>;
  onPractice: () => void;
  onExam: (total: number) => void;
}> = ({ unit, index, tone, questions, masteryRecords, onPractice, onExam }) => {
  const m = getUnitMetrics(questions, masteryRecords, unit.id);
  const meta = unitDisplay(unit, index);
  const color = toneVar[tone];
  const disabled = m.total === 0;

  return (
    <div className="card-interactive group relative flex flex-col overflow-hidden p-6">
      <button
        onClick={onPractice}
        disabled={disabled}
        className="absolute inset-0 z-0 rounded-xl focus-visible:outline-offset-[-2px]"
        aria-label={`开始练习 ${unit.name}`}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 transition-transform duration-300 ease-out group-hover:scale-x-100"
        style={{ background: color }}
      />
      <div className="pointer-events-none relative flex items-start justify-between">
        <div>
          <div className="eyebrow" style={{ color }}>
            {meta.eyebrow}
          </div>
          <div className="num font-serif text-[52px] font-medium leading-[0.95] tracking-[-0.03em] text-ink">
            {meta.numeral}
          </div>
        </div>
        <ProgressRing value={m.masteryRatio} size={48} stroke={4} color={color}>
          <span className="num text-[11px] font-semibold text-ink-2">{Math.round(m.masteryRatio * 100)}%</span>
        </ProgressRing>
      </div>

      <div className="pointer-events-none relative mt-5">
        <h3 className="line-clamp-2 font-serif text-[21px] font-medium leading-tight tracking-[-0.01em] text-ink">{meta.title}</h3>
        <p className="mt-1 min-h-[1.25rem] truncate text-[13px] text-ink-2">{meta.subtitle}</p>
      </div>

      <div className="pointer-events-none relative mt-5 grid grid-cols-3 gap-3 text-[12px] text-ink-3">
        <div>
          <div className="num text-[17px] font-semibold text-ink">{m.total}</div>词汇
        </div>
        <div>
          <div className="num text-[17px] font-semibold text-ink">{m.practiced}</div>已练习
        </div>
        <div>
          <div className={`num text-[17px] font-semibold ${m.practiced ? 'text-ink' : 'text-ink-3'}`}>
            {m.practiced ? `${m.accuracy}%` : '—'}
          </div>
          正确率
        </div>
      </div>

      <StackedBar
        className="pointer-events-none relative mt-5"
        height={4}
        total={m.total}
        segments={[
          { value: m.mastered, color: MASTERY_META.mastered.color },
          { value: m.familiar, color: MASTERY_META.familiar.color },
          { value: m.learning, color: MASTERY_META.learning.color },
          { value: m.weak, color: MASTERY_META.weak.color },
        ]}
      />

      <div className="relative mt-6 flex items-center justify-between border-t border-line pt-4">
        <span className="pointer-events-none text-[12px] text-ink-3">{relativeTime(m.lastPracticed)}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onExam(m.total)}
            disabled={disabled}
            className="relative z-10 h-8 rounded-md px-2.5 text-[12.5px] font-medium text-ink-2 transition-colors hover:bg-sunken hover:text-ink"
          >
            单元模考
          </button>
          <span className="pointer-events-none inline-flex h-8 items-center gap-1 pl-1.5 text-[13px] font-semibold" style={{ color }}>
            开始练习
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
          </span>
        </div>
      </div>
    </div>
  );
};

const MixedCard: React.FC<{
  questions: VocabularyQuestion[];
  masteryRecords: Record<string, WordMasteryRecord>;
  units: string[];
  onPractice: () => void;
  onExam: () => void;
}> = ({ questions, masteryRecords, units, onPractice, onExam }) => {
  const m = getUnitMetrics(questions, masteryRecords, units);
  const color = toneVar.plum;
  return (
    <div className="card-interactive group relative flex flex-col overflow-hidden p-6 md:col-span-2 lg:col-span-1">
      <button onClick={onPractice} className="absolute inset-0 z-0 rounded-xl" aria-label="开始综合练习" />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 transition-transform duration-300 ease-out group-hover:scale-x-100"
        style={{ background: color }}
      />
      <div className="pointer-events-none relative flex items-start justify-between">
        <div>
          <div className="eyebrow" style={{ color }}>
            Mixed
          </div>
          <div className="mt-1 flex h-[49px] items-center">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-plum-soft text-plum transition-transform duration-300 group-hover:rotate-[-8deg]">
              <Shuffle className="h-5 w-5" />
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className="num text-[26px] font-semibold leading-none tracking-tight text-ink">{questions.length}</div>
          <div className="mt-1 text-[12px] text-ink-3">全部词汇</div>
        </div>
      </div>

      <div className="pointer-events-none relative mt-5">
        <h3 className="font-serif text-[21px] font-medium leading-tight tracking-[-0.01em] text-ink">Mixed Practice</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
          全部 {units.length} 个单元随机打乱，摆脱位置记忆，检验在不同语境中的真实反应。
        </p>
      </div>

      <div className="pointer-events-none relative mt-auto pt-5">
        <div className="mb-2 flex justify-between text-[12px] text-ink-3">
          <span>覆盖进度</span>
          <span className="num">{Math.round(m.coverage * 100)}%</span>
        </div>
        <StackedBar
          height={4}
          total={m.total}
          segments={[
            { value: m.mastered, color: MASTERY_META.mastered.color },
            { value: m.familiar, color: MASTERY_META.familiar.color },
            { value: m.learning, color: MASTERY_META.learning.color },
            { value: m.weak, color: MASTERY_META.weak.color },
          ]}
        />
      </div>

      <div className="relative mt-6 flex items-center justify-between border-t border-line pt-4">
        <span className="pointer-events-none text-[12px] text-ink-3">{relativeTime(m.lastPracticed)}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={onExam}
            className="relative z-10 h-8 rounded-md px-2.5 text-[12.5px] font-medium text-ink-2 transition-colors hover:bg-sunken hover:text-ink"
          >
            综合统考
          </button>
          <span className="pointer-events-none inline-flex h-8 items-center gap-1 pl-1.5 text-[13px] font-semibold" style={{ color }}>
            开始练习
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
          </span>
        </div>
      </div>
    </div>
  );
};

const CompactUnitRow: React.FC<{
  unit: Unit;
  index: number;
  questions: VocabularyQuestion[];
  masteryRecords: Record<string, WordMasteryRecord>;
  onPractice: () => void;
}> = ({ unit, index, questions, masteryRecords, onPractice }) => {
  const m = getUnitMetrics(questions, masteryRecords, unit.id);
  const meta = unitDisplay(unit, index);
  return (
    <button
      onClick={onPractice}
      disabled={m.total === 0}
      className="card-interactive group flex items-center gap-4 p-4 text-left"
    >
      <span className="num w-10 font-serif text-[28px] font-medium leading-none text-ink-2">
        {meta.numeral}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14.5px] font-medium text-ink">{meta.title}</span>
        <span className="mt-0.5 block text-[12px] text-ink-3">
          {m.total} 词 · 已练 {m.practiced}
          {m.practiced > 0 && ` · ${m.accuracy}%`}
        </span>
      </span>
      <span className="num text-[13px] font-medium text-ink-2">{Math.round(m.masteryRatio * 100)}%</span>
      <ArrowRight className="h-4 w-4 text-ink-3 transition-transform duration-200 group-hover:translate-x-1 group-hover:text-ink" />
    </button>
  );
};
