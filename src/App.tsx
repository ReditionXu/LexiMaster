import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import {
  AppView,
  VocabularyQuestion,
  WordMasteryRecord,
  UserAnswerRecord,
  ExamSessionResult,
  PracticeConfig,
  OverallStats,
} from './types';
import {
  getStoredQuestions,
  saveStoredQuestions,
  resetQuestionsToDefault,
  getStoredMasteryRecords,
  saveStoredMasteryRecord,
  getStoredAnswerHistory,
  appendUserAnswerRecord,
  getStoredExamResults,
  saveExamSessionResult,
  computeOverallStats,
  toggleWordBookmark,
} from './utils/storage';
import { speech } from './utils/audio';
import { pageVariants } from './lib/motion';

import { Navbar } from './components/common/Navbar';
import { BackupModal } from './components/common/BackupModal';
import { Dashboard } from './components/dashboard/Dashboard';
import { PracticeSetup } from './components/practice/PracticeSetup';
import { PracticeSession } from './components/practice/PracticeSession';
import { ExamSession } from './components/exam/ExamSession';
import { ResultReport } from './components/results/ResultReport';
import { MistakeReview } from './components/review/MistakeReview';
// Heavier, less-frequent pages (charts, spreadsheet parsing) load on demand.
const AnalyticsDashboard = lazy(() =>
  import('./components/analytics/AnalyticsDashboard').then((m) => ({ default: m.AnalyticsDashboard }))
);
const VocabularyManager = lazy(() =>
  import('./components/manager/VocabularyManager').then((m) => ({ default: m.VocabularyManager }))
);

const PageFallback = () => (
  <div className="space-y-4" aria-busy="true">
    <div className="h-10 w-48 animate-pulse rounded-md bg-sunken" />
    <div className="h-64 animate-pulse rounded-xl bg-sunken/70" />
  </div>
);

const SESSION_VIEWS: AppView[] = ['practice', 'exam'];

