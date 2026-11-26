import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  PauseCircle,
  Radio,
  RefreshCw,
  Sparkles,
  WifiOff,
  X,
} from 'lucide-react';
import type {
  ConcreteLanguageCode,
  SessionStatus,
  SourceLanguageCode,
} from '../../types/domain';
import {
  LANGUAGE_REGISTRY,
  ORDERED_SOURCE_LANGUAGES,
} from '../../core/languages/languageRegistry';
import type { ToastMessage } from '../../context/LinguaFlowContext';

/**
 * 10-State Semantic Status Indicator (Section 9.3):
 * Each state has distinct label, color, and micro-icon — never a generic loading spinner.
 */
const STATUS_CONFIG: Record<
  SessionStatus,
  {
    label: string;
    dotClass: string;
    pillClass: string;
    icon: React.ReactNode;
  }
> = {
  idle: {
    label: 'Chờ bắt đầu',
    dotClass: 'bg-slate-400',
    pillClass: 'bg-slate-500/10 text-[var(--text-secondary)] border-[var(--border-subtle)]',
    icon: <span className="w-2 h-2 rounded-full bg-slate-400" />,
  },
  connecting: {
    label: 'Đang kết nối',
    dotClass: 'bg-blue-500 animate-pulse',
    pillClass: 'bg-blue-500/12 text-blue-600 dark:text-blue-400 border-blue-500/25',
    icon: <RefreshCw className="w-3.5 h-3.5 animate-spin" />,
  },
  listening: {
    label: 'Đang nghe âm thanh',
    dotClass: 'bg-emerald-500 animate-ping',
    pillClass: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
    icon: <Radio className="w-3.5 h-3.5" />,
  },
  recognizing: {
    label: 'Đang nhận diện giọng nói',
    dotClass: 'bg-teal-500',
    pillClass: 'bg-teal-500/14 text-teal-700 dark:text-teal-300 border-teal-500/30',
    icon: <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />,
  },
  translating: {
    label: 'Đang dịch',
    dotClass: 'bg-indigo-500',
    pillClass: 'bg-indigo-500/14 text-indigo-700 dark:text-indigo-300 border-indigo-500/30',
    icon: <Sparkles className="w-3.5 h-3.5 animate-pulse" />,
  },
  syncing: {
    label: 'Đang đồng bộ phụ đề',
    dotClass: 'bg-cyan-500',
    pillClass: 'bg-cyan-500/14 text-cyan-700 dark:text-cyan-300 border-cyan-500/30',
    icon: <RefreshCw className="w-3.5 h-3.5" />,
  },
  paused: {
    label: 'Đã tạm dừng',
    dotClass: 'bg-amber-500',
    pillClass: 'bg-amber-500/14 text-amber-700 dark:text-amber-300 border-amber-500/30',
    icon: <PauseCircle className="w-3.5 h-3.5" />,
  },
  source_lost: {
    label: 'Mất nguồn âm thanh',
    dotClass: 'bg-red-500',
    pillClass: 'bg-red-500/14 text-red-700 dark:text-red-300 border-red-500/30',
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
  },
  offline: {
    label: 'Mất kết nối mạng',
    dotClass: 'bg-red-500',
    pillClass: 'bg-red-500/14 text-red-700 dark:text-red-300 border-red-500/30',
    icon: <WifiOff className="w-3.5 h-3.5" />,
  },
  completed: {
    label: 'Hoàn thành phiên',
    dotClass: 'bg-emerald-600',
    pillClass: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border-emerald-500/25',
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
  },
};

