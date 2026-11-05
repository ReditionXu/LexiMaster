import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, CheckCircle2, Eye, EyeOff, KeyRound, Loader2, PlugZap, ServerCog, ShieldCheck, Trash2, XCircle } from 'lucide-react';
import {
  AIProvider,
  PROVIDER_META,
  connectionSignature,
  deleteConfiguration,
  getApiKey,
  isConfigured,
  setApiKey,
  updateSettings,
  useAISettings,
} from '../../ai/settings';
import { aiRequest, AIError, checkProxy, extractJSON, FRIENDLY } from '../../ai/client';
import { Button } from '../ui/Button';
import { Segmented } from '../ui/Segmented';
import { ConfirmDialog } from '../ui/Modal';
import { PageHeader } from '../ui/Common';
import { riseIn, spring, staggerContainer } from '../../lib/motion';

const PROVIDERS: AIProvider[] = ['openai', 'anthropic', 'gemini', 'openai-compatible'];

export const AISettingsPage: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const { settings, hasKey, usage } = useAISettings();
  const [keyDraft, setKeyDraft] = useState(getApiKey());
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [proxy, setProxy] = useState<{ ok: boolean; serverManaged: { provider: string; model: string } | null } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    checkProxy().then(setProxy);
  }, []);

  const signature = connectionSignature(settings);
  const lastTest = settings.lastTest && settings.lastTest.signature === signature ? settings.lastTest : undefined;
  const configured = isConfigured(settings);
  const status: { tone: 'ok' | 'fail' | 'idle' | 'off'; label: string } = !configured
    ? { tone: 'off', label: '未配置' }
    : !lastTest
    ? { tone: 'idle', label: '尚未测试' }
    : lastTest.ok
    ? { tone: 'ok', label: '已连接' }
    : { tone: 'fail', label: '连接失败' };

  const commitKey = (v: string) => {
    setKeyDraft(v);
    setApiKey(v);
  };

  const runTest = async () => {
    setTesting(true);
    const sig = connectionSignature();
    try {
      const res = await aiRequest('test', {}, {});
      let ok = false;
      try {
        ok = (extractJSON(res.content) as any)?.ok === true;
      } catch {
        ok = /ok/i.test(res.content);
      }
      updateSettings({
        lastTest: {
          ok,
          at: Date.now(),
          signature: sig,
          latencyMs: res.latencyMs,
          message: ok ? `连接成功 · ${res.model ?? settings.model} · ${res.latencyMs ?? '?'} ms` : '模型有响应，但未按要求返回 JSON，出题质量可能不稳定。',
        },
      });
    } catch (e) {
      const err = e as AIError;
      updateSettings({ lastTest: { ok: false, at: Date.now(), signature: sig, message: err.message || FRIENDLY[err.code] || '连接失败' } });
    } finally {
      setTesting(false);
    }
  };

  const meta = PROVIDER_META[settings.provider];
  const canTest = configured && !testing && proxy?.ok !== false;

  return (
    <motion.div variants={staggerContainer(0.05)} initial="initial" animate="animate" className="mx-auto max-w-[760px] space-y-10">
      <motion.div variants={riseIn}>
        <PageHeader
          eyebrow="AI settings"
          title="AI 设置"
          description="连接你自己的模型，用于实时出题、答案讲解和学习分析。不连接 AI 也不影响任何普通练习。"
          actions={<StatusPill tone={status.tone} label={status.label} />}
        />
      </motion.div>

      {proxy && !proxy.ok && (
        <motion.div variants={riseIn} className="flex gap-3 rounded-xl border border-warning/30 bg-warning-soft/60 p-4 text-[13.5px] text-ink-2" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-ink" />
          <div>
            <div className="font-medium text-ink">未检测到 AI 代理服务</div>
            <code className="rounded bg-sunken px-1">/api/health</code> 没有返回代理响应，AI 请求无法转发。Vercel 部署请确认项目根目录包含 <code className="rounded bg-sunken px-1">api/</code> 与 <code className="rounded bg-sunken px-1">vercel.json</code> 并重新部署；本地请使用 <code className="rounded bg-sunken px-1">npm run dev</code> 或 <code className="rounded bg-sunken px-1">npm start</code>。GitHub Pages 等纯静态托管不支持 AI。
          </div>
        </motion.div>
      )}

      {/* Enable */}
      <motion.section variants={riseIn} className="card divide-y divide-line">
        <Toggle
          label="启用 AI 功能"
          hint="关闭后不会发出任何 AI 请求"
          on={settings.enabled}
          onChange={(v) => updateSettings({ enabled: v })}
        />
      </motion.section>

      {/* Provider */}
      <motion.section variants={riseIn}>
        <h2 className="mb-3 text-[14px] font-semibold text-ink">服务商</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="AI 服务商">
          {PROVIDERS.map((p) => {
            const on = settings.provider === p;
            return (
              <button
                key={p}
                role="radio"
                aria-checked={on}
                onClick={() => updateSettings({ provider: p, model: on ? settings.model : '' })}
                className={`rounded-lg border px-3 py-3 text-left text-[13.5px] font-medium transition-[border-color,box-shadow] ${
                  on ? 'border-accent/60 bg-surface text-ink shadow-[0_0_0_3px_rgb(var(--accent)/0.12)]' : 'border-line bg-surface text-ink-2 hover:border-line-strong'
                }`}
              >
                {PROVIDER_META[p].name}
              </button>
            );
          })}
        </div>
      </motion.section>

      {/* Credentials */}
      <motion.section variants={riseIn} className="space-y-5">
        <h2 className="text-[14px] font-semibold text-ink">连接信息</h2>

        {proxy?.serverManaged && (
          <div>
            <Segmented
              value={settings.useServerKey ? 'server' : 'byok'}
              onChange={(v) => updateSettings({ useServerKey: v === 'server' })}
              ariaLabel="密钥来源"
              options={[
                { value: 'byok', label: '使用我的 API Key' },
                { value: 'server', label: '使用服务端托管密钥' },
              ]}
            />
            {settings.useServerKey && (
              <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-ink-3">
                <ServerCog className="h-3.5 w-3.5" />
                服务端已配置 {PROVIDER_META[proxy.serverManaged.provider as AIProvider]?.name ?? proxy.serverManaged.provider}
                {proxy.serverManaged.model ? ` · ${proxy.serverManaged.model}` : ''}，密钥不会发送到浏览器。
              </p>
            )}
          </div>
        )}

        {!settings.useServerKey && (
          <label className="block">
            <span className="mb-1.5 flex items-center justify-between text-[12.5px] font-medium text-ink-2">
              <span>API Key{settings.provider === 'openai-compatible' && '（可选）'}</span>
              {meta.docs && (
                <a href={meta.docs} target="_blank" rel="noreferrer noopener" className="font-normal text-ink-3 underline decoration-line-strong underline-offset-4 hover:text-ink">
                  获取 Key
                </a>
              )}
            </span>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
              <input
                type={showKey ? 'text' : 'password'}
                value={keyDraft}
                onChange={(e) => commitKey(e.target.value)}
                placeholder={meta.keyHint}
                autoComplete="off"
                spellCheck={false}
                className="field pl-9 pr-10 font-mono text-[13px]"
                aria-label="API Key"
              />
              <button
                type="button"
                onClick={() => setShowKey((s) => !s)}
                className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-ink-3 hover:text-ink"
                aria-label={showKey ? '隐藏 Key' : '显示 Key'}
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-ink-3">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5" />
                {settings.rememberKeyForTab ? '保存在本标签页的会话中，关闭标签页即清除。' : '只保存在内存中，刷新页面后需要重新输入。'}
              </span>
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.rememberKeyForTab}
                  onChange={(e) => updateSettings({ rememberKeyForTab: e.target.checked })}
                  className="h-4 w-4 accent-[rgb(var(--accent))]"
                />
                在本标签页中记住
              </label>
            </div>
          </label>
        )}

        <label className="block">
          <span className="mb-1.5 block text-[12.5px] font-medium text-ink-2">模型名称 / Model ID{settings.useServerKey && '（留空使用服务端默认）'}</span>
          <input
            value={settings.model}
            onChange={(e) => updateSettings({ model: e.target.value })}
            placeholder={meta.modelExamples[0]}
            spellCheck={false}
            autoComplete="off"
            className="field font-mono text-[13px]"
            aria-label="模型名称"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="text-[12px] text-ink-3">示例：</span>
            {meta.modelExamples.map((m) => (
              <button key={m} type="button" onClick={() => updateSettings({ model: m })} className="rounded-md border border-line px-1.5 py-0.5 font-mono text-[11.5px] text-ink-2 hover:border-line-strong hover:text-ink">
                {m}
              </button>
            ))}
            <span className="text-[12px] text-ink-3">（以服务商控制台中你账号可用的模型为准）</span>
          </div>
        </label>

        <AnimatePresence initial={false}>
          {settings.provider === 'openai-compatible' && (
            <motion.label initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="block overflow-hidden">
              <span className="mb-1.5 block text-[12.5px] font-medium text-ink-2">API Base URL</span>
              <input
                value={settings.baseUrl}
                onChange={(e) => updateSettings({ baseUrl: e.target.value })}
                placeholder="https://api.example.com/v1"
                spellCheck={false}
                autoComplete="off"
                className="field font-mono text-[13px]"
                aria-label="API Base URL"
              />
              <p className="mt-2 text-[12.5px] text-ink-3">
                仅支持公网 https 地址。出于安全考虑，代理会拒绝本机、内网、链路本地与云元数据地址，并且不跟随重定向。
              </p>
            </motion.label>
          )}
        </AnimatePresence>

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={runTest} disabled={!canTest} leading={testing ? <Loader2 className="animate-spin" /> : <PlugZap />}>
            {testing ? '测试中…' : '测试连接'}
          </Button>
          <AnimatePresence mode="wait">
            {lastTest && (
              <motion.span
                key={lastTest.at}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className={`inline-flex items-center gap-1.5 text-[13px] ${lastTest.ok ? 'text-success' : 'text-danger'}`}
                role="status"
              >
                {lastTest.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                {lastTest.message}
              </motion.span>
            )}
            {!lastTest && !configured && (
              <span className="text-[13px] text-ink-3">
                {settings.provider === 'openai-compatible' ? '请填写 Base URL 和模型名称。' : !hasKey && !settings.useServerKey ? '请填写 API Key 和模型名称。' : '请填写模型名称。'}
              </span>
            )}
          </AnimatePresence>
        </div>
      </motion.section>

      {/* Features & cost */}
      <motion.section variants={riseIn} className="space-y-3">
        <h2 className="text-[14px] font-semibold text-ink">功能与用量</h2>
        <div className="card divide-y divide-line">
          <Toggle label="AI 智能出题" hint="在「练习」中选择 AI 智能出题" on={settings.features.generate} onChange={(v) => updateSettings({ features: { ...settings.features, generate: v } })} />
          <Toggle label="AI 答案解析" hint="确定性评分之后，由 AI 讲解错因" on={settings.features.explain} onChange={(v) => updateSettings({ features: { ...settings.features, explain: v } })} />
          <Toggle label="AI 学习分析" hint="在「掌握度」页面手动生成学习报告" on={settings.features.report} onChange={(v) => updateSettings({ features: { ...settings.features, report: v } })} />
          <Row label="解析触发方式" hint="自动请求会消耗额度">
            <Segmented
              value={settings.explainMode}
              onChange={(v) => updateSettings({ explainMode: v })}
              ariaLabel="解析触发方式"
              options={[
                { value: 'wrong-only', label: '答错自动' },
                { value: 'manual', label: '手动' },
                { value: 'always', label: '每题' },
              ]}
            />
          </Row>
          <Row label="每日请求上限" hint={`今天已使用 ${usage.count} 次`}>
            <Segmented
              value={settings.dailyLimit}
              onChange={(v) => updateSettings({ dailyLimit: v })}
              ariaLabel="每日请求上限"
              options={[50, 150, 300, 600].map((n) => ({ value: n, label: `${n}` }))}
            />
          </Row>
          <Row label="每次生成题数" hint="越小等待越短，请求次数越多">
            <Segmented value={settings.batchSize} onChange={(v) => updateSettings({ batchSize: v })} ariaLabel="每次生成题数" options={[2, 3, 5].map((n) => ({ value: n, label: `${n}` }))} />
          </Row>
        </div>
      </motion.section>

      {/* Security & delete */}
      <motion.section variants={riseIn} className="space-y-4">
        <div className="rounded-xl border border-line bg-surface p-5 text-[13px] leading-relaxed text-ink-2">
          <div className="mb-2 flex items-center gap-2 font-medium text-ink">
            <ShieldCheck className="h-4 w-4 text-success" />
            你的密钥如何被处理
          </div>
          <ul className="space-y-1.5">
            <li>· 请求只发送到本应用的同源代理 <code className="rounded bg-sunken px-1">/api/ai</code>，由代理转发给服务商；Key 不会写入项目代码或环境变量文件，代理也不会记录或保存它。</li>
            <li>· 默认不持久化：刷新即清除。勾选「在本标签页中记住」时仅保存在 sessionStorage。</li>
            <li>· 提示词由代理按固定任务构建，浏览器无法发送任意内容，代理不会成为开放转发服务。</li>
            <li>· 学习分析只发送程序统计出的汇总数据，不发送完整历史记录。</li>
          </ul>
        </div>
        <Button variant="ghost" leading={<Trash2 />} className="hover:!text-danger" onClick={() => setConfirmDelete(true)}>
          删除 AI 配置
        </Button>
        {onBack && (
          <Button variant="ghost" onClick={onBack}>
            返回
          </Button>
        )}
      </motion.section>

      <ConfirmDialog
        open={confirmDelete}
        title="删除 AI 配置？"
        description="将清除 API Key、服务商、模型和所有 AI 偏好设置，并关闭 AI 功能。学习记录不受影响。"
        confirmLabel="删除"
        tone="danger"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          deleteConfiguration();
          setKeyDraft('');
          setConfirmDelete(false);
        }}
      />
    </motion.div>
  );
};

