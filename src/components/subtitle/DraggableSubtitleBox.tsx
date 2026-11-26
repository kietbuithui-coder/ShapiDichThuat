import React, { useRef, useState } from 'react';
import { GripHorizontal, HelpCircle } from 'lucide-react';
import type {
  MorphologicalToken,
  SourceLanguageCode,
  SubtitlePreset,
} from '../../types/domain';
import { computeSubtitleInlineStyles } from '../../core/subtitles/presets';

export interface DraggableSubtitleBoxProps {
  preset: SubtitlePreset;
  sourceText: string;
  translatedText: string;
  speakerLabel?: string;
  isInterim?: boolean;
  isUncertain?: boolean;
  uncertainReason?: string;
  sourceLanguage?: SourceLanguageCode;
  tokens?: MorphologicalToken[];
  hidden?: boolean;
  draggable?: boolean;
  showResizeHandles?: boolean;
  onDragStateChange?: (dragging: boolean) => void;
  onUpdatePosition?: (patch: Partial<Pick<SubtitlePreset, 'positionX' | 'positionY' | 'maxWidth'>>) => void;
  onTapWord?: (term: string, contextSentence: string) => void;
  onTapTextEdit?: () => void;
}

/**
 * Core Subtitle Rendering & Touch Drag/Resize Engine (Sections 5.1, 10, 12, 16.4, 32)
 * - Visually differentiates interim vs confirmed subtitles without layout thrashing.
 * - Supports direct drag-to-reposition with magnetic center & edge snap guides.
 * - Supports finger-friendly width resize handles.
 * - Automatically wraps & expands when fontSize is scaled up to 42px so text never clips!
 */
