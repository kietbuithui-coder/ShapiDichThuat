import React, { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  ChevronRight,
  ClipboardPaste,
  Clock,
  FileText,
  Film,
  Globe,
  Layers,
  Link2,
  Mic,
  Moon,
  Radio,
  Settings,
  Sliders,
  Sparkles,
  Sun,
  Zap,
} from 'lucide-react';
import { useLinguaFlow } from '../context/LinguaFlowContext';
import { LANGUAGE_REGISTRY } from '../core/languages/languageRegistry';
import {
  parseWebVideoUrl,
  SAMPLE_WEB_VIDEO_LINKS,
} from '../core/media/webVideoParser';
import { formatMsToReadableClock } from '../core/subtitles/subtitleParser';
import { BrandLogo } from '../components/ui/BrandLogo';
import { LanguageSelectorPills } from '../components/ui/DesignSystem';

export const HomeView: React.FC<{
  onLaunchLiveMode: (mode: 'livestream' | 'microphone') => void;
}> = ({ onLaunchLiveMode }) => {
  const {
    settings,
    updateSettings,
    resolvedDark,
    activePreset,
    sessions,
    liveRunningIndicator,
    floatingBubbleVisible,
    setFloatingBubbleVisible,
    setFloatingBubbleExpanded,
    openWebVideoLink,
    setActiveTab,
    setQuickTranslateOpen,
    setSubtitleFileModalOpen,
    setInspectingSessionId,
    showToast,
    haptic,
  } = useLinguaFlow();

  const [showLangPicker, setShowLangPicker] = useState(false);
  const [homeUrlInput, setHomeUrlInput] = useState('');

  const currentLangDef = LANGUAGE_REGISTRY[settings.defaultSourceLanguage];

  const detectedUrlInfo = useMemo(
    () => (homeUrlInput.trim() ? parseWebVideoUrl(homeUrlInput) : null),
    [homeUrlInput]
  );

  const cycleTheme = () => {
    haptic(8);
    const next =
      settings.themeMode === 'light'
        ? 'dark'
        : settings.themeMode === 'dark'
        ? 'system'
        : 'light';
    updateSettings({ themeMode: next });
  };

  const handleOpenLinkSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseWebVideoUrl(homeUrlInput);
    if (!parsed) {
      showToast(
        'Hãy dán đường dẫn YouTube, Bilibili, Twitch, TikTok, .m3u8, .mp4 hoặc trang web hợp lệ',
        'warning'
      );
      return;
    }
    haptic(10);
    openWebVideoLink(parsed.normalizedUrl);
    setHomeUrlInput('');
  };

  const handlePasteLink = async () => {
    try {
      const txt = await navigator.clipboard.readText();
      if (txt.trim()) {
        setHomeUrlInput(txt.trim());
        haptic(8);
      } else {
        showToast('Bộ nhớ tạm hiện đang trống', 'info');
      }
    } catch {
      showToast('Hãy chạm giữ vào ô nhập để dán đường dẫn', 'info');
    }
  };

  return (
    <div className="space-y-5 pb-8">
      {/* Top Header */}
      <header className="flex items-center justify-between gap-2 pt-1">
        <BrandLogo size={36} />

        <div className="flex items-center gap-1.5">
          {liveRunningIndicator.isRunning && (
            <button
              type="button"
              onClick={() => setActiveTab('live')}
              className="min-h-[38px] px-3 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <span>Đang dịch</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              haptic(8);
              if (!floatingBubbleVisible) {
                setFloatingBubbleVisible(true);
                setFloatingBubbleExpanded(true);
                showToast('Đã bật Bong bóng dịch nổi', 'success');
              } else {
                setFloatingBubbleExpanded((v) => !v);
              }
            }}
            title="Mở bảng điều khiển Bong bóng dịch nổi"
            className={`min-h-[38px] px-3 rounded-2xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer border transition-colors ${
              floatingBubbleVisible
                ? 'bg-[var(--accent-primary-soft)] text-[var(--accent-primary)] border-[var(--accent-primary)]/30'
                : 'lf-surface text-[var(--text-secondary)] border-[var(--border-subtle)]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Bong bóng</span>
          </button>

          <button
            type="button"
            onClick={cycleTheme}
            aria-label="Chuyển chế độ giao diện sáng tối"
            title={`Giao diện: ${
              settings.themeMode === 'light'
                ? 'Sáng'
                : settings.themeMode === 'dark'
                ? 'Tối'
                : 'Theo hệ thống'
            }`}
            className="w-10 h-10 rounded-2xl lf-surface inline-flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            {resolvedDark ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            aria-label="Mở cài đặt nhanh"
            className="w-10 h-10 rounded-2xl lf-surface inline-flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Universal Link Opener Card — Open & Translate YouTube / Bilibili / Twitch / HLS / Web Video */}
      <section
        aria-label="Mở đường dẫn YouTube và Video trên Web"
        className="rounded-3xl lf-surface p-4 sm:p-5 space-y-3 border-2 border-[var(--accent-primary)]/20"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-rose-500/12 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
              <Link2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-[var(--text-primary)]">
                Mở link YouTube & Video trên Web
              </h2>
              <p className="text-[11px] text-[var(--text-secondary)]">
                Hỗ trợ YouTube, Shorts, Bilibili, Twitch, .M3U8, .MP4 & trang web
              </p>
            </div>
          </div>

          {detectedUrlInfo && (
            <span className="px-2.5 py-1 rounded-full text-[10.5px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 shrink-0">
              {detectedUrlInfo.platformLabel}
            </span>
          )}
        </div>

        <form onSubmit={handleOpenLinkSubmit} className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Globe className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={homeUrlInput}
              onChange={(e) => setHomeUrlInput(e.target.value)}
              placeholder="Dán link youtube.com/watch?v=..., youtu.be, bilibili, web..."
              className="w-full min-h-[46px] pl-10 pr-16 rounded-2xl lf-elevated border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)]"
            />
            <button
              type="button"
              onClick={handlePasteLink}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[11px] font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] inline-flex items-center gap-1 cursor-pointer"
            >
              <ClipboardPaste className="w-3 h-3" />
              <span>Dán</span>
            </button>
          </div>

          <button
            type="submit"
            className="min-h-[46px] px-4 rounded-2xl lf-brand-gradient text-white text-sm font-bold shadow-sm inline-flex items-center justify-center gap-1.5 shrink-0 cursor-pointer active:scale-[0.99]"
          >
            <span>Mở & Dịch</span>
            <ArrowUpRight className="w-4 h-4" />
          </button>
        </form>

        {/* Quick 1-Tap Sample YouTube & Web Links */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-0.5">
          <span className="text-[11px] font-semibold text-[var(--text-muted)] shrink-0">
            Mở thử nhanh:
          </span>
          {SAMPLE_WEB_VIDEO_LINKS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                haptic(8);
                openWebVideoLink(item.url, item.sourceLang);
              }}
              className="px-2.5 py-1 rounded-xl lf-elevated border border-[var(--border-subtle)] hover:border-[var(--accent-primary)] text-[11px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] whitespace-nowrap inline-flex items-center gap-1.5 cursor-pointer"
            >
              <span className="px-1.5 py-0.2 rounded bg-[var(--accent-primary-soft)] text-[var(--accent-primary)] text-[9.5px] font-extrabold">
                {item.langBadge}
              </span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Quick Start Card ("Bắt đầu nhanh" — Section 8.2) */}
      <section className="rounded-3xl lf-surface p-5 space-y-4 relative overflow-hidden">
        <div className="flex items-center justify-between gap-2">
          <div className="space-y-0.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--accent-primary)]">
              Bắt đầu nhanh
            </span>
            <h1 className="text-xl font-extrabold tracking-tight text-[var(--text-primary)]">
              {currentLangDef.shortLabelVi} → Tiếng Việt
            </h1>
          </div>

          <button
            type="button"
            onClick={() => setShowLangPicker((v) => !v)}
            className="min-h-[40px] px-3.5 rounded-2xl lf-elevated text-xs font-semibold text-[var(--text-primary)] inline-flex items-center gap-1.5 cursor-pointer"
          >
            <span className="w-5 h-5 rounded-md bg-[var(--accent-primary-soft)] text-[var(--accent-primary)] font-bold inline-flex items-center justify-center text-[11px]">
              {currentLangDef.scriptBadge}
            </span>
            <span>Đổi ngôn ngữ</span>
          </button>
        </div>

        {showLangPicker && (
          <div className="pt-1">
            <LanguageSelectorPills
              value={settings.defaultSourceLanguage}
              onChange={(code) => {
                haptic(8);
                updateSettings({ defaultSourceLanguage: code });
              }}
              compact
            />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
          <button
            type="button"
            onClick={() => setActiveTab('studio')}
            className="px-2.5 py-1 rounded-lg lf-elevated font-medium hover:text-[var(--text-primary)] cursor-pointer"
          >
            Mẫu phụ đề: <strong className="text-[var(--text-primary)]">{activePreset.name}</strong>
          </button>
          <span className="px-2.5 py-1 rounded-lg lf-elevated font-medium">
            Kiểu dịch:{' '}
            <strong className="text-[var(--text-primary)]">
              {settings.defaultTranslationStyle === 'natural'
                ? 'Tự nhiên'
                : settings.defaultTranslationStyle === 'literal'
                ? 'Sát nghĩa'
                : settings.defaultTranslationStyle === 'easy'
                ? 'Dễ hiểu'
                : settings.defaultTranslationStyle === 'conversational'
                ? 'Hội thoại'
                : 'Giải trí'}
            </strong>
          </span>
        </div>

        <button
          type="button"
          onClick={() => {
            haptic(12);
            onLaunchLiveMode('livestream');
          }}
          className="w-full min-h-[54px] rounded-2xl lf-brand-gradient text-white font-bold text-[15px] shadow-md inline-flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99] transition-transform"
        >
          <Sparkles className="w-5 h-5" />
          <span>Bắt đầu phiên dịch ngay</span>
          <ArrowUpRight className="w-4 h-4 opacity-85" />
        </button>
      </section>

      {/* Three Primary Modes (Section 8.1 — Large, visual hierarchy, one-hand friendly) */}
      <section aria-label="Chế độ dịch chính" className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] px-1">
          Chế độ dịch chính
        </h2>

        <div className="grid grid-cols-1 gap-3">
          {/* 1. Livestream */}
          <button
            type="button"
            onClick={() => {
              haptic(10);
              onLaunchLiveMode('livestream');
            }}
            className="group w-full text-left rounded-3xl lf-surface p-4 sm:p-5 flex items-center gap-4 hover:border-[var(--accent-primary)] transition-all cursor-pointer"
          >
            <div className="w-13 h-13 rounded-2xl bg-blue-600/12 text-[var(--accent-primary)] flex items-center justify-center shrink-0">
              <Radio className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-[var(--text-primary)]">
                  Dịch livestream & Tab Web
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--accent-primary-soft)] text-[var(--accent-primary)]">
                  Thời gian thực
                </span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate">
                Bắt âm thanh tab YouTube/Web hoặc luồng trực tiếp Hàn, Nhật, Trung
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-[var(--text-muted)] group-hover:translate-x-0.5 transition-transform shrink-0" />
          </button>

          {/* 2. Video */}
          <button
            type="button"
            onClick={() => {
              haptic(10);
              setActiveTab('video');
            }}
            className="group w-full text-left rounded-3xl lf-surface p-4 sm:p-5 flex items-center gap-4 hover:border-[var(--accent-flow)] transition-all cursor-pointer"
          >
            <div className="w-13 h-13 rounded-2xl bg-teal-500/12 text-[var(--accent-flow)] flex items-center justify-center shrink-0">
              <Film className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-base font-bold text-[var(--text-primary)]">
                Trình phát Video & YouTube
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate">
                Mở link YouTube, Bilibili, .M3U8, tệp máy, đồng bộ lời thoại & PiP
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-[var(--text-muted)] group-hover:translate-x-0.5 transition-transform shrink-0" />
          </button>

          {/* 3. Microphone */}
          <button
            type="button"
            onClick={() => {
              haptic(10);
              onLaunchLiveMode('microphone');
            }}
            className="group w-full text-left rounded-3xl lf-surface p-4 sm:p-5 flex items-center gap-4 hover:border-indigo-500 transition-all cursor-pointer"
          >
            <div className="w-13 h-13 rounded-2xl bg-indigo-500/12 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <Mic className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-base font-bold text-[var(--text-primary)]">
                Nghe và dịch bằng micro
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate">
                Đặt gần TV, máy tính hoặc lớp học trực tiếp
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-[var(--text-muted)] group-hover:translate-x-0.5 transition-transform shrink-0" />
          </button>
        </div>
      </section>

      {/* Secondary Quick Tools (Subtitle File + Quick 1-Sentence + Studio) */}
      <section aria-label="Công cụ bổ trợ" className="grid grid-cols-3 gap-2.5">
        <button
          type="button"
          onClick={() => setSubtitleFileModalOpen(true)}
          className="rounded-2xl lf-surface p-3.5 flex flex-col items-start gap-2 hover:border-[var(--border-strong)] cursor-pointer"
        >
          <FileText className="w-4 h-4 text-[var(--accent-primary)]" />
          <span className="text-xs font-bold text-[var(--text-primary)] leading-tight">
            Dịch tệp SRT / VTT
          </span>
        </button>

        <button
          type="button"
          onClick={() => setQuickTranslateOpen(true)}
          className="rounded-2xl lf-surface p-3.5 flex flex-col items-start gap-2 hover:border-[var(--border-strong)] cursor-pointer"
        >
          <Zap className="w-4 h-4 text-[var(--accent-flow)]" />
          <span className="text-xs font-bold text-[var(--text-primary)] leading-tight">
            Dịch nhanh 1 câu
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('studio')}
          className="rounded-2xl lf-surface p-3.5 flex flex-col items-start gap-2 hover:border-[var(--border-strong)] cursor-pointer"
        >
          <Sliders className="w-4 h-4 text-indigo-500" />
          <span className="text-xs font-bold text-[var(--text-primary)] leading-tight">
            Customize Studio
          </span>
        </button>
      </section>

      {/* Recent History Preview (Section 8.3) */}
      <section aria-label="Lịch sử gần đây" className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
            Lịch sử gần đây
          </h2>
          {sessions.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab('library')}
              className="text-xs font-semibold text-[var(--accent-primary)] cursor-pointer"
            >
              Xem tất cả ({sessions.length})
            </button>
          )}
        </div>

        {sessions.length === 0 ? (
          <div className="rounded-2xl lf-surface px-4 py-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Clock className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
              <span className="text-xs text-[var(--text-secondary)]">
                Các phiên dịch đã lưu transcript sẽ xuất hiện tại đây.
              </span>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {sessions.slice(0, 3).map((sess) => {
              const langCode = sess.detectedLanguage ?? sess.sourceLanguage;
              const langDef = LANGUAGE_REGISTRY[langCode];
              return (
                <button
                  key={sess.id}
                  type="button"
                  onClick={() => {
                    setInspectingSessionId(sess.id);
                    setActiveTab('library');
                  }}
                  className="w-full text-left rounded-2xl lf-surface px-4 py-3.5 flex items-center justify-between gap-3 hover:border-[var(--border-strong)] cursor-pointer"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-[var(--text-primary)] truncate">
                      {sess.title}
                    </div>
                    <div className="text-[11px] text-[var(--text-secondary)] flex items-center gap-2 mt-0.5">
                      <span>{langDef.shortLabelVi} → Việt</span>
                      <span>·</span>
                      <span>{sess.transcriptSegments.length} câu</span>
                      <span>·</span>
                      <span>{formatMsToReadableClock(sess.durationMs)}</span>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-[var(--accent-primary)] shrink-0">
                    Transcript →
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
