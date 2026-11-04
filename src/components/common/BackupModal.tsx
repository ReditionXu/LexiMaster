import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, CheckCircle2, Download, Upload } from 'lucide-react';
import { exportAllDataAsJSON, importAllDataFromJSON } from '../../utils/storage';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

interface BackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataRestored: () => void;
}

export const BackupModal: React.FC<BackupModalProps> = ({ isOpen, onClose, onDataRestored }) => {
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) setStatusMsg(null);
  }, [isOpen]);

  const handleDownloadBackup = () => {
    const jsonStr = exportAllDataAsJSON();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `LexiMaster_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setStatusMsg({ type: 'success', text: '备份文件已下载。' });
  };

  const restore = async (file: File) => {
    try {
      const text = await file.text();
      const res = importAllDataFromJSON(text);
      if (res.success) {
        setStatusMsg({ type: 'success', text: '学习记录与题库已恢复。' });
        onDataRestored();
        setTimeout(onClose, 1200);
      } else {
        setStatusMsg({ type: 'error', text: res.message });
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: `读取文件失败: ${err.message}` });
    }
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="备份与恢复"
      description="刷题记录、考试成绩与题库都保存在这台设备的浏览器中。导出备份即可在其他设备上恢复。"
    >
      <AnimatePresence>
        {statusMsg && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div
              className={`mb-4 flex items-center gap-2 rounded-lg px-3 py-2.5 text-[13px] ${
                statusMsg.type === 'success' ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'
              }`}
              role="status"
            >
              {statusMsg.type === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
              {statusMsg.text}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4 rounded-xl border border-line p-4">
          <div>
            <div className="text-[14px] font-medium text-ink">导出完整备份</div>
            <div className="mt-0.5 text-[12.5px] text-ink-3">题库、掌握度、历史记录 · JSON</div>
          </div>
          <Button variant="primary" size="sm" leading={<Download />} onClick={handleDownloadBackup}>
            下载
          </Button>
        </div>

        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files?.[0];
            if (f) restore(f);
          }}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-4 py-7 text-center transition-colors ${
            dragging ? 'border-accent bg-accent-soft/60' : 'border-line-strong hover:border-ink-3 hover:bg-sunken/50'
          }`}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) restore(f);
              if (fileRef.current) fileRef.current.value = '';
            }}
          />
          <Upload className="h-5 w-5 text-ink-2" />
          <span className="mt-2 text-[14px] font-medium text-ink">从备份恢复</span>
          <span className="mt-0.5 text-[12.5px] text-ink-3">点击选择或拖入 .json 备份文件</span>
        </label>
      </div>
    </Modal>
  );
};