export function App() {
  const [currentView, setCurrentView] = useState<AppView>('dashboard');
  const [setupMode, setSetupMode] = useState<'practice' | 'exam'>('practice');
  const [questions, setQuestions] = useState<VocabularyQuestion[]>([]);
  const [masteryRecords, setMasteryRecords] = useState<Record<string, WordMasteryRecord>>({});
  const [answerHistory, setAnswerHistory] = useState<UserAnswerRecord[]>([]);
  const [examResults, setExamResults] = useState<ExamSessionResult[]>([]);
  const [currentExamResult, setCurrentExamResult] = useState<ExamSessionResult | null>(null);
  const [sessionKey, setSessionKey] = useState(0);

  // Active Practice Configuration
  const [activeConfig, setActiveConfig] = useState<PracticeConfig>({
    mode: 'practice',
    units: [1, 2],
    questionCount: 0,
    order: 'random',
    timed: false,
  });

  // Global UI Preferences
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      const stored = localStorage.getItem('leximaster_theme');
      if (stored) return stored === 'dark';
    } catch {}
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);

  // Load stored state on mount
  const refreshLocalData = useCallback(() => {
    setQuestions(getStoredQuestions());
    setMasteryRecords(getStoredMasteryRecords());
    setAnswerHistory(getStoredAnswerHistory());
    setExamResults(getStoredExamResults());
  }, []);

  useEffect(() => {
    refreshLocalData();
  }, [refreshLocalData]);

  // Sync dark mode class with root html
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    try {
      localStorage.setItem('leximaster_theme', isDarkMode ? 'dark' : 'light');
    } catch {}
  }, [isDarkMode]);

  const toggleTheme = () => {
    const root = document.documentElement;
    root.classList.add('theme-transition');
    // Force style flush so the transition applies to the class change below.
    void root.offsetWidth;
    setIsDarkMode((d) => !d);
    window.setTimeout(() => root.classList.remove('theme-transition'), 420);
  };

  // Compute overall statistics
  const stats: OverallStats = useMemo(
    () => computeOverallStats(questions, masteryRecords, answerHistory),
    [questions, masteryRecords, answerHistory]
  );

  const go = useCallback((view: AppView) => {
    if (view === 'exam') {
      // From navigation, "模拟考试" opens the exam configuration first.
      setSetupMode('exam');
      setCurrentView('practice-setup');
    } else {
      if (view === 'practice-setup') setSetupMode('practice');
      setCurrentView(view);
    }
  }, []);

  // Scroll to top on each view change (without smooth scrolling fighting the page transition)
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [currentView]);

  // Handlers for Practice and Exam
  const handleStartPractice = (config: PracticeConfig) => {
    setActiveConfig(config);
    setSessionKey((k) => k + 1);
    setCurrentView(config.mode === 'exam' ? 'exam' : 'practice');
  };

  const handleRecordAnswer = (record: UserAnswerRecord, updatedMastery: WordMasteryRecord) => {
    appendUserAnswerRecord(record);
    saveStoredMasteryRecord(updatedMastery);
    setMasteryRecords((prev) => ({ ...prev, [updatedMastery.wordId]: updatedMastery }));
    setAnswerHistory((prev) => [...prev, record]);
  };

  const handleToggleBookmark = (wordId: string) => {
    toggleWordBookmark(wordId);
    setMasteryRecords(getStoredMasteryRecords());
  };

  const handleFinishExam = (result: ExamSessionResult) => {
    saveExamSessionResult(result);
    setExamResults((prev) => [result, ...prev]);

    // Persist each exam answer into the answer history (unchanged behaviour)
    result.answers.forEach((rec) => {
      appendUserAnswerRecord(rec);
    });
    setAnswerHistory(getStoredAnswerHistory());

    setCurrentExamResult(result);
    setCurrentView('results');
  };

  const handleRetestIncorrect = (wrongQuestions: VocabularyQuestion[]) => {
    if (wrongQuestions.length === 0) return;
    const ids = Array.from(new Set(wrongQuestions.map((q) => q.id)));
    const units = Array.from(new Set(wrongQuestions.map((q) => q.unit)));
    handleStartPractice({
      mode: 'practice',
      units,
      questionCount: ids.length,
      order: 'sequential',
      timed: false,
      questionIds: ids,
      label: '错题重练',
    });
  };

  const handleUpdateQuestions = (newQuestions: VocabularyQuestion[]) => {
    saveStoredQuestions(newQuestions);
    setQuestions(newQuestions);
  };

  const handleResetToDefault = () => {
    setQuestions(resetQuestionsToDefault());
  };

  const inSession = SESSION_VIEWS.includes(currentView);
  const navView: AppView = currentView === 'practice-setup' && setupMode === 'exam' ? 'exam' : currentView;
  const showChrome = !inSession && !isFocusMode;

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex min-h-[100dvh] flex-col bg-canvas text-ink">
        {!inSession && (
          <Navbar
            currentView={navView}
            onNavigate={(view) => {
              setIsFocusMode(false);
              go(view);
            }}
            isDarkMode={isDarkMode}
            onToggleDarkMode={toggleTheme}
            isAudioEnabled={isAudioEnabled}
            onToggleAudio={() => {
              const next = !isAudioEnabled;
              setIsAudioEnabled(next);
              speech.setEnabled(next);
            }}
            isFocusMode={isFocusMode}
            onToggleFocusMode={() => setIsFocusMode(!isFocusMode)}
            onOpenBackupModal={() => setIsBackupModalOpen(true)}
            weakCount={stats.weakCount}
          />
        )}

        <main
          className={`flex-1 w-full ${
            inSession
              ? ''
              : `mx-auto max-w-page px-4 sm:px-6 lg:px-8 pt-6 sm:pt-10 ${
                  isFocusMode ? 'pb-16' : 'pb-[calc(var(--tabbar-h)+env(safe-area-inset-bottom)+32px)] md:pb-20'
                }`
          }`}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={currentView === 'practice' || currentView === 'exam' ? `${currentView}-${sessionKey}` : currentView}
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              {currentView === 'dashboard' && (
                <Dashboard
                  questions={questions}
                  masteryRecords={masteryRecords}
                  history={answerHistory}
                  exams={examResults}
                  stats={stats}
                  onStartPractice={handleStartPractice}
                  onStartExam={handleStartPractice}
                  onNavigate={go}
                  onRecordAnswer={handleRecordAnswer}
                />
              )}

              {currentView === 'practice-setup' && (
                <PracticeSetup
                  key={setupMode}
                  questions={questions}
                  initialConfig={
                    setupMode === 'exam'
                      ? { mode: 'exam', units: [1, 2], questionCount: 20, order: 'random', timed: true, timeLimitMinutes: 15 }
                      : { ...activeConfig, mode: 'practice', questionIds: undefined }
                  }
                  onStart={handleStartPractice}
                  onCancel={() => setCurrentView('dashboard')}
                />
              )}

              {currentView === 'practice' && (
                <PracticeSession
                  questions={questions}
                  config={activeConfig}
                  masteryRecords={masteryRecords}
                  isAudioEnabled={isAudioEnabled}
                  onToggleAudio={() => {
                    const next = !isAudioEnabled;
                    setIsAudioEnabled(next);
                    speech.setEnabled(next);
                  }}
                  onRecordAnswer={handleRecordAnswer}
                  onToggleBookmark={handleToggleBookmark}
                  onRetest={handleRetestIncorrect}
                  onRestart={() => handleStartPractice({ ...activeConfig })}
                  onFinish={() => setCurrentView('dashboard')}
                  onExit={() => setCurrentView('dashboard')}
                />
              )}

              {currentView === 'exam' && (
                <ExamSession
                  questions={questions}
                  config={activeConfig}
                  masteryRecords={masteryRecords}
                  onFinishExam={handleFinishExam}
                  onExit={() => setCurrentView('dashboard')}
                />
              )}

              {currentView === 'results' && currentExamResult && (
                <ResultReport
                  result={currentExamResult}
                  previousExams={examResults.filter((e) => e.id !== currentExamResult.id)}
                  onRetestIncorrect={handleRetestIncorrect}
                  onReturnToDashboard={() => setCurrentView('dashboard')}
                />
              )}

              {currentView === 'review' && (
                <MistakeReview
                  questions={questions}
                  masteryRecords={masteryRecords}
                  onStartPractice={handleStartPractice}
                  onToggleBookmark={handleToggleBookmark}
                />
              )}

              {currentView === 'analytics' && (
                <Suspense fallback={<PageFallback />}>
                <AnalyticsDashboard
                  questions={questions}
                  masteryRecords={masteryRecords}
                  exams={examResults}
                  history={answerHistory}
                  stats={stats}
                  onNavigate={go}
                  onStartPractice={handleStartPractice}
                />
                </Suspense>
              )}

              {currentView === 'manager' && (
                <Suspense fallback={<PageFallback />}>
                <VocabularyManager
                  questions={questions}
                  masteryRecords={masteryRecords}
                  onUpdateQuestions={handleUpdateQuestions}
                  onResetToDefault={handleResetToDefault}
                />
                </Suspense>
              )}
            </motion.div>
          </AnimatePresence>
        </main>

        {showChrome && (
          <footer className="hidden border-t border-line md:block">
            <div className="mx-auto flex max-w-page items-center justify-between px-8 py-6 text-[12.5px] text-ink-3">
              <span>
                <span className="font-medium text-ink-2">LexiMaster</span>
                <span className="divider-dot" />
                大学英语智能词汇测评
              </span>
              <span className="font-serif italic text-[13.5px]">Make every word count.</span>
            </div>
          </footer>
        )}

        <BackupModal
          isOpen={isBackupModalOpen}
          onClose={() => setIsBackupModalOpen(false)}
          onDataRestored={refreshLocalData}
        />
      </div>
    </MotionConfig>
  );
}

export default App;
