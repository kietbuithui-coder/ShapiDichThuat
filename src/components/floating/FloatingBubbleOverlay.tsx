import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  ClipboardPaste,
  ExternalLink,
  Languages,
  Mic,
  Minimize2,
  MonitorSpeaker,
  Pause,
  PictureInPicture2,
  Play,
  Square,
  X,
} from 'lucide-react';
import { useLinguaFlow } from '../../context/LinguaFlowContext';
import { LANGUAGE_REGISTRY } from '../../core/languages/languageRegistry';
import { parseWebVideoUrl } from '../../core/media/webVideoParser';
import { subtitlePipManager } from '../../core/pip/subtitlePipManager';
import type { SourceLanguageCode } from '../../types/domain';

export const FloatingBubbleOverlay: React.FC = () => {
  const {
    settings,
    updateSettings,
    activePreset,
    updateActivePresetLive,
    floatingBubbleVisible,
    setFloatingBubbleVisible,
    floatingBubbleExpanded,
    setFloatingBubbleExpanded,
    globalSubtitleFeed,
    liveRunningIndicator,
    openWebVideoLink,
    dispatchLiveQuickCommand,
    openWordLookup,
    showToast,
    haptic,
  } = useLinguaFlow();

  const [pos, setPos] = useState<{ x: number; y: number }>(() => ({
    x: typeof window !== 'undefined' ? Math.max(12, window.innerWidth - 74) : 300,
    y: typeof window !== 'undefined' ? Math.max(90, Math.round(window.innerHeight * 0.62)) : 420,
  }));

  const [quickUrl, setQuickUrl] = useState('');
  const [pipActive, setPipActive] = useState(false);

  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);

  // Keep bubble inside screen when viewport resizes or rotates
  useEffect(() => {
    const handleResize = () => {
      setPos((prev) => ({
        x: Math.max(8, Math.min(window.innerWidth - 68, prev.x)),
        y: Math.max(64, Math.min(window.innerHeight - 135, prev.y)),
      }));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Wire System/Browser Pop-Out PiP Window callbacks and live updates
  useEffect(() => {
    subtitlePipManager.setListeners({
      onStateChange: (active) => setPipActive(active),
      onAction: (action) => {
        if (action === 'toggle-pause') {
          dispatchLiveQuickCommand('toggle-pause');
        } else if (action === 'font-up') {
          updateActivePresetLive({ fontSize: Math.min(34, activePreset.fontSize + 2) });
        } else if (action === 'font-down') {
          updateActivePresetLive({ fontSize: Math.max(13, activePreset.fontSize - 2) });
        }
      },
    });
  }, [activePreset.fontSize, dispatchLiveQuickCommand, updateActivePresetLive]);

  useEffect(() => {
    if (pipActive || subtitlePipManager.isOpen()) {
      subtitlePipManager.update({
        sourceText: globalSubtitleFeed.sourceText,
        translatedText: globalSubtitleFeed.translatedText,
        isPartial: globalSubtitleFeed.isPartial,
        statusLabel: globalSubtitleFeed.statusLabel,
        isRunning: liveRunningIndicator.isRunning,
        preset: activePreset,
      });
    }
  }, [activePreset, globalSubtitleFeed, liveRunningIndicator.isRunning, pipActive]);

  const handleTogglePip = async () => {
    haptic(10);
    if (subtitlePipManager.isOpen()) {
      await subtitlePipManager.close();
      setPipActive(false);
      showToast('Đã đóng cửa sổ phụ đề nổi ngoài tab', 'info');
      return;
    }

    const res = await subtitlePipManager.open({
      sourceText: globalSubtitleFeed.sourceText,
      translatedText: globalSubtitleFeed.translatedText,
      isPartial: globalSubtitleFeed.isPartial,
      statusLabel: globalSubtitleFeed.statusLabel,
      isRunning: liveRunningIndicator.isRunning,
      preset: activePreset,
    });

    if (res.ok) {
      setPipActive(true);
      showToast(
        'Đã tách cửa sổ phụ đề nổi! Bạn có thể chuyển sang tab YouTube/Web khác mà phụ đề vẫn nổi ở trên.',
        'success'
      );
    } else if (res.error) {
      showToast(res.error, 'warning');
    }
  };

  const handleOpenLinkFromBubble = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseWebVideoUrl(quickUrl);
    if (!parsed) {
      showToast('Hãy dán đường dẫn YouTube, Bilibili, Twitch, .m3u8 hoặc trang web hợp lệ', 'warning');
      return;
    }
    haptic(10);
    openWebVideoLink(parsed.normalizedUrl);
    setQuickUrl('');
    setFloatingBubbleExpanded(false);
    showToast(`Đang mở ${parsed.platformLabel} trong Trình phát dịch…`, 'success');
  };

  const handlePasteClipboard = async () => {
    try {
      const txt = await navigator.clipboard.readText();
      if (txt.trim()) {
        setQuickUrl(txt.trim());
        haptic(8);
      }
    } catch {
      showToast('Hãy chạm giữ vào ô nhập để dán đường dẫn', 'info');
    }
  };

  if (!floatingBubbleVisible) return null;

  // Pointer drag handlers for the collapsed bubble
  const onBubblePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: pos.x,
      origY: pos.y,
      moved: false,
    };
  };

  const onBubblePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
      d.moved = true;
    }
    if (d.moved) {
      const nextX = Math.max(8, Math.min(window.innerWidth - 64, d.origX + dx));
      const nextY = Math.max(56, Math.min(window.innerHeight - 130, d.origY + dy));
      setPos({ x: nextX, y: nextY });
    }
  };

  const onBubblePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    dragRef.current = null;

    if (!d.moved) {
      haptic(10);
      setFloatingBubbleExpanded(true);
    } else {
      // Snap gently to nearest left or right screen edge for clean one-hand thumb reach!
      const snapLeft = pos.x < window.innerWidth / 2;
      setPos((prev) => ({
        x: snapLeft ? 10 : Math.max(10, window.innerWidth - 66),
        y: prev.y,
      }));
    }
  };

  const isOnLeftHalf =
    typeof window !== 'undefined' ? pos.x < window.innerWidth / 2 : false;

  return (
    <>
      {/* COLLAPSED DRAGGABLE FLOATING BUBBLE ("Quả bong bóng dịch nổi") */}
      {!floatingBubbleExpanded && (
        <div
          style={{ left: `${pos.x}px`, top: `${pos.y}px` }}
          className="fixed z-50 touch-none select-none flex items-center gap-2"
        >
          {/* Live mini speech callout next to bubble when a subtitle is active */}
          {!isOnLeftHalf && globalSubtitleFeed.translatedText && (
            <button
              type="button"
              onClick={() => setFloatingBubbleExpanded(true)}
              className="max-w-[215px] px-3 py-2 rounded-2xl bg-slate-900/92 text-white border border-white/15 shadow-xl text-left backdrop-blur-md cursor-pointer"
            >
              <p className="text-[11.5px] font-semibold leading-snug line-clamp-2">
                {globalSubtitleFeed.translatedText}
              </p>
            </button>
          )}

          <button
            type="button"
            onPointerDown={onBubblePointerDown}
            onPointerMove={onBubblePointerMove}
            onPointerUp={onBubblePointerUp}
            aria-label="Mở bong bóng dịch nổi"
            title="Bong bóng dịch nổi (Kéo để di chuyển, chạm để mở)"
            className="relative w-14 h-14 rounded-full lf-brand-gradient text-white shadow-xl ring-2 ring-white/80 dark:ring-slate-800 flex flex-col items-center justify-center gap-0.5 cursor-grab active:cursor-grabbing transition-transform active:scale-95"
          >
            {liveRunningIndicator.isRunning && (
              <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-400 ring-2 ring-slate-950 animate-pulse" />
            )}
            <Languages className="w-5 h-5" />
            <span className="text-[8.5px] font-extrabold tracking-tight leading-none">
              DỊCH NỔI
            </span>
          </button>

          {isOnLeftHalf && globalSubtitleFeed.translatedText && (
            <button
              type="button"
              onClick={() => setFloatingBubbleExpanded(true)}
              className="max-w-[215px] px-3 py-2 rounded-2xl bg-slate-900/92 text-white border border-white/15 shadow-xl text-left backdrop-blur-md cursor-pointer"
            >
              <p className="text-[11.5px] font-semibold leading-snug line-clamp-2">
                {globalSubtitleFeed.translatedText}
              </p>
            </button>
          )}
        </div>
      )}

      {/* EXPANDED FLOATING MINI-TRANSLATOR & SUBTITLE WINDOW */}
      {floatingBubbleExpanded && (
        <div className="fixed z-50 inset-x-3 bottom-20 sm:left-auto sm:right-4 sm:w-[380px] rounded-3xl bg-slate-950/95 text-white border border-white/15 shadow-2xl backdrop-blur-xl p-4 space-y-3">
          {/* Bubble Top Header */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                  liveRunningIndicator.isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'
                }`}
              />
              <span className="text-xs font-extrabold tracking-tight truncate">
                Bong bóng dịch nổi · {globalSubtitleFeed.statusLabel}
              </span>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={handleTogglePip}
                title="Tách cửa sổ phụ đề nổi đè lên tab YouTube / Web khác (Picture-in-Picture)"
                className={`h-8 px-2.5 rounded-xl text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer ${
                  pipActive
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-white/12 text-white hover:bg-white/20'
                }`}
              >
                <PictureInPicture2 className="w-3.5 h-3.5" />
                <span>{pipActive ? 'Đang nổi PiP' : 'Nổi lên Tab khác'}</span>
              </button>

              <button
                type="button"
                onClick={() => setFloatingBubbleExpanded(false)}
                aria-label="Thu gọn về bong bóng tròn"
                title="Thu gọn thành bong bóng tròn"
                className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 inline-flex items-center justify-center cursor-pointer"
              >
                <Minimize2 className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setFloatingBubbleExpanded(false);
                  setFloatingBubbleVisible(false);
                  showToast('Đã ẩn bong bóng nổi (bật lại ở góc trên màn hình)', 'info');
                }}
                aria-label="Ẩn bong bóng nổi"
                title="Ẩn bong bóng nổi"
                className="w-8 h-8 rounded-xl bg-white/10 hover:bg-rose-500/30 text-slate-300 hover:text-rose-200 inline-flex items-center justify-center cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Quick Open Link Input inside Floating Bubble */}
          <form onSubmit={handleOpenLinkFromBubble} className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <input
                type="text"
                value={quickUrl}
                onChange={(e) => setQuickUrl(e.target.value)}
                placeholder="Dán link YouTube, Bilibili, Twitch, Web…"
                className="w-full h-9 pl-3 pr-8 rounded-xl bg-white/10 border border-white/15 text-xs text-white placeholder:text-slate-400 focus:outline-none focus:border-teal-400"
              />
              <button
                type="button"
                onClick={handlePasteClipboard}
                title="Dán từ bộ nhớ tạm"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-lg text-slate-300 hover:text-white inline-flex items-center justify-center cursor-pointer"
              >
                <ClipboardPaste className="w-3.5 h-3.5" />
              </button>
            </div>
            <button
              type="submit"
              className="h-9 px-3 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-extrabold inline-flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <span>Mở Link</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </form>

          {/* Live Bilingual Subtitle Feed inside the Bubble */}
          <div className="rounded-2xl bg-white/6 border border-white/10 p-3 min-h-[82px] flex flex-col justify-center gap-1">
            {globalSubtitleFeed.sourceText && (
              <div className="flex flex-wrap gap-x-1 text-xs text-slate-300">
                {globalSubtitleFeed.sourceText.split(/(\s+)/).map((tok, i) =>
                  tok.trim() ? (
                    <span
                      key={i}
                      onClick={() =>
                        openWordLookup(
                          tok.trim(),
                          settings.defaultSourceLanguage,
                          globalSubtitleFeed.sourceText
                        )
                      }
                      className="hover:underline hover:text-teal-300 cursor-pointer"
                    >
                      {tok}
                    </span>
                  ) : (
                    <span key={i}>{tok}</span>
                  )
                )}
              </div>
            )}
            <p
              style={{
                fontSize: `${Math.max(14, Math.min(22, activePreset.fontSize - 2))}px`,
                color: activePreset.textColor || '#FFFFFF',
              }}
              className={`font-bold leading-snug ${
                globalSubtitleFeed.isPartial ? 'italic opacity-85' : ''
              }`}
            >
              {globalSubtitleFeed.translatedText ||
                'Chạm "Bắt tiếng Tab / YouTube" hoặc "Nghe Micro" bên dưới để dịch phụ đề trực tiếp ngay tại đây.'}
            </p>
          </div>

          {/* 1-Tap Quick Audio Capture & Session Actions */}
          {!liveRunningIndicator.isRunning ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  haptic(10);
                  dispatchLiveQuickCommand('start-tab');
                }}
                className="min-h-[40px] px-3 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-extrabold inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <MonitorSpeaker className="w-4 h-4 shrink-0" />
                <span>Bắt tiếng Tab/Web</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  haptic(10);
                  dispatchLiveQuickCommand('start-mic');
                }}
                className="min-h-[40px] px-3 rounded-xl bg-white/12 hover:bg-white/20 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Mic className="w-4 h-4 shrink-0" />
                <span>Nghe qua Micro</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  haptic(8);
                  dispatchLiveQuickCommand('toggle-pause');
                }}
                className="flex-1 min-h-[38px] px-3 rounded-xl bg-white/14 hover:bg-white/22 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {globalSubtitleFeed.statusLabel === 'Tạm dừng' ? (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    <span>Tiếp tục dịch</span>
                  </>
                ) : (
                  <>
                    <Pause className="w-3.5 h-3.5" />
                    <span>Tạm dừng</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  haptic(10);
                  dispatchLiveQuickCommand('stop');
                }}
                className="min-h-[38px] px-3.5 rounded-xl bg-rose-500/25 hover:bg-rose-500/35 text-rose-200 text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Square className="w-3.5 h-3.5" />
                <span>Dừng</span>
              </button>
            </div>
          )}

          {/* Quick Language & Font Size Footer */}
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/10">
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
              {(['auto', 'ko', 'ja', 'zh-CN'] as SourceLanguageCode[]).map((code) => {
                const active = settings.defaultSourceLanguage === code;
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => updateSettings({ defaultSourceLanguage: code })}
                    className={`px-2 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap cursor-pointer ${
                      active
                        ? 'bg-teal-500 text-slate-950'
                        : 'bg-white/8 text-slate-300 hover:bg-white/15'
                    }`}
                  >
                    {code === 'auto' ? 'Tự động' : LANGUAGE_REGISTRY[code].shortLabelVi}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() =>
                  updateActivePresetLive({ fontSize: Math.max(13, activePreset.fontSize - 2) })
                }
                className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-bold cursor-pointer"
              >
                A-
              </button>
              <button
                type="button"
                onClick={() =>
                  updateActivePresetLive({ fontSize: Math.min(34, activePreset.fontSize + 2) })
                }
                className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-bold cursor-pointer"
              >
                A+
              </button>
            </div>
          </div>

          <p className="text-[10.5px] text-slate-400 leading-snug flex items-center gap-1">
            <ExternalLink className="w-3 h-3 shrink-0 text-teal-400" />
            <span>
              Mẹo: Khi xem YouTube/Web ở tab khác, bấm <strong>&ldquo;Nổi lên Tab khác&rdquo;</strong> +{' '}
              <strong>&ldquo;Bắt tiếng Tab/Web&rdquo;</strong>.
            </span>
          </p>
        </div>
      )}
    </>
  );
};
