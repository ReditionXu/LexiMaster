import React, { useState, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Plus,
  Upload,
  Download,
  Search,
  Trash2,
  Pencil,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  FileText,
  RotateCcw,
  X,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Modal, ConfirmDialog } from '../ui/Modal';
import { Segmented } from '../ui/Segmented';
import { EmptyState, PageHeader } from '../ui/Common';
import { getAvailableUnits } from '../../lib/insights';
import { ease } from '../../lib/motion';
import {
  VocabularyQuestion,
  WordMasteryRecord,
  PartOfSpeech,
  Difficulty,
} from '../../types';
import {
  parseJSONQuestions,
  parseCSVQuestions,
  parseExcelQuestions,
  exportQuestionsToExcel,
  exportQuestionsToCSV,
  downloadVocabularyTemplate,
  ImportValidationResult,
} from '../../utils/importExport';

interface VocabularyManagerProps {
  questions: VocabularyQuestion[];
  masteryRecords: Record<string, WordMasteryRecord>;
  onUpdateQuestions: (newQuestions: VocabularyQuestion[]) => void;
  onResetToDefault: () => void;
}

export const VocabularyManager: React.FC<VocabularyManagerProps> = ({
  questions,
  masteryRecords,
  onUpdateQuestions,
  onResetToDefault,
}) => {
  const [selectedUnit, setSelectedUnit] = useState<number | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<VocabularyQuestion | null>(null);
  const [importResult, setImportResult] = useState<ImportValidationResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<VocabularyQuestion | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Form State for Add / Edit
  const [formUnit, setFormUnit] = useState<number>(1);
  const [formWord, setFormWord] = useState('');
  const [formSentence, setFormSentence] = useState('');
  const [formHint, setFormHint] = useState('');
  const [formCorrect, setFormCorrect] = useState('');
  const [formAccepted, setFormAccepted] = useState('');
  const [formPOS, setFormPOS] = useState<PartOfSpeech>('verb');
  const [formDifficulty, setFormDifficulty] = useState<Difficulty>('medium');
  const [formGrammarNote, setFormGrammarNote] = useState('');
  const [formExplanation, setFormExplanation] = useState('');
  const [formCollocation, setFormCollocation] = useState('');
  const [formPhonetic, setFormPhonetic] = useState('');

  // Filter questions
  const filteredQuestions = questions.filter((q) => {
    if (selectedUnit !== 'all' && q.unit !== selectedUnit) return false;
    if (searchQuery.trim()) {
      const qLower = searchQuery.toLowerCase();
      const matchWord = q.word.toLowerCase().includes(qLower);
      const matchSentence = q.sentence.toLowerCase().includes(qLower);
      const matchHint = q.chineseHint.includes(searchQuery.trim());
      const matchAns = q.correctAnswer.toLowerCase().includes(qLower);
      return matchWord || matchSentence || matchHint || matchAns;
    }
    return true;
  });

  const openAddModal = () => {
    setEditingQuestion(null);
    setFormUnit(typeof selectedUnit === 'number' ? selectedUnit : 1);
    setFormWord('');
    setFormSentence('');
    setFormHint('');
    setFormCorrect('');
    setFormAccepted('');
    setFormPOS('verb');
    setFormDifficulty('medium');
    setFormGrammarNote('');
    setFormExplanation('');
    setFormCollocation('');
    setFormPhonetic('');
    setFormError(null);
    setShowAddModal(true);
  };

  const openEditModal = (q: VocabularyQuestion) => {
    setEditingQuestion(q);
    setFormUnit(q.unit);
    setFormWord(q.word);
    setFormSentence(q.sentence);
    setFormHint(q.chineseHint);
    setFormCorrect(q.correctAnswer);
    setFormAccepted(q.acceptedAnswers.join(', '));
    setFormPOS(q.partOfSpeech);
    setFormDifficulty(q.difficulty);
    setFormGrammarNote(q.grammarNote || '');
    setFormExplanation(q.explanation || '');
    setFormCollocation(q.collocation || '');
    setFormPhonetic(q.phonetic || '');
    setFormError(null);
    setShowAddModal(true);
  };

  const handleSaveQuestion = (e: React.FormEvent) => {
    e.preventDefault();

    // Check sentence has exactly one blank
    const blanks = formSentence.match(/_{3,}|\{blank\}|\[blank\]/g);
    if (!blanks || blanks.length === 0) {
      setFormError("例句中必须包含一个填空位置，例如使用 '_____' 占位。");
      return;
    }
    if (blanks.length > 1) {
      setFormError('例句中只能包含一个填空位置。');
      return;
    }

    setFormError(null);
    const acceptedArr = formAccepted
      .split(/[,|;/]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!acceptedArr.includes(formCorrect.trim())) {
      acceptedArr.unshift(formCorrect.trim());
    }

    const standardizedSentence = formSentence.replace(/_{3,}|\{blank\}|\[blank\]/g, '_____');

    if (editingQuestion) {
      // Edit existing
      const updatedList = questions.map((item) =>
        item.id === editingQuestion.id
          ? {
              ...item,
              unit: Number(formUnit),
              word: formWord.trim(),
              sentence: standardizedSentence,
              chineseHint: formHint.trim(),
              correctAnswer: formCorrect.trim(),
              acceptedAnswers: acceptedArr,
              partOfSpeech: formPOS,
              difficulty: formDifficulty,
              grammarNote: formGrammarNote.trim() || '语境语法考点',
              explanation: formExplanation.trim() || `本题考查 ${formWord.trim()} 在句中的正确形式。`,
              collocation: formCollocation.trim() || undefined,
              phonetic: formPhonetic.trim() || undefined,
            }
          : item
      );
      onUpdateQuestions(updatedList);
    } else {
      // Create new
      const newQ: VocabularyQuestion = {
        id: `U${formUnit}-${formWord.slice(0, 4).toUpperCase()}-${Date.now().toString(36)}`,
        unit: Number(formUnit),
        word: formWord.trim(),
        sentence: standardizedSentence,
        chineseHint: formHint.trim(),
        correctAnswer: formCorrect.trim(),
        acceptedAnswers: acceptedArr,
        partOfSpeech: formPOS,
        difficulty: formDifficulty,
        grammarNote: formGrammarNote.trim() || '语境语法考点',
        explanation: formExplanation.trim() || `本题考查 ${formWord.trim()} 在句中的正确形式。`,
        collocation: formCollocation.trim() || undefined,
        phonetic: formPhonetic.trim() || undefined,
        isCustom: true,
      };
      onUpdateQuestions([newQ, ...questions]);
    }

    setShowAddModal(false);
  };

  const handleDeleteQuestion = (id: string) => {
    onUpdateQuestions(questions.filter((q) => q.id !== id));
  };

  // Handle File Upload (JSON, CSV, XLSX)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportResult(null);
    setUploadError(null);

    const ext = file.name.split('.').pop()?.toLowerCase();

    try {
      if (ext === 'json') {
        const text = await file.text();
        const res = parseJSONQuestions(text, questions);
        setImportResult(res);
        if (res.validQuestions.length > 0) {
          onUpdateQuestions([...questions, ...res.validQuestions]);
        }
      } else if (ext === 'csv') {
        const text = await file.text();
        const res = parseCSVQuestions(text, questions);
        setImportResult(res);
        if (res.validQuestions.length > 0) {
          onUpdateQuestions([...questions, ...res.validQuestions]);
        }
      } else if (ext === 'xlsx' || ext === 'xls') {
        const buffer = await file.arrayBuffer();
        const res = parseExcelQuestions(buffer, questions);
        setImportResult(res);
        if (res.validQuestions.length > 0) {
          onUpdateQuestions([...questions, ...res.validQuestions]);
        }
      } else {
        setUploadError('不支持的文件格式。请选择 .xlsx、.csv 或 .json 文件。');
      }
    } catch (err: any) {
      setUploadError(`导入异常: ${err.message}`);
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const units = getAvailableUnits(questions);
  const unitOptions = Array.from(new Set([1, 2, 3, 4, ...units])).sort((a, b) => a - b);

  const accuracyCell = (q: VocabularyQuestion) => {
    const rec = masteryRecords[q.id];
    const total = rec?.totalAttempts || 0;
    const correct = rec?.correctAttempts || 0;
    if (!total) return <span className="text-[12.5px] text-ink-3">未练习</span>;
    const acc = Math.round((correct / total) * 100);
    return (
      <span className="inline-flex items-center gap-2">
        <span className="h-1.5 w-10 overflow-hidden rounded-full bg-sunken">
          <span
            className={`block h-full rounded-full ${acc >= 80 ? 'bg-success' : acc >= 50 ? 'bg-warning' : 'bg-danger'}`}
            style={{ width: `${acc}%` }}
          />
        </span>
        <span className="num text-[12.5px] text-ink-2">
          {acc}% <span className="text-ink-3">({correct}/{total})</span>
        </span>
      </span>
    );
  };

  const fieldLabel = 'mb-1.5 block text-[12.5px] font-medium text-ink-2';

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Question bank"
        title="题库"
        description="支持 Excel / CSV / JSON 导入，自动进行必填校验、单一填空位检查与重复过滤。"
        actions={
          <>
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".xlsx,.xls,.csv,.json" className="hidden" />
            <Button variant="primary" leading={<Upload />} onClick={() => fileInputRef.current?.click()} disabled={isImporting}>
              {isImporting ? '解析中…' : '导入题库'}
            </Button>
            <Button variant="secondary" leading={<Plus />} onClick={openAddModal}>
              新增题目
            </Button>
          </>
        }
      />

      {/* Secondary actions */}
      <div className="flex flex-wrap items-center gap-1 text-[13px]">
        <Button size="sm" variant="ghost" leading={<FileSpreadsheet />} onClick={() => downloadVocabularyTemplate('xlsx')}>
          下载 Excel 模板
        </Button>
        <Button size="sm" variant="ghost" leading={<Download />} onClick={() => exportQuestionsToExcel(questions)}>
          导出 Excel
        </Button>
        <Button size="sm" variant="ghost" leading={<FileText />} onClick={() => exportQuestionsToCSV(questions)}>
          导出 CSV
        </Button>
        <Button size="sm" variant="ghost" leading={<RotateCcw />} onClick={() => setConfirmReset(true)} className="hover:!text-danger">
          恢复默认题库
        </Button>
      </div>

      {/* Import diagnostics */}
      <AnimatePresence>
        {(importResult || uploadError) && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25, ease: ease.out }}
            className={`rounded-xl border p-5 ${
              uploadError || (importResult && importResult.errors.length > 0)
                ? 'border-warning/30 bg-warning-soft/60'
                : 'border-success/25 bg-success-soft/60'
            }`}
          >
            <div className="flex items-start gap-3">
              {uploadError || (importResult && importResult.errors.length > 0) ? (
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-warning-ink" />
              ) : (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
              )}
              <div className="min-w-0 flex-1">
                {uploadError ? (
                  <h4 className="text-[14px] font-semibold text-ink">{uploadError}</h4>
                ) : (
                  importResult && (
                    <>
                      <h4 className="text-[14px] font-semibold text-ink">
                        成功导入 {importResult.validQuestions.length} 道题目
                      </h4>
                      <p className="mt-0.5 text-[13px] text-ink-2">共扫描 {importResult.totalParsed} 行记录，已自动纠正并去重。</p>
                      {importResult.errors.length > 0 && (
                        <div className="mt-3">
                          <div className="text-[12.5px] font-medium text-warning-ink">以下行未通过校验，已安全跳过：</div>
                          <ul className="mt-1.5 max-h-32 space-y-0.5 overflow-y-auto text-[12.5px] text-ink-2">
                            {importResult.errors.slice(0, 5).map((e, i) => (
                              <li key={i}>· {e.reason}</li>
                            ))}
                            {importResult.errors.length > 5 && <li>· 其余 {importResult.errors.length - 5} 处错误已省略</li>}
                          </ul>
                        </div>
                      )}
                    </>
                  )
                )}
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="关闭"
                onClick={() => {
                  setImportResult(null);
                  setUploadError(null);
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <Segmented
            value={selectedUnit}
            onChange={setSelectedUnit}
            ariaLabel="单元"
            options={[
              { value: 'all' as const, label: '全部', count: questions.length },
              ...units.map((u) => ({ value: u, label: `Unit ${u}`, count: questions.filter((q) => q.unit === u).length })),
            ]}
          />
        </div>
        <label className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索单词、释义或例句"
            className="field !py-2 pl-9"
          />
        </label>
      </div>

      {filteredQuestions.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<FileText />}
            title={selectedUnit !== 'all' && !searchQuery ? `Unit ${selectedUnit} 暂无词汇` : '没有匹配的题目'}
            description={
              selectedUnit !== 'all' && !searchQuery
                ? '可以导入题库文件，或手动为这个单元添加题目。'
                : '换个关键词试试，或上传题库文件。'
            }
            action={
              <>
                <Button variant="primary" size="sm" onClick={openAddModal} leading={<Plus />}>
                  添加题目
                </Button>
                <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()} leading={<Upload />}>
                  导入文件
                </Button>
              </>
            }
          />
        </div>
      ) : (
        <div className="card overflow-hidden">
          {/* Desktop table */}
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-line text-[12px] font-medium text-ink-3">
                  <th className="py-3 pl-6 pr-3 font-medium">单词</th>
                  <th className="px-3 py-3 font-medium">例句</th>
                  <th className="px-3 py-3 font-medium">答案</th>
                  <th className="px-3 py-3 font-medium">考点</th>
                  <th className="px-3 py-3 font-medium">正确率</th>
                  <th className="py-3 pl-3 pr-6" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filteredQuestions.map((q) => (
                  <tr key={q.id} className="group transition-colors hover:bg-sunken/40">
                    <td className="py-3.5 pl-6 pr-3 align-top">
                      <div className="font-serif text-[16.5px] font-medium text-ink">{q.word}</div>
                      <div className="mt-0.5 text-[11.5px] text-ink-3">
                        U{q.unit} · {q.partOfSpeech}
                        {q.isCustom && <span className="ml-1.5 text-accent">自定义</span>}
                      </div>
                    </td>
                    <td className="max-w-md px-3 py-3.5 align-top">
                      <div className="line-clamp-2 font-serif text-[14.5px] leading-relaxed text-ink-2">
                        {q.sentence.split('_____')[0]}
                        <span className="text-ink underline decoration-line-strong underline-offset-4">{q.correctAnswer}</span>
                        {q.sentence.split('_____').slice(1).join('_____')}
                      </div>
                      <div className="mt-0.5 text-[12px] text-ink-3">{q.chineseHint}</div>
                    </td>
                    <td className="px-3 py-3.5 align-top">
                      <div className="font-serif text-[15px] italic text-success">{q.correctAnswer}</div>
                      {q.acceptedAnswers.length > 1 && (
                        <div className="text-[11.5px] text-ink-3">
                          另: {q.acceptedAnswers.filter((a) => a !== q.correctAnswer).join(', ')}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3.5 align-top text-[13px] text-ink-2">{q.grammarNote || '语境填空'}</td>
                    <td className="whitespace-nowrap px-3 py-3.5 align-top">{accuracyCell(q)}</td>
                    <td className="whitespace-nowrap py-3 pl-3 pr-6 text-right align-top">
                      <div className="flex justify-end gap-0.5 opacity-60 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                        <Button size="icon-sm" variant="ghost" onClick={() => openEditModal(q)} aria-label="编辑">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon-sm" variant="ghost" onClick={() => setPendingDelete(q)} aria-label="删除" className="hover:!text-danger">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile / tablet list */}
          <ul className="divide-y divide-line lg:hidden">
            {filteredQuestions.map((q) => (
              <li key={q.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="font-serif text-[17px] font-medium text-ink">{q.word}</span>
                      <span className="text-[12px] text-ink-3">U{q.unit} · {q.chineseHint}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 font-serif text-[14.5px] leading-relaxed text-ink-2">
                      {q.sentence.replace('_____', q.correctAnswer)}
                    </p>
                    <div className="mt-2">{accuracyCell(q)}</div>
                  </div>
                  <div className="flex shrink-0 gap-0.5">
                    <Button size="icon-sm" variant="ghost" onClick={() => openEditModal(q)} aria-label="编辑">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon-sm" variant="ghost" onClick={() => setPendingDelete(q)} aria-label="删除">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Add / Edit */}
      <Modal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        size="lg"
        title={editingQuestion ? '编辑题目' : '新增题目'}
        description="例句中需要恰好一个填空占位符 _____，并填写符合句中时态的标准答案。"
      >
        <form onSubmit={handleSaveQuestion} className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className={fieldLabel}>单元</label>
              <select value={formUnit} onChange={(e) => setFormUnit(Number(e.target.value))} className="field">
                {unitOptions.map((u) => (
                  <option key={u} value={u}>
                    Unit {u}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={fieldLabel}>词性</label>
              <select value={formPOS} onChange={(e) => setFormPOS(e.target.value as any)} className="field">
                <option value="verb">动词 verb</option>
                <option value="noun">名词 noun</option>
                <option value="adjective">形容词 adj</option>
                <option value="adverb">副词 adv</option>
                <option value="phrase">短语 phrase</option>
                <option value="other">其他</option>
              </select>
            </div>
            <div>
              <label className={fieldLabel}>原形</label>
              <input required value={formWord} onChange={(e) => setFormWord(e.target.value)} placeholder="achieve" className="field font-serif" />
            </div>
            <div>
              <label className={fieldLabel}>中文提示</label>
              <input required value={formHint} onChange={(e) => setFormHint(e.target.value)} placeholder="实现" className="field" />
            </div>
          </div>

          <div>
            <label className={fieldLabel}>英文例句</label>
            <textarea
              required
              rows={2}
              value={formSentence}
              onChange={(e) => setFormSentence(e.target.value)}
              placeholder="She finally _____ her dream of becoming a doctor."
              className="field font-serif text-[15px]"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={fieldLabel}>正确答案</label>
              <input required value={formCorrect} onChange={(e) => setFormCorrect(e.target.value)} placeholder="achieved" className="field font-serif" />
            </div>
            <div>
              <label className={fieldLabel}>其他可接受答案（逗号分隔）</label>
              <input value={formAccepted} onChange={(e) => setFormAccepted(e.target.value)} placeholder="achieved, fulfilled" className="field font-serif" />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className={fieldLabel}>语法考点</label>
              <input value={formGrammarNote} onChange={(e) => setFormGrammarNote(e.target.value)} placeholder="一般过去时" className="field" />
            </div>
            <div>
              <label className={fieldLabel}>音标</label>
              <input value={formPhonetic} onChange={(e) => setFormPhonetic(e.target.value)} placeholder="/əˈtʃiːv/" className="field" />
            </div>
            <div>
              <label className={fieldLabel}>搭配</label>
              <input value={formCollocation} onChange={(e) => setFormCollocation(e.target.value)} placeholder="achieve one's dream" className="field font-serif" />
            </div>
          </div>

          <div>
            <label className={fieldLabel}>解析</label>
            <textarea
              rows={2}
              value={formExplanation}
              onChange={(e) => setFormExplanation(e.target.value)}
              placeholder="句子描述过去发生的动作，因此使用过去式 achieved。"
              className="field"
            />
          </div>

          <div>
            <label className={fieldLabel}>难度</label>
            <Segmented
              value={formDifficulty}
              onChange={setFormDifficulty}
              ariaLabel="难度"
              options={[
                { value: 'easy', label: '简单' },
                { value: 'medium', label: '中等' },
                { value: 'hard', label: '困难' },
              ]}
            />
          </div>

          <AnimatePresence>
            {formError && (
              <motion.p
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: [0, -4, 3, 0] }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2 rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger"
                role="alert"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                {formError}
              </motion.p>
            )}
          </AnimatePresence>

          <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => setShowAddModal(false)}>
              取消
            </Button>
            <Button type="submit" variant="primary">
              保存题目
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!pendingDelete}
        title="删除这道题目？"
        description={pendingDelete ? `「${pendingDelete.word}」将从题库中移除，相关学习记录会保留。` : ''}
        confirmLabel="删除"
        tone="danger"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) handleDeleteQuestion(pendingDelete.id);
          setPendingDelete(null);
        }}
      />

      <ConfirmDialog
        open={confirmReset}
        title="恢复默认题库？"
        description="自行新增或导入的题目将被移除，学习记录不受影响。"
        confirmLabel="恢复默认"
        tone="danger"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          setConfirmReset(false);
          onResetToDefault();
        }}
      />
    </div>
  );
};
