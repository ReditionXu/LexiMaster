import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, BookOpen, Check, Clock, FileCheck2, Sparkles, Settings2 } from 'lucide-react';
import { AIPracticeConfig, PracticeConfig, Unit, VocabularyQuestion } from '../../types';
import { activeUnits, countByUnit } from '../../lib/units';
import { riseIn, spring, staggerContainer } from '../../lib/motion';
import { Button } from '../ui/Button';
import { Segmented } from '../ui/Segmented';
import { PageHeader } from '../ui/Common';

interface PracticeSetupProps {
  questions: VocabularyQuestion[];
  units: Unit[];
  initialConfig?: Partial<PracticeConfig>;
  initialMode?: 'practice' | 'exam' | 'ai';
  aiReady?: boolean;
  onStart: (config: PracticeConfig) => void;
  onStartAI?: (config: AIPracticeConfig) => void;
  onOpenAISettings?: () => void;
  onCancel: () => void;
}

type Mode = 'practice' | 'exam' | 'ai';

export const PracticeSetup: React.FC<PracticeSetupProps> = ({
  questions,
  units,
  initialConfig,
  initialMode,
  aiReady = false,
  onStart,
  onStartAI,
  onOpenAISettings,
  onCancel,
}) => {
  const [mode, setMode] = useState<Mode>(initialMode ?? (initialConfig?.mode === 'exam' ? 'exam' : 'practice'));
  const available = activeUnits(units);
  const availableIds = available.map((u) => u.id);
  const counts = countByUnit(questions);
  const [selectedUnits, setSelectedUnits] = useState<string[]>(() => {
    const wanted = (initialConfig?.unitIds ?? []).filter((id) => availableIds.includes(id));
    return wanted.length ? wanted : availableIds.slice(0, Math.min(2, availableIds.length));
  });
  // AI options
  const [aiDifficulty, setAiDifficulty] = useState<AIPracticeConfig['difficulty']>('mixed');
  const [aiCount, setAiCount] = useState(10);
  const [aiWeakFirst, setAiWeakFirst] = useState(true);
  const [aiRandom, setAiRandom] = useState(true);
  const [aiInflection, setAiInflection] = useState(true);
  const [aiExpand, setAiExpand] = useState(false);
  const [questionCount, setQuestionCount] = useState<number>(initialConfig?.questionCount ?? 0);
  const [order, setOrder] = useState<'sequential' | 'random' | 'weakest-first'>(initialConfig?.order || 'random');
  const [timed, setTimed] = useState<boolean>(initialConfig?.timed ?? initialConfig?.mode === 'exam');
  const [timeLimitMinutes, setTimeLimitMinutes] = useState<number>(initialConfig?.timeLimitMinutes || 15);

  const toggleUnit = (u: string) => {
    if (selectedUnits.includes(u)) {
      if (selectedUnits.length > 1) setSelectedUnits(selectedUnits.filter((x) => x !== u));
    } else {
      setSelectedUnits(availableIds.filter((id) => id === u || selectedUnits.includes(id)));
    }
  };

  const matchingQuestions = questions.filter((q) => selectedUnits.includes(q.unitId));
  const effectiveCount =
    questionCount === 0 ? matchingQuestions.length : Math.min(questionCount, matchingQuestions.length);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (matchingQuestions.length === 0) return;
    if (mode === 'ai') {
      if (!aiReady) return onOpenAISettings?.();
      onStartAI?.({
        unitIds: selectedUnits,
        questionCount: aiCount,
        difficulty: aiDifficulty,
        weakFirst: aiWeakFirst,
        random: aiRandom,
        focusInflection: aiInflection,
        allowExpansion: aiExpand,
      });
      return;
    }
    onStart({
      mode,
      unitIds: selectedUnits,
      questionCount,
      order,
      timed: mode === 'exam' ? timed : false,
      timeLimitMinutes: mode === 'exam' && timed ? timeLimitMinutes : undefined,
    });
  };

  const modes = [
    {
      id: 'practice' as const,
      icon: <BookOpen />,
      title: '日常练习',
      en: 'Practice',
      desc: '每题即时判定，附带语法解析。适合平时复习、夯实时态与词形变化。',
    },
    {
      id: 'exam' as const,
      icon: <FileCheck2 />,
      title: '模拟考试',
      en: 'Mock exam',
      desc: '全程不显示答案、原形与解析，可跳题与标记存疑，交卷后统一评分。',
    },
    {
      id: 'ai' as const,
      icon: <Sparkles />,
      title: 'AI 智能出题',
      en: 'Adaptive',
      desc: aiReady
        ? '由你连接的 AI 围绕所选单元的词汇实时造句，答完后给出针对性讲解。'
        : '需要先在「AI 设置」中连接模型。未连接时不影响其他练习。',
    },
  ];

  const Label: React.FC<{ n: number; children: React.ReactNode; aside?: React.ReactNode }> = ({ n, children, aside }) => (
    <div className="mb-3 flex items-center justify-between gap-3">
      <span className="flex items-center gap-2.5 text-[14px] font-semibold text-ink">
        <span className="num inline-flex h-5 w-5 items-center justify-center rounded-full bg-sunken text-[11px] text-ink-2">{n}</span>
        {children}
      </span>
      {aside}
    </div>
  );

  return (
    <motion.form
      onSubmit={handleSubmit}
      variants={staggerContainer(0.05)}
      initial="initial"
      animate="animate"
      className="mx-auto max-w-[760px] space-y-10"
    >
      <motion.div variants={riseIn}>
        <PageHeader
          eyebrow={mode === 'exam' ? 'Mock exam' : mode === 'ai' ? 'AI practice' : 'Practice'}
          title={mode === 'exam' ? '配置模拟考试' : mode === 'ai' ? 'AI 智能出题' : '配置练习'}
          description="选择范围、题量与节奏，开始一组专注的练习。"
        />
      </motion.div>

      {/* Mode */}
      <motion.section variants={riseIn}>
        <Label n={1}>模式</Label>
        <div className="grid gap-3 sm:grid-cols-3" role="radiogroup">
          {modes.map((m) => {
            const active = mode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => {
                  setMode(m.id);
                  setTimed(m.id === 'exam');
                  if (m.id === 'ai' && !aiReady) onOpenAISettings?.();
                  if (m.id === 'exam' && questionCount === 0) setQuestionCount(20);
                }}
                className={`relative rounded-xl border p-5 text-left transition-[border-color,background-color,box-shadow] duration-hover ${
                  active ? 'border-accent/60 bg-surface shadow-[0_0_0_3px_rgb(var(--accent)/0.12)]' : 'border-line bg-surface hover:border-line-strong'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`inline-flex h-9 w-9 items-center justify-center rounded-lg [&>svg]:h-[18px] [&>svg]:w-[18px] ${active ? 'bg-accent-soft text-accent' : 'bg-sunken text-ink-2'}`}>
                    {m.icon}
                  </span>
                  <span
                    className={`inline-flex h-5 w-5 items-center justify-center rounded-full border transition-colors ${
                      active ? 'border-accent bg-accent text-accent-ink' : 'border-line-strong'
                    }`}
                  >
                    {active && (
                      <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={spring.snappy}>
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </motion.span>
                    )}
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap items-baseline gap-x-2">
                  <span className="text-[15.5px] font-semibold text-ink">{m.title}</span>
                  {m.id === 'ai' && !aiReady && (
                    <span className="rounded-full bg-sunken px-1.5 py-0.5 text-[11px] font-medium text-ink-3">未连接</span>
                  )}
                  <span className="font-serif text-[14px] italic text-ink-3">{m.en}</span>
                </div>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{m.desc}</p>
              </button>
            );
          })}
        </div>
      </motion.section>

      {/* Units */}
      <motion.section variants={riseIn}>
        <Label
          n={2}
          aside={
            <div className="flex gap-1">
              {availableIds.length > 2 && (
                <Button size="sm" variant="ghost" onClick={() => setSelectedUnits(availableIds.slice(0, 2))}>
                  前两个单元
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setSelectedUnits(availableIds)}>
                全选
              </Button>
            </div>
          }
        >
          单元范围
        </Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {available.map((u) => {
            const count = counts.get(u.id) ?? 0;
            const on = selectedUnits.includes(u.id);
            return (
              <button
                key={u.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggleUnit(u.id)}
                className={`group relative rounded-lg border px-4 py-3 text-left transition-[border-color,background-color] duration-hover ${
                  on ? 'border-ink bg-ink text-canvas' : 'border-line bg-surface text-ink hover:border-line-strong'
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[14px] font-semibold">{u.name}</span>
                  <span className={`num text-[12px] ${on ? 'text-canvas/70' : 'text-ink-3'}`}>{count}</span>
                </div>
                <div className={`mt-0.5 truncate text-[12px] ${on ? 'text-canvas/70' : 'text-ink-3'}`}>{u.description || '自定义单元'}</div>
              </button>
            );
          })}
          {available.length === 0 && (
            <p className="col-span-full rounded-lg border border-dashed border-line-strong px-4 py-6 text-center text-[13px] text-ink-3">
              还没有可用的单元，请先到「题库」中创建单元并导入词汇。
            </p>
          )}
        </div>
      </motion.section>

      {mode === 'ai' && (
        <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
          <div className="grid gap-8 sm:grid-cols-2">
            <div>
              <Label n={3}>题量</Label>
              <Segmented full size="md" value={aiCount} onChange={setAiCount} ariaLabel="题量" options={[5, 10, 15, 20].map((c) => ({ value: c, label: `${c}` }))} />
            </div>
            <div>
              <Label n={4}>难度</Label>
              <Segmented
                full
                size="md"
                value={aiDifficulty}
                onChange={setAiDifficulty}
                ariaLabel="难度"
                options={[
                  { value: 'mixed', label: '混合' },
                  { value: 'easy', label: '简单' },
                  { value: 'medium', label: '中等' },
                  { value: 'hard', label: '困难' },
                ]}
              />
            </div>
          </div>
          <div>
            <Label n={5}>出题策略</Label>
            <div className="divide-y divide-line rounded-xl border border-line bg-surface">
              <ToggleRow label="优先练习薄弱词汇" hint="按掌握度从弱到强选词" on={aiWeakFirst} onChange={setAiWeakFirst} />
              <ToggleRow label="随机出题" hint="打乱目标词顺序" on={aiRandom} onChange={setAiRandom} />
              <ToggleRow label="针对词形变化出题" hint="时态、分词、复数、派生词等" on={aiInflection} onChange={setAiInflection} />
              <ToggleRow
                label="允许扩展词汇"
                hint="默认关闭：AI 只使用所选单元中已有的词"
                on={aiExpand}
                onChange={setAiExpand}
              />
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-[12.5px] text-ink-3">
              <Settings2 className="h-3.5 w-3.5" />
              每题由程序校验后才能作答；生成失败的题目会自动回退到题库原题。
              <button type="button" onClick={onOpenAISettings} className="underline decoration-line-strong underline-offset-4 hover:text-ink">
                AI 设置
              </button>
            </p>
          </div>
        </motion.section>
      )}

      {/* Count & order */}
      {mode !== 'ai' && (
      <motion.section variants={riseIn} className="grid gap-8 sm:grid-cols-2">
        <div>
          <Label n={3}>题量</Label>
          <Segmented
            full
            size="md"
            value={questionCount}
            onChange={setQuestionCount}
            ariaLabel="题量"
            options={[10, 20, 30, 0].map((c) => ({ value: c, label: c === 0 ? '全部' : `${c}` }))}
          />
        </div>
        <div>
          <Label n={4}>顺序</Label>
          <Segmented
            full
            size="md"
            value={order}
            onChange={setOrder}
            ariaLabel="出题顺序"
            options={[
              { value: 'random', label: '随机' },
              { value: 'weakest-first', label: '薄弱优先' },
              { value: 'sequential', label: '原顺序' },
            ]}
          />
        </div>
      </motion.section>
      )}

      {mode === 'exam' && (
        <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <Label n={5}>计时</Label>
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-4">
            <button
              type="button"
              role="switch"
              aria-checked={timed}
              onClick={() => setTimed(!timed)}
              className="flex items-center gap-3"
            >
              <span className={`relative inline-flex h-6 w-10 items-center rounded-full transition-colors ${timed ? 'bg-accent' : 'bg-line-strong'}`}>
                <motion.span layout transition={spring.snappy} className={`h-5 w-5 rounded-full bg-white shadow-sm ${timed ? 'ml-[18px]' : 'ml-[2px]'}`} />
              </span>
              <span className="text-[14px] font-medium text-ink">
                <Clock className="mr-1 inline h-4 w-4 -translate-y-px text-ink-2" />
                倒计时
              </span>
            </button>
            {timed && (
              <Segmented
                className="ml-auto"
                value={timeLimitMinutes}
                onChange={setTimeLimitMinutes}
                ariaLabel="时长"
                options={[10, 15, 20, 30].map((m) => ({ value: m, label: `${m} 分钟` }))}
              />
            )}
          </div>
        </motion.section>
      )}

      <motion.div variants={riseIn} className="flex flex-col-reverse gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="ghost" onClick={onCancel}>
          返回
        </Button>
        <Button type="submit" variant="primary" size="lg" disabled={matchingQuestions.length === 0} trailing={<ArrowRight />} nudge>
          {mode === 'ai' ? (
            aiReady ? (
              <>
                开始 AI 练习 · <span className="num">{Math.min(aiCount, aiExpand ? aiCount : matchingQuestions.length)}</span> 题
              </>
            ) : (
              '先连接 AI'
            )
          ) : (
            <>
              开始{mode === 'exam' ? '考试' : '练习'} · <span className="num">{effectiveCount}</span> 题
            </>
          )}
        </Button>
      </motion.div>
    </motion.form>
  );
};

const ToggleRow: React.FC<{ label: string; hint?: string; on: boolean; onChange: (v: boolean) => void }> = ({ label, hint, on, onChange }) => (
  <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left">
    <span>
      <span className="block text-[14px] font-medium text-ink">{label}</span>
      {hint && <span className="mt-0.5 block text-[12.5px] text-ink-3">{hint}</span>}
    </span>
    <span className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors ${on ? 'bg-accent' : 'bg-line-strong'}`}>
      <motion.span layout transition={spring.snappy} className={`h-5 w-5 rounded-full bg-white shadow-sm ${on ? 'ml-[18px]' : 'ml-[2px]'}`} />
    </span>
  </button>
);
