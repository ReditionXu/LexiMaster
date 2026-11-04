import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { ease, spring } from '../../lib/motion';
import { Button } from './Button';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** Prevent closing on backdrop click / Escape. */
  persistent?: boolean;
}

const widths = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl' };

/**
 * Dialog. Centered on desktop, bottom sheet on phones.
 * Escape closes, focus moves into the panel and returns on close.
 */
export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  persistent,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    lastFocused.current = document.activeElement as HTMLElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const t = setTimeout(() => {
      const el = panelRef.current?.querySelector<HTMLElement>('[data-autofocus], input, textarea, select, button:not([data-close])');
      el?.focus({ preventScroll: true });
    }, 40);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !persistent) {
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = prevOverflow;
      lastFocused.current?.focus?.({ preventScroll: true });
    };
  }, [open, persistent]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-6">
          <motion.div
            className="absolute inset-0 bg-[rgb(10_10_16/0.42)] dark:bg-[rgb(0_0_0/0.6)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.2 } }}
            exit={{ opacity: 0, transition: { duration: 0.16 } }}
            onClick={() => !persistent && onClose()}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            className={`relative w-full ${widths[size]} max-h-[92dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-elevated border border-line shadow-lg pb-safe`}
            initial={{ opacity: 0, y: 24, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: spring.soft }}
            exit={{ opacity: 0, y: 12, scale: 0.99, transition: { duration: 0.16, ease: ease.inOut } }}
          >
            <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-line-strong sm:hidden" />
            {(title || description) && (
              <div className="px-6 pt-5 sm:pt-6 pr-14">
                {title && <h3 className="text-[17px] font-semibold tracking-tight text-ink">{title}</h3>}
                {description && <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{description}</p>}
              </div>
            )}
            {!persistent && (
              <Button
                data-close
                variant="ghost"
                size="icon-sm"
                aria-label="关闭"
                onClick={onClose}
                className="!absolute right-3 top-3 sm:top-4"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
            {children && <div className="px-6 py-5">{children}</div>}
            {footer && (
              <div className="flex flex-col-reverse gap-2 border-t border-line px-6 py-4 sm:flex-row sm:justify-end">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};

interface ConfirmProps {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
  children?: React.ReactNode;
}

export const ConfirmDialog: React.FC<ConfirmProps> = ({
  open,
  title,
  description,
  confirmLabel = '确认',
  cancelLabel = '取消',
  tone = 'default',
  onConfirm,
  onCancel,
  children,
}) => (
  <Modal
    open={open}
    onClose={onCancel}
    title={title}
    description={description}
    size="sm"
    footer={
      <>
        <Button variant="ghost" onClick={onCancel} className="sm:w-auto w-full">
          {cancelLabel}
        </Button>
        <Button
          data-autofocus
          variant={tone === 'danger' ? 'danger' : 'primary'}
          onClick={onConfirm}
          className="sm:w-auto w-full"
        >
          {confirmLabel}
        </Button>
      </>
    }
  >
    {children}
  </Modal>
);