export const StatusPill: React.FC<{ tone: 'ok' | 'fail' | 'idle' | 'off'; label: string }> = ({ tone, label }) => (
  <span
    className={`inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-medium ${
      tone === 'ok' ? 'bg-success-soft text-success' : tone === 'fail' ? 'bg-danger-soft text-danger' : tone === 'idle' ? 'bg-warning-soft text-warning-ink' : 'bg-sunken text-ink-3'
    }`}
  >
    <span className={`h-1.5 w-1.5 rounded-full ${tone === 'ok' ? 'bg-success' : tone === 'fail' ? 'bg-danger' : tone === 'idle' ? 'bg-warning' : 'bg-ink-3'}`} />
    {label}
  </span>
);

const Toggle: React.FC<{ label: string; hint?: string; on: boolean; onChange: (v: boolean) => void }> = ({ label, hint, on, onChange }) => (
  <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left">
    <span>
      <span className="block text-[14px] font-medium text-ink">{label}</span>
      {hint && <span className="mt-0.5 block text-[12.5px] text-ink-3">{hint}</span>}
    </span>
    <span className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors ${on ? 'bg-accent' : 'bg-line-strong'}`}>
      <motion.span layout transition={spring.snappy} className={`h-5 w-5 rounded-full bg-white shadow-sm ${on ? 'ml-[18px]' : 'ml-[2px]'}`} />
    </span>
  </button>
);

const Row: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
    <span>
      <span className="block text-[14px] font-medium text-ink">{label}</span>
      {hint && <span className="mt-0.5 block text-[12.5px] text-ink-3">{hint}</span>}
    </span>
    {children}
  </div>
);