export const SessionStatusBadge: React.FC<{
  status: SessionStatus;
  latencyMs?: number;
  compact?: boolean;
}> = ({ status, latencyMs, compact = false }) => {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.idle;
  return (
    <div
      role="status"
      aria-live="polite"
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${cfg.pillClass}`}
    >
      {cfg.icon}
      <span>{compact && status === 'recognizing' ? 'Đang nhận diện' : cfg.label}</span>
      {typeof latencyMs === 'number' && latencyMs > 0 && status !== 'idle' && status !== 'paused' && (
        <span className="opacity-75 font-mono text-[11px] pl-1 border-l border-current/20">
          {latencyMs < 1000 ? `${latencyMs}ms` : `${(latencyMs / 1000).toFixed(1)}s`}
        </span>
      )}
    </div>
  );
};

/**
 * Real-Data Waveform Meter (Section 21.2):
 * Driven purely by actual audio RMS / frequency band array; flat when inactive or paused.
 */
export const LiveWaveformMeter: React.FC<{
  bands: number[];
  active: boolean;
  className?: string;
}> = ({ bands, active, className = '' }) => {
  const safeBands = bands.length > 0 ? bands : new Array(12).fill(0);
  return (
    <div
      aria-label={active ? 'Biểu đồ cường độ âm thanh đang thu' : 'Microphone đang nghỉ'}
      className={`inline-flex items-center gap-[3px] h-5 px-1.5 ${className}`}
    >
      {safeBands.slice(0, 10).map((val, idx) => {
        const heightPct = active ? Math.max(18, Math.min(100, Math.round(val * 100))) : 18;
        return (
          <span
            key={idx}
            style={{ height: `${heightPct}%` }}
            className={`w-[3px] rounded-full transition-[height] duration-75 ${
              active && val > 0.04
                ? 'bg-[var(--accent-flow)]'
                : 'bg-[var(--text-muted)]/35'
            }`}
          />
        );
      })}
    </div>
  );
};

/**
 * Accessible Language Selector Pills (KR / JP / ZH-CN / ZH-TW / Auto -> VI)
 */
export const LanguageSelectorPills: React.FC<{
  value: SourceLanguageCode;
  detectedLanguage?: ConcreteLanguageCode;
  onChange: (code: SourceLanguageCode) => void;
  compact?: boolean;
}> = ({ value, detectedLanguage, onChange, compact = false }) => {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Chọn ngôn ngữ nguồn">
      {ORDERED_SOURCE_LANGUAGES.map((code) => {
        const def = LANGUAGE_REGISTRY[code];
        const selected = value === code;
        return (
          <button
            key={code}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(code)}
            className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-all cursor-pointer ${
              selected
                ? 'bg-[var(--accent-primary)] text-white shadow-xs'
                : 'lf-elevated text-[var(--text-primary)] hover:border-[var(--border-strong)]'
            }`}
          >
            <span
              className={`w-5 h-5 rounded-md text-[11px] font-bold inline-flex items-center justify-center ${
                selected
                  ? 'bg-white/20 text-white'
                  : 'bg-[var(--bg-surface)] text-[var(--accent-primary)]'
              }`}
            >
              {def.scriptBadge}
            </span>
            <span>{compact ? def.shortLabelVi : def.nameVi}</span>
            {code === 'auto' && selected && detectedLanguage && (
              <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded-md">
                {LANGUAGE_REGISTRY[detectedLanguage].shortLabelVi}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

export const SwitchToggle: React.FC<{
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}> = ({ checked, onChange, label, description, disabled = false }) => {
  return (
    <label
      className={`flex items-center justify-between gap-3 py-2.5 ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      }`}
    >
      <div className="min-w-0">
        <div className="text-sm font-medium text-[var(--text-primary)]">{label}</div>
        {description && (
          <div className="text-xs text-[var(--text-secondary)] mt-0.5">{description}</div>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
          checked ? 'bg-[var(--accent-primary)]' : 'bg-slate-300 dark:bg-slate-700'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </label>
  );
};

export const PrecisionSlider: React.FC<{
  label: string;
  valueLabel: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (val: number) => void;
}> = ({ label, valueLabel, min, max, step = 1, value, onChange }) => {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-[var(--text-primary)]">{label}</span>
        <span className="font-mono font-semibold text-[var(--accent-primary)]">{valueLabel}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-2 rounded-lg accent-[var(--accent-primary)] bg-[var(--bg-elevated)] cursor-pointer"
      />
    </div>
  );
};

export const BottomSheet: React.FC<{
  open: boolean;
  onClose: () => void;
  title: string;
  preventBackdropClose?: boolean;
  children: React.ReactNode;
}> = ({ open, onClose, title, preventBackdropClose = false, children }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4">
      <div
        className="fixed inset-0 bg-black/45 backdrop-blur-[2px]"
        onClick={() => {
          if (!preventBackdropClose) onClose();
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-10 w-full max-w-lg max-h-[86vh] flex flex-col rounded-t-3xl sm:rounded-3xl lf-surface shadow-2xl overflow-hidden pb-safe"
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2">
            <span className="w-8 h-1 rounded-full bg-[var(--border-strong)] sm:hidden mr-1" />
            <h3 className="text-base font-bold text-[var(--text-primary)]">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng bảng"
            className="w-9 h-9 rounded-full lf-elevated inline-flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4 space-y-4">{children}</div>
      </div>
    </div>
  );
};

export const ConfirmDialog: React.FC<{
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ open, title, description, confirmLabel, danger = true, onConfirm, onCancel }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onCancel} />
      <div
        role="alertdialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-sm rounded-3xl lf-surface p-5 space-y-4 shadow-2xl"
      >
        <h3 className="text-base font-bold text-[var(--text-primary)]">{title}</h3>
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{description}</p>
        <div className="flex items-center justify-end gap-2.5 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[44px] px-4 rounded-xl lf-elevated text-sm font-semibold text-[var(--text-primary)] cursor-pointer"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onCancel();
            }}
            className={`min-h-[44px] px-4 rounded-xl text-sm font-semibold text-white cursor-pointer ${
              danger ? 'bg-red-600 hover:bg-red-700' : 'bg-[var(--accent-primary)]'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export const EmptyStateCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}> = ({ icon, title, description, actionLabel, onAction }) => (
  <div className="rounded-3xl lf-surface p-7 text-center flex flex-col items-center justify-center space-y-3">
    <div className="w-12 h-12 rounded-2xl bg-[var(--accent-primary-soft)] text-[var(--accent-primary)] flex items-center justify-center">
      {icon}
    </div>
    <h4 className="text-sm font-bold text-[var(--text-primary)]">{title}</h4>
    <p className="text-xs text-[var(--text-secondary)] max-w-xs leading-relaxed">{description}</p>
    {actionLabel && onAction && (
      <button
        type="button"
        onClick={onAction}
        className="mt-1 min-h-[42px] px-4 rounded-xl bg-[var(--accent-primary)] text-white text-xs font-semibold cursor-pointer"
      >
        {actionLabel}
      </button>
    )}
  </div>
);

export const ErrorRecoveryBanner: React.FC<{
  message: string;
  fallbackLabel?: string;
  onFallback?: () => void;
  onDismiss?: () => void;
}> = ({ message, fallbackLabel, onFallback, onDismiss }) => (
  <div
    role="alert"
    className="rounded-2xl border border-amber-500/35 bg-amber-500/12 px-4 py-3 flex items-start gap-3"
  >
    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
    <div className="flex-1 min-w-0 space-y-2">
      <p className="text-xs font-medium text-[var(--text-primary)] leading-relaxed">{message}</p>
      {fallbackLabel && onFallback && (
        <button
          type="button"
          onClick={onFallback}
          className="min-h-[36px] px-3 py-1.5 rounded-xl bg-[var(--accent-primary)] text-white text-xs font-semibold cursor-pointer"
        >
          {fallbackLabel}
        </button>
      )}
    </div>
    {onDismiss && (
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Đóng thông báo"
        className="text-[var(--text-secondary)] p-1 cursor-pointer"
      >
        <X className="w-4 h-4" />
      </button>
    )}
  </div>
);

export const ToastViewport: React.FC<{ toasts: ToastMessage[] }> = ({ toasts }) => {
  if (toasts.length === 0) return null;
  return (
    <div
      aria-live="polite"
      className="fixed top-3 left-1/2 -translate-x-1/2 z-[70] flex flex-col items-center gap-2 pointer-events-none w-full max-w-sm px-4"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`px-4 py-2.5 rounded-2xl text-xs font-semibold shadow-lg backdrop-blur-md border pointer-events-auto ${
            t.tone === 'success'
              ? 'bg-emerald-950/90 text-emerald-100 border-emerald-500/40'
              : t.tone === 'error'
              ? 'bg-red-950/90 text-red-100 border-red-500/40'
              : t.tone === 'warning'
              ? 'bg-amber-950/90 text-amber-100 border-amber-500/40'
              : 'bg-slate-900/90 text-white border-white/15'
          }`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
};