export const DraggableSubtitleBox: React.FC<DraggableSubtitleBoxProps> = ({
  preset,
  sourceText,
  translatedText,
  speakerLabel,
  isInterim = false,
  isUncertain = false,
  uncertainReason,
  tokens,
  hidden = false,
  draggable = true,
  showResizeHandles = false,
  onDragStateChange,
  onUpdatePosition,
  onTapWord,
  onTapTextEdit,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [snapGuideX, setSnapGuideX] = useState(false);
  const [showOriginalOnUncertain, setShowOriginalOnUncertain] = useState(false);

  if (hidden) return null;

  const computed = computeSubtitleInlineStyles(preset);

  const handlePointerDownMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggable || !onUpdatePosition) return;
    // Do not hijack clicks on word lookup chips
    if ((e.target as HTMLElement).dataset.wordChip === 'true') return;

    const parent = containerRef.current?.offsetParent as HTMLElement | null;
    if (!parent) return;

    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    onDragStateChange?.(true);

    const parentRect = parent.getBoundingClientRect();
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const startPosX = preset.positionX;
    const startPosY = preset.positionY;

    const onMove = (moveEv: PointerEvent) => {
      const dxPct = ((moveEv.clientX - startClientX) / Math.max(1, parentRect.width)) * 100;
      const dyPct = ((moveEv.clientY - startClientY) / Math.max(1, parentRect.height)) * 100;

      let nextX = Math.max(12, Math.min(88, Math.round((startPosX + dxPct) * 2) / 2));
      const safeMarginPct = Math.max(6, Math.round((preset.safeMargin / Math.max(320, parentRect.height)) * 100));
      const nextY = Math.max(
        safeMarginPct + 4,
        Math.min(94 - safeMarginPct, Math.round((startPosY + dyPct) * 2) / 2)
      );

      // Magnetic snap to horizontal center (50%)
      if (Math.abs(nextX - 50) <= 3) {
        nextX = 50;
        setSnapGuideX(true);
      } else {
        setSnapGuideX(false);
      }

      onUpdatePosition({ positionX: nextX, positionY: nextY });
    };

    const onUp = () => {
      setIsDragging(false);
      setSnapGuideX(false);
      onDragStateChange?.(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const handleResizePointerDown = (
    e: React.PointerEvent<HTMLButtonElement>,
    direction: -1 | 1
  ) => {
    if (!onUpdatePosition) return;
    e.stopPropagation();
    e.preventDefault();
    const parent = containerRef.current?.offsetParent as HTMLElement | null;
    if (!parent) return;

    setIsDragging(true);
    onDragStateChange?.(true);
    const parentRect = parent.getBoundingClientRect();
    const startX = e.clientX;
    const startWidth = preset.maxWidth;

    const onMove = (moveEv: PointerEvent) => {
      const deltaPct =
        (((moveEv.clientX - startX) * direction * 2) / Math.max(1, parentRect.width)) * 100;
      const nextWidth = Math.max(50, Math.min(96, Math.round(startWidth + deltaPct)));
      onUpdatePosition({ maxWidth: nextWidth });
    };

    const onUp = () => {
      setIsDragging(false);
      onDragStateChange?.(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const renderSourceLine = () => {
    if (!sourceText.trim()) return null;
    const srcFontSize = Math.max(12, Math.round(preset.fontSize * preset.bilingualScaleRatio));

    // Interactive word-tap tokens if available
    if (onTapWord && tokens && tokens.length > 0 && !isInterim) {
      return (
        <div
          style={{
            fontSize: `${srcFontSize}px`,
            color: preset.sourceTextColor,
            lineHeight: preset.lineSpacing,
            letterSpacing: `${preset.letterSpacing}em`,
            textShadow: computed.textShadowCss,
          }}
          className="font-medium break-words"
        >
          {tokens.map((tok, i) => (
            <button
              key={`${tok.surface}-${i}`}
              type="button"
              data-word-chip="true"
              onClick={(ev) => {
                ev.stopPropagation();
                onTapWord(tok.surface, sourceText);
              }}
              title="Chạm để tra từ nhanh"
              className="inline rounded px-0.5 hover:bg-white/20 active:bg-white/30 transition-colors cursor-pointer"
            >
              {tok.surface}
              {/^[A-Za-z0-9\uAC00-\uD7AF]+$/.test(tok.surface) ? ' ' : ''}
            </button>
          ))}
        </div>
      );
    }

    return (
      <div
        style={{
          fontSize: `${srcFontSize}px`,
          color: preset.sourceTextColor,
          lineHeight: preset.lineSpacing,
          letterSpacing: `${preset.letterSpacing}em`,
          textShadow: computed.textShadowCss,
        }}
        className="font-medium break-words"
      >
        {sourceText}
      </div>
    );
  };

  const renderViLine = () => {
    const text = translatedText.trim() || (isInterim ? 'Đang nhận diện…' : '');
    if (!text) return null;

    // Auto line-clamp adaptation: when fontSize >= 30px, relax maxLines so large accessibility text never clips!
    const effectiveMaxLines = preset.fontSize >= 30 ? Math.max(preset.maxLines, 4) : preset.maxLines;

    return (
      <div
        onClick={() => onTapTextEdit?.()}
        style={{
          fontSize: `${preset.fontSize}px`,
          fontWeight: preset.fontWeight,
          color: preset.textColor,
          lineHeight: preset.lineSpacing,
          letterSpacing: `${preset.letterSpacing}em`,
          textShadow: computed.textShadowCss,
          WebkitTextStroke: computed.webkitTextStrokeCss,
          display: '-webkit-box',
          WebkitBoxOrient: 'vertical',
          WebkitLineClamp: effectiveMaxLines + 1,
          overflow: 'hidden',
        }}
        className={`break-words transition-opacity duration-150 ${
          isInterim ? 'opacity-80 italic' : 'opacity-100'
        }`}
      >
        {speakerLabel && preset.subtitleMode !== 'minimal' && (
          <span className="inline-block mr-2 px-1.5 py-0.5 rounded text-[0.68em] font-semibold bg-white/18 text-sky-200 align-middle">
            {speakerLabel}
          </span>
        )}
        <span>{text}</span>
        {isInterim && (
          <span
            aria-label="Phụ đề tạm thời đang cập nhật"
            className="inline-block ml-1.5 w-1.5 h-1.5 rounded-full bg-teal-300 align-middle animate-pulse"
          />
        )}
      </div>
    );
  };

  const showBoth =
    preset.subtitleMode === 'bilingual' || (isUncertain && showOriginalOnUncertain);
  const showSourceOnly = preset.subtitleMode === 'source-only';

  return (
    <>
      {/* Magnetic vertical center snap line during drag */}
      {snapGuideX && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-2 left-1/2 -translate-x-1/2 w-[1.5px] bg-teal-400/80 z-20"
        />
      )}

      <div
        ref={containerRef}
        onPointerDown={handlePointerDownMove}
        style={{
          left: `${preset.positionX}%`,
          top: `${preset.positionY}%`,
          transform: 'translate(-50%, -50%)',
          width: `${preset.maxWidth}%`,
          maxWidth: `calc(100% - ${preset.safeMargin * 2}px)`,
          fontFamily: computed.fontFamilyCss,
          textAlign: preset.alignment,
          backgroundColor: computed.backgroundCss,
          backdropFilter:
            preset.backdropBlur > 0 && preset.subtitleMode !== 'minimal'
              ? `blur(${preset.backdropBlur}px)`
              : undefined,
          WebkitBackdropFilter:
            preset.backdropBlur > 0 && preset.subtitleMode !== 'minimal'
              ? `blur(${preset.backdropBlur}px)`
              : undefined,
          borderRadius: `${preset.cornerRadius}px`,
          padding: `${preset.paddingY}px ${preset.paddingX}px`,
        }}
        className={`absolute z-30 select-none touch-none transition-shadow ${
          draggable ? 'cursor-grab active:cursor-grabbing' : ''
        } ${
          isDragging || showResizeHandles
            ? 'ring-2 ring-sky-400/90 shadow-2xl'
            : preset.subtitleMode !== 'minimal'
            ? 'shadow-lg border border-white/10'
            : ''
        }`}
      >
        {/* Top subtle drag handle indicator in editor mode */}
        {showResizeHandles && (
          <div className="flex items-center justify-center -mt-1 mb-1 opacity-75 text-sky-300">
            <GripHorizontal className="w-4 h-4" />
          </div>
        )}

        {/* Subtitle lines */}
        <div className="space-y-1">
          {showSourceOnly ? (
            renderSourceLine()
          ) : showBoth ? (
            preset.bilingualOrder === 'source-top' ? (
              <>
                {renderSourceLine()}
                {renderViLine()}
              </>
            ) : (
              <>
                {renderViLine()}
                {renderSourceLine()}
              </>
            )
          ) : (
            renderViLine()
          )}
        </div>

        {/* Honest Uncertainty Indicator (Section 15.5: Never fabricate or hide low confidence) */}
        {isUncertain && !isInterim && preset.subtitleMode !== 'minimal' && (
          <div className="mt-1.5 flex items-center justify-center gap-1.5">
            <button
              type="button"
              data-word-chip="true"
              onClick={(e) => {
                e.stopPropagation();
                setShowOriginalOnUncertain((v) => !v);
              }}
              title={uncertainReason}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/25 text-amber-200 text-[11px] font-medium cursor-pointer"
            >
              <HelpCircle className="w-3 h-3" />
              <span>
                {showOriginalOnUncertain ? 'Ẩn câu gốc' : 'Chưa chắc chắn · Xem câu gốc'}
              </span>
            </button>
          </div>
        )}

        {/* Large finger-friendly left & right resize handles (Section 10.2) */}
        {showResizeHandles && (
          <>
            <button
              type="button"
              aria-label="Thu phóng chiều rộng phụ đề bên trái"
              onPointerDown={(e) => handleResizePointerDown(e, -1)}
              className="absolute -left-3.5 top-1/2 -translate-y-1/2 w-7 h-11 rounded-full bg-sky-500 text-white shadow-md flex items-center justify-center cursor-ew-resize"
            >
              <span className="w-1 h-4 rounded-full bg-white" />
            </button>
            <button
              type="button"
              aria-label="Thu phóng chiều rộng phụ đề bên phải"
              onPointerDown={(e) => handleResizePointerDown(e, 1)}
              className="absolute -right-3.5 top-1/2 -translate-y-1/2 w-7 h-11 rounded-full bg-sky-500 text-white shadow-md flex items-center justify-center cursor-ew-resize"
            >
              <span className="w-1 h-4 rounded-full bg-white" />
            </button>
          </>
        )}
      </div>
    </>
  );
};
