import React from 'react';
import {
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  Eye,
  EyeOff,
  Languages,
  Minus,
  Pause,
  Play,
  Plus,
  SlidersHorizontal,
} from 'lucide-react';
import { useLinguaFlow } from '../../context/LinguaFlowContext';
import type { SourceLanguageCode, SubtitleDisplayMode } from '../../types/domain';
import { BottomSheet, LanguageSelectorPills } from '../ui/DesignSystem';

export const QuickSubtitleSheet: React.FC<{
  open: boolean;
  onClose: () => void;
  subtitleHidden: boolean;
  onToggleHidden: () => void;
  sourceLanguage: SourceLanguageCode;
  onChangeSourceLanguage: (lang: SourceLanguageCode) => void;
  isPaused?: boolean;
  onTogglePause?: () => void;
  isDraggingSubtitle?: boolean;
  onOpenFullStudio?: () => void;
}> = ({
  open,
  onClose,
  subtitleHidden,
  onToggleHidden,
  sourceLanguage,
  onChangeSourceLanguage,
  isPaused,
  onTogglePause,
  isDraggingSubtitle = false,
  onOpenFullStudio,
}) => {
  const {
    presets,
    activePreset,
    setActivePresetId,
    updateActivePresetLive,
    haptic,
  } = useLinguaFlow();

  const modes: Array<{ id: SubtitleDisplayMode; label: string }> = [
    { id: 'vi-only', label: 'Chỉ tiếng Việt' },
    { id: 'bilingual', label: 'Song ngữ' },
    { id: 'source-only', label: 'Chỉ bản gốc' },
    { id: 'minimal', label: 'Tối giản' },
  ];

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Chỉnh phụ đề nhanh"
      preventBackdropClose={isDraggingSubtitle}
    >
      {/* Top quick action row: A-, A+, Show/Hide, Pause */}
      <div className="grid grid-cols-4 gap-2">
        <button
          type="button"
          onClick={() => {
            haptic(8);
            updateActivePresetLive({ fontSize: Math.max(13, activePreset.fontSize - 2) });
          }}
          className="min-h-[48px] rounded-2xl lf-elevated flex flex-col items-center justify-center gap-0.5 text-xs font-semibold cursor-pointer active:scale-97"
        >
          <Minus className="w-4 h-4" />
          <span>Cỡ chữ -</span>
        </button>

        <button
          type="button"
          onClick={() => {
            haptic(8);
            updateActivePresetLive({ fontSize: Math.min(42, activePreset.fontSize + 2) });
          }}
          className="min-h-[48px] rounded-2xl lf-elevated flex flex-col items-center justify-center gap-0.5 text-xs font-semibold cursor-pointer active:scale-97"
        >
          <Plus className="w-4 h-4" />
          <span>Cỡ chữ + ({activePreset.fontSize})</span>
        </button>

        <button
          type="button"
          onClick={() => {
            haptic(10);
            onToggleHidden();
          }}
          className={`min-h-[48px] rounded-2xl flex flex-col items-center justify-center gap-0.5 text-xs font-semibold cursor-pointer ${
            subtitleHidden
              ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40'
              : 'lf-elevated text-[var(--text-primary)]'
          }`}
        >
          {subtitleHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          <span>{subtitleHidden ? 'Hiện lại' : 'Ẩn phụ đề'}</span>
        </button>

        {onTogglePause ? (
          <button
            type="button"
            onClick={() => {
              haptic(10);
              onTogglePause();
            }}
            className={`min-h-[48px] rounded-2xl flex flex-col items-center justify-center gap-0.5 text-xs font-semibold cursor-pointer ${
              isPaused
                ? 'bg-[var(--accent-primary)] text-white'
                : 'lf-elevated text-[var(--text-primary)]'
            }`}
          >
            {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            <span>{isPaused ? 'Tiếp tục' : 'Tạm dừng'}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenFullStudio?.();
            }}
            className="min-h-[48px] rounded-2xl lf-elevated flex flex-col items-center justify-center gap-0.5 text-xs font-semibold cursor-pointer"
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>Studio</span>
          </button>
        )}
      </div>

      {/* Display mode */}
      <div className="space-y-1.5">
        <div className="text-xs font-semibold text-[var(--text-secondary)] flex items-center gap-1.5">
          <Languages className="w-3.5 h-3.5" />
          <span>Chế độ hiển thị</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {modes.map((m) => {
            const active = activePreset.subtitleMode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => updateActivePresetLive({ subtitleMode: m.id })}
                className={`min-h-[42px] px-3 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                  active
                    ? 'bg-[var(--accent-primary)] text-white'
                    : 'lf-elevated text-[var(--text-primary)]'
                }`}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Quick vertical position */}
      <div className="space-y-1.5">
        <div className="text-xs font-semibold text-[var(--text-secondary)]">Vị trí nhanh</div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Phía trên', y: 18, icon: <AlignVerticalJustifyStart className="w-4 h-4" /> },
            { label: 'Giữa khung', y: 52, icon: <AlignVerticalJustifyCenter className="w-4 h-4" /> },
            { label: 'Phía dưới', y: 82, icon: <AlignVerticalJustifyEnd className="w-4 h-4" /> },
          ].map((pos) => {
            const selected = Math.abs(activePreset.positionY - pos.y) <= 8;
            return (
              <button
                key={pos.label}
                type="button"
                onClick={() => updateActivePresetLive({ positionY: pos.y, positionX: 50 })}
                className={`min-h-[42px] rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer ${
                  selected
                    ? 'bg-[var(--accent-primary)] text-white'
                    : 'lf-elevated text-[var(--text-primary)]'
                }`}
              >
                {pos.icon}
                <span>{pos.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Preset Picker */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-[var(--text-secondary)]">Mẫu phụ đề</span>
          {onOpenFullStudio && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenFullStudio();
              }}
              className="text-xs font-semibold text-[var(--accent-primary)] cursor-pointer"
            >
              Mở trình chỉnh sửa đầy đủ →
            </button>
          )}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {presets.map((p) => {
            const selected = p.id === activePreset.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setActivePresetId(p.id)}
                className={`shrink-0 min-h-[40px] px-3.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                  selected
                    ? 'bg-[var(--accent-primary)] text-white border-transparent'
                    : 'lf-elevated text-[var(--text-primary)] border-[var(--border-subtle)]'
                }`}
              >
                {p.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Source Language Switch */}
      <div className="space-y-1.5">
        <div className="text-xs font-semibold text-[var(--text-secondary)]">Ngôn ngữ nguồn</div>
        <LanguageSelectorPills
          value={sourceLanguage}
          onChange={onChangeSourceLanguage}
          compact
        />
      </div>
    </BottomSheet>
  );
};
