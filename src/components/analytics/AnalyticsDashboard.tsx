import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,

  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowRight, Play } from 'lucide-react';
import {
  VocabularyQuestion,
  WordMasteryRecord,
  ExamSessionResult,
  UserAnswerRecord,
  OverallStats,
  AppView,
  PracticeConfig,
} from '../../types';
import {
  getAvailableUnits,
  getDailyActivity,
  getStreakDays,
  getUnitMeta,
  getUnitMetrics,
  MASTERY_META,
  startOfDay,
} from '../../lib/insights';
import { riseIn, staggerContainer } from '../../lib/motion';
import { useTokens } from '../../lib/useTokens';
import { Button } from '../ui/Button';
import { Segmented } from '../ui/Segmented';
import { AnimatedNumber } from '../ui/DataViz';
import { EmptyState, PageHeader } from '../ui/Common';

interface AnalyticsDashboardProps {
  questions: VocabularyQuestion[];
  masteryRecords: Record<string, WordMasteryRecord>;
  exams: ExamSessionResult[];
  history: UserAnswerRecord[];
  stats: OverallStats;
  onNavigate: (view: AppView) => void;
  onStartPractice?: (config: PracticeConfig) => void;
}

const DAY = 86_400_000;

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
  questions,
  masteryRecords,
  exams,
  history,
  stats,
  onNavigate,
  onStartPractice,
}) => {
  const t = useTokens();
  const [range, setRange] = useState<7 | 30 | 0>(30);
  const units = getAvailableUnits(questions);

  /* ---------------------------------------------------------------- data */
  const masteryData = [
    { key: 'mastered', name: MASTERY_META.mastered.label, value: stats.masteredCount, color: t.success },
    { key: 'familiar', name: MASTERY_META.familiar.label, value: stats.familiarCount, color: t.accent },
    { key: 'learning', name: MASTERY_META.learning.label, value: stats.learningCount, color: t.warning },
    { key: 'weak', name: MASTERY_META.weak.label, value: stats.weakCount, color: t.danger },
    { key: 'untested', name: MASTERY_META.untested.label, value: stats.untestedWords, color: t['ink-3'], faint: true },
  ] as const;
  const masteryPct =
    stats.totalWords > 0 ? Math.round(((stats.masteredCount + stats.familiarCount * 0.5) / stats.totalWords) * 100) : 0;

  const unitData = units.map((u) => {
    const m = getUnitMetrics(questions, masteryRecords, u);
    return {
      name: `Unit ${u}`,
      title: getUnitMeta(u).title,
      正确率: m.practiced ? m.accuracy : 0,
      覆盖率: Math.round(m.coverage * 100),
      practiced: m.practiced,
      total: m.total,
      weak: m.weak,
    };
  });

  const trend = useMemo(() => {
    const first = history.length ? startOfDay(Math.min(...history.map((h) => h.timestamp || Date.now()))) : startOfDay(Date.now());
    const span = range === 0 ? Math.max(7, Math.round((startOfDay(Date.now()) - first) / DAY) + 1) : range;
    const days = getDailyActivity(history, Math.min(span, 365));
    return days.map((d) => {
      const dayExams = exams.filter((e) => startOfDay(e.timestamp) === d.date);
      return {
        date: d.date,
        label: new Date(d.date).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }),
        accuracy: d.total > 0 ? Math.round((d.correct / d.total) * 100) : null,
        answers: d.total,
        exam: dayExams.length ? Math.round(dayExams.reduce((s, e) => s + e.score, 0) / dayExams.length) : null,
      };
    });
  }, [history, exams, range]);
  const trendHasData = trend.some((d) => d.accuracy !== null);

  const errorTypes = useMemo(() => {
    const c = { base: 0, inflection: 0, spelling: 0, other: 0 };
    history.forEach((h) => {
      if (h.isCorrect) return;
      const f = h.evaluation?.feedbackType;
      if (f === 'base_form_trap') c.base++;
      else if (f === 'inflection_error') c.inflection++;
      else if (f === 'spelling_error') c.spelling++;
      else c.other++;
    });
    return [
      { name: '原形陷阱', desc: '该变形时填了原形', value: c.base },
      { name: '词尾屈折', desc: '-ed / -ing / 复数混淆', value: c.inflection },
      { name: '拼写细节', desc: '1–2 个字符的偏差', value: c.spelling },
      { name: '其他错误', desc: '用词错误或空白', value: c.other },
    ];
  }, [history]);
  const totalErrors = errorTypes.reduce((s, e) => s + e.value, 0);

  const weakWords = questions
    .filter((q) => {
      const r = masteryRecords[q.id];
      return r && (r.masteryLevel === 'weak' || (r.totalAttempts > 0 && r.consecutiveIncorrect >= 1));
    })
    .sort(
      (a, b) =>
        masteryRecords[b.id].totalAttempts - masteryRecords[b.id].correctAttempts -
        (masteryRecords[a.id].totalAttempts - masteryRecords[a.id].correctAttempts)
    );

  const heat = useMemo(() => getDailyActivity(history, 7 * 18), [history]);
  const streak = getStreakDays(history);
  const latestExam = exams[0] ?? null;

  /* ---------------------------------------------------------------- empty */
  if (history.length === 0) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow="Insights" title="掌握度分析" description="完成练习后，这里会显示你的掌握度分布、单元对比、成绩趋势和薄弱点。" />
        <div className="card">
          <EmptyState
            cloze
            title="还没有学习记录"
            description="先做一组练习吧——哪怕只有 10 题，也足以生成第一份掌握度画像。"
            action={
              <>
                <Button
                  variant="primary"
                  trailing={<ArrowRight />}
                  nudge
                  onClick={() =>
                    onStartPractice?.({ mode: 'practice', units: [1, 2], questionCount: 10, order: 'random', timed: false })
                  }
                >
                  开始 10 题练习
                </Button>
                <Button variant="secondary" onClick={() => onNavigate('practice-setup')}>
                  自定义练习
                </Button>
              </>
            }
          />
        </div>
      </div>
    );
  }

  const axisTick = { fill: t['ink-3'], fontSize: 11.5 };

  return (
    <motion.div variants={staggerContainer(0.06)} initial="initial" animate="animate" className="space-y-8">
      <motion.div variants={riseIn}>
        <PageHeader
          eyebrow="Insights"
          title="掌握度分析"
          description="基于你的真实作答记录：哪些词已牢固掌握，哪些需要在考前重点强化。"
        />
      </motion.div>

      {/* --------------------------------------------------------- Key figures */}
      <motion.div variants={riseIn} className="grid grid-cols-2 gap-x-6 gap-y-5 border-y border-line py-6 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: '整体掌握度', value: masteryPct, suffix: '%' },
          { label: '累计正确率', value: stats.cumulativeAccuracy, suffix: '%' },
          { label: '作答次数', value: stats.totalPracticeCount },
          { label: '覆盖词汇', value: stats.testedWords, suffix: ` / ${stats.totalWords}` },
          { label: '最近模考', value: latestExam?.score ?? null, suffix: ' 分' },
          { label: '连续学习', value: streak, suffix: ' 天' },
        ].map((k) => (
          <div key={k.label}>
            <div className="text-[12.5px] text-ink-3">{k.label}</div>
            <div className="mt-1.5 flex items-baseline">
              {k.value === null ? (
                <span className="text-[26px] font-semibold text-ink-3">—</span>
              ) : (
                <AnimatedNumber id={`an-${k.label}`} value={k.value} className="text-[26px] font-semibold tracking-tight text-ink" />
              )}
              {k.value !== null && k.suffix && <span className="ml-0.5 text-[13px] text-ink-3">{k.suffix}</span>}
            </div>
          </div>
        ))}
      </motion.div>

      {/* --------------------------------------------------------- Mastery + Trend */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.4fr)]">
        <motion.div variants={riseIn} className="card p-6">
          <h3 className="text-[15px] font-semibold text-ink">掌握度分布</h3>
          <p className="mt-1 text-[12.5px] text-ink-3">连续答对 3 次或正确率 ≥ 85% 记为已掌握</p>
          <div className="mt-4 flex flex-col items-center gap-6 sm:flex-row lg:flex-col xl:flex-row">
            <div className="relative h-[180px] w-[180px] shrink-0">
                <PieChart width={180} height={180}>
                  <Pie
                    data={masteryData.filter((d) => d.value > 0) as any}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={62}
                    outerRadius={86}
                    paddingAngle={1.2}
                    stroke={t.surface}
                    strokeWidth={2}
                    startAngle={90}
                    endAngle={-270}
                    animationDuration={800}
                    isAnimationActive
                  >
                    {masteryData
                      .filter((d) => d.value > 0)
                      .map((d) => (
                        <Cell key={d.key} fill={d.color} fillOpacity={'faint' in d ? 0.3 : 1} />
                      ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip unit=" 词" />} />
                </PieChart>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="num text-[30px] font-semibold leading-none tracking-tight text-ink">{masteryPct}%</span>
                <span className="mt-1 text-[11.5px] text-ink-3">掌握度</span>
              </div>
            </div>
            <ul className="w-full space-y-2.5">
              {masteryData.map((d) => (
                <li key={d.key} className="flex items-center gap-2.5 text-[13px]">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: d.color, opacity: 'faint' in d ? 0.3 : 1 }} />
                  <span className="flex-1 text-ink-2">{d.name}</span>
                  <span className="num font-medium text-ink">{d.value}</span>
                  <span className="num w-10 text-right text-ink-3">
                    {stats.totalWords ? Math.round((d.value / stats.totalWords) * 100) : 0}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </motion.div>

        <motion.div variants={riseIn} className="card p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-[15px] font-semibold text-ink">成绩趋势</h3>
              <div className="mt-1.5 flex items-center gap-4 text-[12px] text-ink-3">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-[2px] w-3.5 rounded-full" style={{ background: t.accent }} />
                  每日练习正确率
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full ring-2 ring-surface" style={{ background: t.plum }} />
                  模考成绩
                </span>
              </div>
            </div>
            <Segmented
              value={range}
              onChange={setRange}
              ariaLabel="时间范围"
              options={[
                { value: 7, label: '7 天' },
                { value: 30, label: '30 天' },
                { value: 0, label: '全部' },
              ]}
            />
          </div>
          <div className="mt-5 h-[220px]">
            {trendHasData ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={trend} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                  <defs>
                    <linearGradient id="accFill" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor={t.accent} stopOpacity={0.16} />
                      <stop offset="100%" stopColor={t.accent} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke={t.line} strokeDasharray="3 4" />
                  <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tick={axisTick} tickLine={false} axisLine={false} unit="%" />
                  <Tooltip content={<TrendTooltip />} cursor={{ stroke: t['line-strong'], strokeWidth: 1 }} />
                  <Area
                    type="monotone"
                    dataKey="accuracy"
                    name="练习正确率"
                    stroke={t.accent}
                    strokeWidth={2}
                    fill="url(#accFill)"
                    connectNulls
                    dot={false}
                    activeDot={{ r: 4.5, stroke: t.surface, strokeWidth: 2, fill: t.accent }}
                    animationDuration={700}
                  />
                  <Scatter dataKey="exam" name="模考" fill={t.plum} shape={<ExamDot ring={t.surface} />} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-[13px] text-ink-3">这段时间内没有作答记录</div>
            )}
          </div>
        </motion.div>
      </div>

      {/* --------------------------------------------------------- Units + errors */}
      <div className="grid gap-4 lg:grid-cols-2">
        <motion.div variants={riseIn} className="card p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-[15px] font-semibold text-ink">单元对比</h3>
              <p className="mt-1 text-[12.5px] text-ink-3">覆盖率 = 已练习词数 / 单元词数</p>
            </div>
            <div className="flex items-center gap-3 text-[12px] text-ink-3">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: t.accent }} />
                正确率
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: t.sky }} />
                覆盖率
              </span>
            </div>
          </div>
          <div className="mt-5 h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={unitData} margin={{ top: 8, right: 8, bottom: 0, left: -18 }} barGap={2} barCategoryGap="28%">
                <CartesianGrid vertical={false} stroke={t.line} strokeDasharray="3 4" />
                <XAxis dataKey="name" tick={axisTick} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tick={axisTick} tickLine={false} axisLine={false} unit="%" />
                <Tooltip content={<UnitTooltip />} cursor={{ fill: t.sunken, radius: 6 } as any} />
                <Bar dataKey="正确率" fill={t.accent} radius={[4, 4, 0, 0]} maxBarSize={28} animationDuration={700} />
                <Bar dataKey="覆盖率" fill={t.sky} radius={[4, 4, 0, 0]} maxBarSize={28} animationDuration={700} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        <motion.div variants={riseIn} className="card p-6">
          <h3 className="text-[15px] font-semibold text-ink">失分归因</h3>
          <p className="mt-1 text-[12.5px] text-ink-3">累计 {totalErrors} 次错误的类型分布</p>
          {totalErrors === 0 ? (
            <div className="flex h-[200px] items-center justify-center text-[13px] text-ink-3">目前没有错误记录，保持住。</div>
          ) : (
            <div className="mt-6 space-y-5">
              {errorTypes.map((e, i) => {
                const pct = Math.round((e.value / totalErrors) * 100);
                return (
                  <div key={e.name}>
                    <div className="mb-1.5 flex items-baseline justify-between text-[13px]">
                      <span className="font-medium text-ink">
                        {e.name}
                        <span className="ml-2 font-normal text-ink-3">{e.desc}</span>
                      </span>
                      <span className="num text-ink-2">
                        <span className="font-semibold text-ink">{e.value}</span> · {pct}%
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-sunken">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: i === 0 ? t.warning : i === 1 ? t.danger : i === 2 ? t.accent : t['ink-3'] }}
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.7, delay: 0.15 + i * 0.06, ease: [0.22, 1, 0.36, 1] }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>
      </div>

      {/* --------------------------------------------------------- Activity + weak words */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <motion.div variants={riseIn} className="card p-6">
          <div className="flex items-baseline justify-between">
            <h3 className="text-[15px] font-semibold text-ink">学习活动</h3>
            <span className="text-[12px] text-ink-3">近 18 周 · 每格一天</span>
          </div>
          <Heatmap days={heat} accent={t.accent} empty={t.sunken} />
        </motion.div>

        <motion.div variants={riseIn} className="card flex flex-col p-6">
          <div className="flex items-baseline justify-between">
            <h3 className="text-[15px] font-semibold text-ink">薄弱词汇</h3>
            <button onClick={() => onNavigate('review')} className="text-[12.5px] font-medium text-ink-2 hover:text-ink">
              错题本 →
            </button>
          </div>
          {weakWords.length === 0 ? (
            <div className="flex flex-1 items-center justify-center py-8 text-[13px] text-ink-3">暂无薄弱词汇</div>
          ) : (
            <>
              <ul className="mt-4 flex-1 divide-y divide-line">
                {weakWords.slice(0, 6).map((q) => {
                  const r = masteryRecords[q.id];
                  return (
                    <li key={q.id} className="flex items-center gap-3 py-2.5">
                      <span className="min-w-0 flex-1">
                        <span className="font-serif text-[16px] text-ink">{q.word}</span>
                        <span className="ml-2 text-[12.5px] text-ink-3">{q.chineseHint}</span>
                      </span>
                      <span className="num text-[12.5px] text-danger">错 {r.totalAttempts - r.correctAttempts}</span>
                    </li>
                  );
                })}
              </ul>
              {onStartPractice && (
                <Button
                  variant="secondary"
                  className="mt-4 w-full"
                  leading={<Play />}
                  onClick={() =>
                    onStartPractice({
                      mode: 'practice',
                      units: Array.from(new Set(weakWords.map((q) => q.unit))),
                      questionCount: weakWords.length,
                      order: 'weakest-first',
                      timed: false,
                      questionIds: weakWords.map((q) => q.id),
                      label: '薄弱词强化',
                    })
                  }
                >
                  强化这 {weakWords.length} 个词
                </Button>
              )}
            </>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
};

/* ==========================================================================
   Chart pieces
   ========================================================================== */
const tooltipBox = 'rounded-lg border border-line bg-elevated px-3 py-2 text-[12.5px] shadow-md';

const ChartTooltip: React.FC<any> = ({ active, payload, unit = '' }) => {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className={tooltipBox}>
      <span className="text-ink-2">{p.name}</span> <span className="num font-semibold text-ink">{p.value}{unit}</span>
    </div>
  );
};

const TrendTooltip: React.FC<any> = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className={tooltipBox}>
      <div className="mb-1 font-medium text-ink">
        {new Date(d.date).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' })}
      </div>
      {d.accuracy !== null ? (
        <div className="text-ink-2">
          练习正确率 <span className="num font-semibold text-ink">{d.accuracy}%</span>
          <span className="text-ink-3"> · {d.answers} 题</span>
        </div>
      ) : (
        <div className="text-ink-3">当天无练习</div>
      )}
      {d.exam !== null && (
        <div className="text-ink-2">
          模考成绩 <span className="num font-semibold text-ink">{d.exam} 分</span>
        </div>
      )}
    </div>
  );
};

const UnitTooltip: React.FC<any> = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className={tooltipBox}>
      <div className="font-medium text-ink">
        {d.name} · {d.title}
      </div>
      <div className="mt-1 text-ink-2">
        正确率 <span className="num font-semibold text-ink">{d.practiced ? `${d.正确率}%` : '—'}</span>
      </div>
      <div className="text-ink-2">
        已练 <span className="num font-semibold text-ink">{d.practiced}</span> / {d.total} 词
        {d.weak > 0 && <span className="text-danger"> · {d.weak} 待强化</span>}
      </div>
    </div>
  );
};

const ExamDot: React.FC<any> = ({ cx, cy, fill, ring }) =>
  cx == null || cy == null ? null : <circle cx={cx} cy={cy} r={5} fill={fill} stroke={ring} strokeWidth={2} />;

const Heatmap: React.FC<{ days: { date: number; total: number; correct: number }[]; accent: string; empty: string }> = ({
  days,
  accent,
  empty,
}) => {
  const [hover, setHover] = useState<(typeof days)[number] | null>(null);
  // Align columns to weeks starting Monday.
  const firstDow = (new Date(days[0].date).getDay() + 6) % 7;
  const cells: (typeof days[number] | null)[] = [...Array(firstDow).fill(null), ...days];
  const weeks: (typeof cells)[] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const max = Math.max(1, ...days.map((d) => d.total));
  const level = (n: number) => (n === 0 ? 0 : n <= max * 0.25 ? 1 : n <= max * 0.5 ? 2 : n <= max * 0.75 ? 3 : 4);
  const opacity = [0, 0.28, 0.5, 0.74, 1];
  const activeDays = days.filter((d) => d.total > 0).length;
  const total = days.reduce((s, d) => s + d.total, 0);

  return (
    <div className="mt-5">
      <div>
        <div className="flex gap-[3px] sm:gap-1" onMouseLeave={() => setHover(null)}>
          {weeks.map((w, wi) => (
            <div key={wi} className="flex min-w-0 flex-1 flex-col gap-[3px] sm:gap-1">
              {Array.from({ length: 7 }).map((_, di) => {
                const d = w[di];
                if (!d) return <span key={di} className="aspect-square w-full" />;
                const l = level(d.total);
                return (
                  <span
                    key={di}
                    onMouseEnter={() => setHover(d)}
                    className="aspect-square w-full rounded-[3px] transition-transform duration-150 hover:scale-110 sm:rounded-[4px]"
                    style={{ background: l === 0 ? empty : accent, opacity: l === 0 ? 1 : opacity[l] }}
                    aria-label={`${new Date(d.date).toLocaleDateString('zh-CN')}：${d.total} 题`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[12px] text-ink-3">
        <span className="min-h-[18px]">
          {hover ? (
            <>
              <span className="text-ink-2">{new Date(hover.date).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })}</span>
              {' · '}
              {hover.total > 0 ? `${hover.total} 题，正确 ${hover.correct}` : '无练习'}
            </>
          ) : (
            <>
              <span className="num text-ink-2">{activeDays}</span> 天有练习 · 共 <span className="num text-ink-2">{total}</span> 题
            </>
          )}
        </span>
        <span className="flex items-center gap-1">
          少
          {[0, 1, 2, 3, 4].map((l) => (
            <span key={l} className="h-2.5 w-2.5 rounded-[3px]" style={{ background: l === 0 ? empty : accent, opacity: l === 0 ? 1 : opacity[l] }} />
          ))}
          多
        </span>
      </div>
    </div>
  );
};
