import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  BarChart3,
  BookOpen,
  Database,
  FileCheck2,
  Home,
  Maximize2,
  Minimize2,
  Moon,
  MoreHorizontal,
  NotebookPen,
  Sun,
  Volume2,
  VolumeX,
  HardDriveDownload,
  Sparkles,
} from 'lucide-react';
import { AppView } from '../../types';
import { LogoMark } from '../ui/Common';
import { spring } from '../../lib/motion';

interface NavbarProps {
  currentView: AppView;
  onNavigate: (view: AppView) => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  isAudioEnabled: boolean;
  onToggleAudio: () => void;
  isFocusMode: boolean;
  onToggleFocusMode: () => void;
  onOpenBackupModal: () => void;
  onOpenAISettings?: () => void;
  aiStatus?: 'on' | 'incomplete' | 'off';
  weakCount?: number;
}

type NavItem = { view: AppView; label: string; short: string; icon: React.ReactNode; mobile: boolean };

const NAV: NavItem[] = [
  { view: 'dashboard', label: '首页', short: '首页', icon: <Home />, mobile: true },
  { view: 'practice-setup', label: '练习', short: '练习', icon: <BookOpen />, mobile: true },
  { view: 'exam', label: '模拟考试', short: '考试', icon: <FileCheck2 />, mobile: true },
  { view: 'review', label: '错题本', short: '错题', icon: <NotebookPen />, mobile: true },
  { view: 'analytics', label: '掌握度', short: '分析', icon: <BarChart3 />, mobile: true },
  { view: 'manager', label: '题库', short: '题库', icon: <Database />, mobile: false },
];

