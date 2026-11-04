import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, BookOpen, Check, Clock, FileCheck2 } from 'lucide-react';
import { PracticeConfig, VocabularyQuestion } from '../../types';
import { getAvailableUnits, getUnitMeta } from '../../lib/insights';
import { riseIn, spring, staggerContainer } from '../../lib/motion';
import { Button } from '../ui/Button';
import { Segmented } from '../ui/Segmented';
import { PageHeader } from '../ui/Common';

interface PracticeSetupProps {
  questions: VocabularyQuestion[];
  initialConfig?: Partial<PracticeConfig>;
  onStart: (config: PracticeConfig) => void;
  onCancel: () => void;
}

export const PracticeSetup: React.FC<PracticeSetupProps> = ({ questions, initialConfig, onStart, onCancel }) => {
  const [mode, setMode] = useState<'practice' | 'exam'>(initialConfig?.mode === 'exam' ? 'exam' : 'practice');
  const availableUnits = getAvailableUnits(questions);
  const [selectedUnits, setSelectedUnits] = useState<number[]>(
    (initialConfig?.units || [1, 2]).filter((u) => availableUnits.includes(u)).length
      ? (initialConfig?.units || [1, 2]).filter((u) => availableUnits.includes(u))
      : availableUnits.slice(0, 1)
  );
  const [questionCount, setQuestionCount] = useState<number>(initialConfig?.questionCount ?? 0);
  const [order, setOrder] = useState<'sequential' | 'random' | 'weakest-first'>(initialConfig?.order || 'random');
  const [timed, setTimed] = useState<boolean>(initialConfig?.timed ?? initialConfig?.mode === 'exam');
  const [timeLimitMinutes, setTimeLimitMinutes] = useState<number>(initialConfig?.timeLimitMinutes || 15);

  const toggleUnit = (u: number) => {
    if (selectedUnits.includes(u)) {
      if (selectedUnits.length > 1) setSelectedUnits(selectedUnits.filter((x) => x !== u));
    } else {
      setSelectedUnits([...selectedUnits, u].sort((a, b) => a - b));
    }
  };

  const matchingQuestions = questions.filter((q) => selectedUnits.includes(q.unit));
  const effectiveCount =
    questionCount === 0 ? matchingQuestions.length : Math.min(questionCount, matchingQuestions.length);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (matchingQuestions.length === 0) return;
    onStart({
      mode,
      units: selectedUnits,
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
      desc: '全程不显示答案，可跳题与标记存疑，交卷后统一评分并生成诊断报告。',
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
          eyebrow={mode === 'exam' ? 'Mock exam' : 'Practice'}
          title={mode === 'exam' ? '配置模拟考试' : '配置练习'}
          description="选择范围、题量与节奏，开始一组专注的练习。"
        />
      </motion.div>

      {/* Mode */}
      <motion.section variants={riseIn}>
        <Label n={1}>模式</Label>
        <div className="grid gap-3 sm:grid-cols-2" role="radiogroup">
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
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="text-[15.5px] font-semibold text-ink">{m.title}</span>
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
              {availableUnits.includes(1) && availableUnits.includes(2) && (
                <Button size="sm" variant="ghost" onClick={() => setSelectedUnits([1, 2])}>
                  期中重点
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setSelectedUnits(availableUnits)}>
                全选
              </Button>
            </div>
          }
        >
          单元范围
        </Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {availableUnits.map((u) => {
            const count = questions.filter((q) => q.unit === u).length;
            const on = selectedUnits.includes(u);
            return (
              <button
                key={u}
                type="button"
                aria-pressed={on}
                onClick={() => toggleUnit(u)}
                className={`group relative rounded-lg border px-4 py-3 text-left transition-[border-color,background-color] duration-hover ${
                  on ? 'border-ink bg-ink text-canvas' : 'border-line bg-surface text-ink hover:border-line-strong'
                }`}
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-[14px] font-semibold">Unit {u}</span>
                  <span className={`num text-[12px] ${on ? 'text-canvas/70' : 'text-ink-3'}`}>{count}</span>
                </div>
                <div className={`mt-0.5 truncate text-[12px] ${on ? 'text-canvas/70' : 'text-ink-3'}`}>{getUnitMeta(u).subtitle}</div>
              </button>
            );
          })}
        </div>
      </motion.section>

      {/* Count & order */}
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
          开始{mode === 'exam' ? '考试' : '练习'} · <span className="num">{effectiveCount}</span> 题
        </Button>
      </motion.div>
    </motion.form>
  );
};