const isActive = (item: AppView, current: AppView) =>
  current === item ||
  (item === 'practice-setup' && current === 'practice') ||
  (item === 'exam' && current === 'results');

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  onNavigate,
  isDarkMode,
  onToggleDarkMode,
  isAudioEnabled,
  onToggleAudio,
  isFocusMode,
  onToggleFocusMode,
  onOpenBackupModal,
  onOpenAISettings,
  aiStatus = 'off',
  weakCount = 0,
}) => {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 6);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  if (isFocusMode) {
    return (
      <motion.button
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={onToggleFocusMode}
        className="fixed right-4 top-4 z-50 inline-flex h-9 items-center gap-2 rounded-full border border-line bg-elevated/90 px-3.5 text-[13px] font-medium text-ink-2 shadow-md backdrop-blur-md hover:text-ink"
      >
        <Minimize2 className="h-3.5 w-3.5" />
        退出专注模式
      </motion.button>
    );
  }

  const ThemeIcon = (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={isDarkMode ? 'sun' : 'moon'}
        initial={{ opacity: 0, rotate: -40, scale: 0.7 }}
        animate={{ opacity: 1, rotate: 0, scale: 1 }}
        exit={{ opacity: 0, rotate: 40, scale: 0.7 }}
        transition={{ duration: 0.18 }}
        className="inline-flex"
      >
        {isDarkMode ? <Sun className="h-[17px] w-[17px]" /> : <Moon className="h-[17px] w-[17px]" />}
      </motion.span>
    </AnimatePresence>
  );

  const iconBtn =
    'inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-2 transition-colors duration-hover hover:bg-sunken hover:text-ink';

  return (
    <>
      <header
        className={`sticky top-0 z-40 transition-[background-color,border-color,backdrop-filter] duration-300 ${
          scrolled
            ? 'border-b border-line/80 bg-canvas/75 backdrop-blur-xl backdrop-saturate-150'
            : 'border-b border-transparent bg-canvas'
        }`}
      >
        <div className="mx-auto flex h-[var(--nav-h)] max-w-page items-center gap-6 px-4 sm:px-6 lg:px-8">
          {/* Brand */}
          <button
            onClick={() => onNavigate('dashboard')}
            className="group -ml-1 flex items-center gap-2.5 rounded-md px-1 py-1"
            aria-label="LexiMaster 首页"
          >
            <LogoMark size={28} />
            <span className="text-[16px] font-semibold tracking-[-0.02em] text-ink">
              Lexi<span className="font-serif text-[17.5px] font-medium italic tracking-normal">master</span>
            </span>
          </button>

          {/* Desktop nav */}
          <nav className="hidden flex-1 items-center justify-center md:flex" aria-label="主导航">
            <div className="flex items-center gap-0.5">
              {NAV.map((item) => {
                const active = isActive(item.view, currentView);
                return (
                  <button
                    key={item.view}
                    onClick={() => onNavigate(item.view)}
                    aria-current={active ? 'page' : undefined}
                    className={`relative isolate h-8 rounded-md px-3 text-[13.5px] font-medium transition-colors duration-hover ${
                      active ? 'text-ink' : 'text-ink-2 hover:text-ink'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="nav-pill"
                        transition={spring.gentle}
                        className="absolute inset-0 -z-10 rounded-md bg-surface shadow-sm ring-1 ring-line dark:bg-elevated"
                      />
                    )}
                    <span className="relative inline-flex items-center gap-1.5">
                      {item.label}
                      {item.view === 'review' && weakCount > 0 && (
                        <span className="num inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-danger/10 px-1 text-[10.5px] font-semibold text-danger">
                          {weakCount}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </nav>

          {/* Utilities */}
          <div className="ml-auto flex items-center gap-1 md:ml-0">
            {onOpenAISettings && (
              <button
                onClick={onOpenAISettings}
                aria-current={currentView === 'ai-settings' ? 'page' : undefined}
                title={aiStatus === 'on' ? 'AI 已启用' : aiStatus === 'incomplete' ? 'AI 配置未完成' : 'AI 未启用'}
                className={`relative inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium transition-colors hover:bg-sunken ${
                  currentView === 'ai-settings' ? 'bg-sunken text-ink' : 'text-ink-2 hover:text-ink'
                }`}
              >
                <Sparkles className={`h-4 w-4 ${aiStatus === 'on' ? 'text-accent' : ''}`} />
                <span className="hidden sm:inline">AI</span>
                <span
                  className={`h-1.5 w-1.5 rounded-full ${aiStatus === 'on' ? 'bg-success' : aiStatus === 'incomplete' ? 'bg-warning' : 'bg-line-strong'}`}
                  aria-hidden
                />
              </button>
            )}
            <button
              onClick={onToggleDarkMode}
              className={iconBtn}
              aria-label={isDarkMode ? '切换至浅色模式' : '切换至深色模式'}
              title={isDarkMode ? '浅色模式' : '深色模式'}
            >
              {ThemeIcon}
            </button>

            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className={`${iconBtn} ${menuOpen ? 'bg-sunken text-ink' : ''}`}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="更多设置"
              >
                <MoreHorizontal className="h-[18px] w-[18px]" />
              </button>
              <AnimatePresence>
                {menuOpen && (
                  <motion.div
                    role="menu"
                    initial={{ opacity: 0, y: -6, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.12 } }}
                    transition={spring.snappy}
                    style={{ originX: 1, originY: 0 }}
                    className="absolute right-0 top-11 z-50 w-60 rounded-lg border border-line bg-elevated p-1.5 shadow-lg"
                  >
                    <MenuRow
                      icon={isAudioEnabled ? <Volume2 /> : <VolumeX />}
                      label="句子朗读"
                      right={<Switch on={isAudioEnabled} />}
                      onClick={onToggleAudio}
                    />
                    <MenuRow
                      icon={<Maximize2 />}
                      label="专注模式"
                      hint="隐藏导航"
                      onClick={() => {
                        setMenuOpen(false);
                        onToggleFocusMode();
                      }}
                    />
                    <div className="my-1 h-px bg-line" />
                    <MenuRow
                      icon={<Database />}
                      label="题库管理"
                      className="md:hidden"
                      onClick={() => {
                        setMenuOpen(false);
                        onNavigate('manager');
                      }}
                    />
                    <MenuRow
                      icon={<HardDriveDownload />}
                      label="备份与恢复"
                      onClick={() => {
                        setMenuOpen(false);
                        onOpenBackupModal();
                      }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile tab bar */}
      <nav
        aria-label="底部导航"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line/80 bg-canvas/85 backdrop-blur-xl backdrop-saturate-150 pb-safe md:hidden"
      >
        <div className="mx-auto grid h-[var(--tabbar-h)] max-w-md grid-cols-5 px-2">
          {NAV.filter((n) => n.mobile).map((item) => {
            const active = isActive(item.view, currentView);
            return (
              <button
                key={item.view}
                onClick={() => onNavigate(item.view)}
                aria-current={active ? 'page' : undefined}
                className={`relative flex flex-col items-center justify-center gap-1 text-[10.5px] font-medium transition-colors ${
                  active ? 'text-ink' : 'text-ink-3'
                }`}
              >
                <span className="relative flex h-7 w-12 items-center justify-center [&>svg]:h-[19px] [&>svg]:w-[19px]">
                  {active && (
                    <motion.span
                      layoutId="tab-pill"
                      transition={spring.gentle}
                      className="absolute inset-0 rounded-full bg-accent-soft"
                    />
                  )}
                  <span className={`relative ${active ? 'text-accent' : ''} [&>svg]:h-[19px] [&>svg]:w-[19px]`}>
                    {item.icon}
                  </span>
                  {item.view === 'review' && weakCount > 0 && (
                    <span className="absolute right-1.5 top-0.5 h-1.5 w-1.5 rounded-full bg-danger" />
                  )}
                </span>
                {item.short}
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};

const MenuRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  hint?: string;
  right?: React.ReactNode;
  onClick: () => void;
  className?: string;
}> = ({ icon, label, hint, right, onClick, className = '' }) => (
  <button
    role="menuitem"
    onClick={onClick}
    className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13.5px] text-ink transition-colors hover:bg-sunken ${className}`}
  >
    <span className="text-ink-2 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
    <span className="flex-1">{label}</span>
    {hint && <span className="text-[12px] text-ink-3">{hint}</span>}
    {right}
  </button>
);

const Switch: React.FC<{ on: boolean }> = ({ on }) => (
  <span
    className={`relative inline-flex h-[18px] w-[30px] items-center rounded-full transition-colors duration-hover ${
      on ? 'bg-accent' : 'bg-line-strong'
    }`}
  >
    <motion.span
      layout
      transition={spring.snappy}
      className={`h-[14px] w-[14px] rounded-full bg-white shadow-sm ${on ? 'ml-[14px]' : 'ml-[2px]'}`}
    />
  </span>
);
