import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Bookmark,
  BookOpen,
  Clock,
  Copy,
  Download,
  Edit2,
  Plus,
  Search,
  Star,
  Trash2,
  Volume2,
} from 'lucide-react';
import { useLinguaFlow } from '../context/LinguaFlowContext';
import { LANGUAGE_REGISTRY } from '../core/languages/languageRegistry';
import {
  exportSubtitleSegments,
  formatMsToReadableClock,
} from '../core/subtitles/subtitleParser';
import type {
  DictionaryEntry,
  SourceLanguageCode,
} from '../types/domain';
import { ConfirmDialog, EmptyStateCard } from '../components/ui/DesignSystem';

export const LibraryView: React.FC = () => {
  const {
    sessions,
    renameSession,
    deleteSession,
    clearAllSessions,
    updateSegmentInSession,
    inspectingSessionId,
    setInspectingSessionId,
    savedPhrases,
    savePhraseFromSegment,
    updateSavedPhrase,
    deleteSavedPhrase,
    dictionary,
    addDictionaryEntry,
    deleteDictionaryEntry,
    openWordLookup,
    capabilities,
    setActiveTab,
    showToast,
  } = useLinguaFlow();

  const [subTab, setSubTab] = useState<'history' | 'phrases' | 'dictionary'>('history');
  const [searchQuery, setSearchQuery] = useState('');
  const [langFilter, setLangFilter] = useState<'all' | 'ko' | 'ja' | 'zh'>('all');

  // Safe confirmation dialogs (Section 38.4)
  const [sessionToDeleteId, setSessionToDeleteId] = useState<string | null>(null);
  const [confirmClearAllOpen, setConfirmClearAllOpen] = useState(false);

  // Transcript viewer states
  const [transcriptSearch, setTranscriptSearch] = useState('');
  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null);
  const [exportFilename, setExportFilename] = useState('transcript-lingua-flow');

  // Personal Dictionary form
  const [dictOriginal, setDictOriginal] = useState('');
  const [dictPreferredVi, setDictPreferredVi] = useState('');
  const [dictLang, setDictLang] = useState<SourceLanguageCode>('ko');
  const [dictCategory, setDictCategory] = useState<DictionaryEntry['category']>('streamer');
  const [dictKeepOrig, setDictKeepOrig] = useState(false);

  const inspectingSession = useMemo(
    () => sessions.find((s) => s.id === inspectingSessionId) ?? null,
    [sessions, inspectingSessionId]
  );

  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      const code = s.detectedLanguage ?? s.sourceLanguage;
      if (langFilter === 'ko' && code !== 'ko') return false;
      if (langFilter === 'ja' && code !== 'ja') return false;
      if (langFilter === 'zh' && code !== 'zh-CN' && code !== 'zh-TW') return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      if (s.title.toLowerCase().includes(q)) return true;
      return s.transcriptSegments.some(
        (seg) =>
          seg.sourceText.toLowerCase().includes(q) ||
          seg.translatedText.toLowerCase().includes(q)
      );
    });
  }, [langFilter, searchQuery, sessions]);

  const handleExportSession = (fmt: 'srt' | 'vtt' | 'txt' | 'bilingual-srt') => {
    if (!inspectingSession) return;
    try {
      const out = exportSubtitleSegments(inspectingSession.transcriptSegments, fmt);
      const ext = fmt === 'bilingual-srt' ? 'bilingual.srt' : fmt;
      const safeName = (exportFilename.trim() || 'transcript').replace(
        /[^a-zA-Z0-9._-\u00C0-\u1EF9]/g,
        '_'
      );
      const blob = new Blob(['\uFEFF' + out], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeName}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(`Đã xuất tệp ${safeName}.${ext}`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Không thể xuất dữ liệu', 'error');
    }
  };

  // =========================================================================
  // DEDICATED TRANSCRIPT VIEWER SCREEN (Section 22.1 & 22.2)
  // =========================================================================
  if (inspectingSession) {
    const visibleSegs = inspectingSession.transcriptSegments.filter((seg) => {
      if (!transcriptSearch.trim()) return true;
      const q = transcriptSearch.toLowerCase();
      return (
        seg.sourceText.toLowerCase().includes(q) ||
        seg.translatedText.toLowerCase().includes(q) ||
        (seg.userEditedText ?? '').toLowerCase().includes(q)
      );
    });

    return (
      <div className="space-y-4 pb-8">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setInspectingSessionId(null)}
            className="min-h-[40px] px-3 rounded-2xl lf-surface text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Quay lại Lịch sử</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const next = window.prompt('Đổi tên phiên dịch:', inspectingSession.title);
              if (next) renameSession(inspectingSession.id, next);
            }}
            className="min-h-[40px] px-3 rounded-2xl lf-surface text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Edit2 className="w-3.5 h-3.5" />
            <span>Đổi tên</span>
          </button>
        </div>

        <section className="rounded-3xl lf-surface p-5 space-y-3">
          <h1 className="text-lg font-extrabold text-[var(--text-primary)]">
            {inspectingSession.title}
          </h1>
          <div className="text-xs text-[var(--text-secondary)] flex flex-wrap items-center gap-2">
            <span>
              {
                LANGUAGE_REGISTRY[
                  inspectingSession.detectedLanguage ?? inspectingSession.sourceLanguage
                ].nameVi
              }{' '}
              → Tiếng Việt
            </span>
            <span>·</span>
            <span>{inspectingSession.transcriptSegments.length} câu</span>
            <span>·</span>
            <span>Thời lượng {formatMsToReadableClock(inspectingSession.durationMs)}</span>
          </div>

          {/* Search inside transcript */}
          <div className="relative">
            <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={transcriptSearch}
              onChange={(e) => setTranscriptSearch(e.target.value)}
              placeholder="Tìm từ hoặc câu trong transcript…"
              className="w-full min-h-[42px] pl-10 pr-4 rounded-2xl lf-elevated text-xs outline-none"
            />
          </div>

          {/* Export Bar */}
          <div className="pt-2 border-t border-[var(--border-subtle)] space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[var(--text-secondary)] shrink-0">
                Tên tệp:
              </span>
              <input
                type="text"
                value={exportFilename}
                onChange={(e) => setExportFilename(e.target.value)}
                className="flex-1 min-h-[36px] px-3 rounded-xl lf-elevated text-xs font-mono outline-none"
              />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(
                [
                  ['srt', 'Xuất .SRT'],
                  ['bilingual-srt', 'SRT Song ngữ'],
                  ['vtt', 'Xuất .VTT'],
                  ['txt', 'Xuất .TXT'],
                ] as const
              ).map(([fmt, label]) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => handleExportSession(fmt)}
                  className="min-h-[38px] px-2.5 rounded-xl lf-elevated text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Two-column on larger screens / clean stacked blocks on phone (Section 22.1) */}
        <section className="space-y-2.5">
          {visibleSegs.map((seg) => {
            const isEditing = editingSegmentId === seg.id;
            const displayedVi =
              seg.isUserEdited && seg.userEditedText ? seg.userEditedText : seg.translatedText;
            return (
              <div
                key={seg.id}
                className="rounded-3xl lf-surface p-4 space-y-2.5"
              >
                <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-[var(--accent-primary)]">
                      {formatMsToReadableClock(seg.startTimestamp)}
                    </span>
                    {seg.speakerId && (
                      <span className="px-2 py-0.5 rounded-md lf-elevated font-semibold">
                        {inspectingSession.speakerLabels[seg.speakerId] ?? seg.speakerId}
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded-md bg-blue-500/10 text-[var(--accent-primary)] font-semibold">
                      {seg.isUserEdited ? 'Bản bạn đã sửa' : 'Bản dịch AI'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(`${seg.sourceText}\n${displayedVi}`);
                        showToast('Đã sao chép câu thoại', 'success');
                      }}
                      aria-label="Sao chép câu thoại"
                      className="p-1.5 rounded-lg lf-elevated cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        savePhraseFromSegment(
                          seg,
                          inspectingSession.id,
                          formatMsToReadableClock(seg.startTimestamp)
                        )
                      }
                      aria-label="Lưu câu thoại"
                      className="p-1.5 rounded-lg lf-elevated cursor-pointer"
                    >
                      <Bookmark className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingSegmentId(isEditing ? null : seg.id)}
                      aria-label="Chỉnh sửa bản dịch"
                      className="p-1.5 rounded-lg lf-elevated cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-0.5">
                  <div className="rounded-2xl lf-elevated p-3 text-xs text-[var(--text-primary)] leading-relaxed">
                    <div className="text-[10px] font-bold uppercase text-[var(--text-secondary)] mb-1">
                      Câu gốc (Chạm từ để tra cứu)
                    </div>
                    {seg.sourceText.split(/(\s+)/).map((chunk, idx) =>
                      chunk.trim() ? (
                        <button
                          key={idx}
                          type="button"
                          onClick={() =>
                            openWordLookup(chunk, seg.detectedLanguage, seg.sourceText)
                          }
                          className="hover:underline text-left cursor-pointer"
                        >
                          {chunk}
                        </button>
                      ) : (
                        <span key={idx}>{chunk}</span>
                      )
                    )}
                  </div>

                  <div className="rounded-2xl lf-elevated p-3 text-sm font-semibold text-[var(--text-primary)] leading-relaxed">
                    <div className="text-[10px] font-bold uppercase text-[var(--accent-primary)] mb-1">
                      Bản dịch Tiếng Việt
                    </div>
                    {isEditing ? (
                      <div className="space-y-1.5">
                        <input
                          type="text"
                          value={seg.userEditedText ?? seg.translatedText}
                          onChange={(e) =>
                            updateSegmentInSession(inspectingSession.id, seg.id, {
                              userEditedText: e.target.value,
                              isUserEdited: true,
                            })
                          }
                          className="w-full min-h-[36px] px-2.5 rounded-lg lf-surface text-xs outline-none"
                        />
                        {seg.isUserEdited && (
                          <div className="text-[10px] font-normal text-[var(--text-muted)]">
                            Bản dịch AI gốc: {seg.translatedText}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>{displayedVi}</div>
                    )}
                    {seg.explanationVi && (
                      <div className="text-[11px] font-normal text-[var(--accent-flow)] mt-1">
                        Giải thích: {seg.explanationVi}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      </div>
    );
  }

  // =========================================================================
  // MAIN LIBRARY TABS (History / Saved Phrases / Personal Dictionary)
  // =========================================================================
  return (
    <div className="space-y-4 pb-8">
      <div className="grid grid-cols-3 gap-1.5 rounded-2xl lf-elevated p-1">
        {(
          [
            ['history', `Lịch sử (${sessions.length})`],
            ['phrases', `Đã lưu (${savedPhrases.length})`],
            ['dictionary', `Từ điển (${dictionary.length})`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSubTab(id)}
            className={`min-h-[40px] rounded-xl text-xs font-bold cursor-pointer ${
              subTab === id
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs'
                : 'text-[var(--text-secondary)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 1. HISTORY TAB */}
      {subTab === 'history' && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm phiên hoặc nội dung câu đã dịch…"
                className="w-full min-h-[42px] pl-10 pr-3 rounded-2xl lf-surface text-xs outline-none"
              />
            </div>
          </div>

          {/* Filter by Language */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex gap-1.5">
              {(
                [
                  ['all', 'Tất cả'],
                  ['ko', 'Hàn'],
                  ['ja', 'Nhật'],
                  ['zh', 'Trung'],
                ] as const
              ).map(([code, label]) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setLangFilter(code)}
                  className={`min-h-[34px] px-3 rounded-xl text-xs font-semibold cursor-pointer ${
                    langFilter === code
                      ? 'bg-[var(--accent-primary)] text-white'
                      : 'lf-surface text-[var(--text-secondary)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {sessions.length > 0 && (
              <button
                type="button"
                onClick={() => setConfirmClearAllOpen(true)}
                className="min-h-[34px] px-3 rounded-xl text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-500/10 cursor-pointer"
              >
                Xóa toàn bộ lịch sử
              </button>
            )}
          </div>

          {filteredSessions.length === 0 ? (
            <EmptyStateCard
              icon={<Clock className="w-6 h-6" />}
              title="Chưa có phiên dịch nào khớp bộ lọc"
              description="Khi bạn hoàn tất một phiên dịch Livestream, Video hoặc Tệp phụ đề, transcript sẽ được lưu tại đây."
              actionLabel="Bắt đầu dịch ngay"
              onAction={() => setActiveTab('live')}
            />
          ) : (
            <div className="space-y-2.5">
              {filteredSessions.map((sess) => {
                const langCode = sess.detectedLanguage ?? sess.sourceLanguage;
                return (
                  <div
                    key={sess.id}
                    className="rounded-3xl lf-surface p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-[var(--text-primary)] truncate">
                          {sess.title}
                        </h3>
                        <div className="text-[11px] text-[var(--text-secondary)] mt-0.5 flex flex-wrap items-center gap-2">
                          <span>{LANGUAGE_REGISTRY[langCode].shortLabelVi} → Việt</span>
                          <span>·</span>
                          <span>{sess.transcriptSegments.length} câu</span>
                          <span>·</span>
                          <span>{formatMsToReadableClock(sess.durationMs)}</span>
                          <span>·</span>
                          <span>
                            {new Date(sess.createdAt).toLocaleTimeString('vi-VN', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </div>

                      {/* Safe distance between Open Transcript and Delete icon! (Section 38.4) */}
                      <button
                        type="button"
                        onClick={() => setSessionToDeleteId(sess.id)}
                        aria-label={`Xóa phiên ${sess.title}`}
                        className="p-2 rounded-xl text-[var(--text-muted)] hover:text-red-500 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="pt-1 flex items-center justify-between gap-2">
                      <span className="text-xs text-[var(--text-secondary)] truncate max-w-[65%]">
                        {sess.transcriptSegments[0]?.translatedText || 'Không có câu thoại'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setInspectingSessionId(sess.id)}
                        className="min-h-[38px] px-4 rounded-xl bg-[var(--accent-primary-soft)] text-[var(--accent-primary)] text-xs font-bold shrink-0 cursor-pointer"
                      >
                        Mở Transcript
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* 2. SAVED PHRASES TAB (Section 23) */}
      {subTab === 'phrases' && (
        <section className="space-y-3">
          {savedPhrases.length === 0 ? (
            <EmptyStateCard
              icon={<Bookmark className="w-6 h-6" />}
              title="Chưa có câu thoại đã lưu"
              description="Chạm biểu tượng Đánh dấu trong lúc xem Livestream, Video hoặc Dịch nhanh để lưu câu hay vào bộ sưu tập cá nhân."
            />
          ) : (
            savedPhrases.map((ph) => (
              <div key={ph.id} className="rounded-3xl lf-surface p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-[var(--accent-primary-soft)] text-[var(--accent-primary)]">
                    {LANGUAGE_REGISTRY[ph.sourceLanguage].nameVi}
                  </span>

                  <div className="flex items-center gap-1.5">
                    {capabilities.supportsSpeechSynthesis && (
                      <button
                        type="button"
                        onClick={() => {
                          window.speechSynthesis.cancel();
                          const u = new SpeechSynthesisUtterance(ph.sourceText);
                          u.lang = LANGUAGE_REGISTRY[ph.sourceLanguage].bcp47;
                          window.speechSynthesis.speak(u);
                        }}
                        aria-label="Nghe phát âm câu gốc"
                        className="p-1.5 rounded-lg lf-elevated cursor-pointer"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        updateSavedPhrase(ph.id, { isFavorite: !ph.isFavorite })
                      }
                      aria-label="Đánh dấu yêu thích"
                      className={`p-1.5 rounded-lg lf-elevated cursor-pointer ${
                        ph.isFavorite ? 'text-amber-500' : 'text-[var(--text-muted)]'
                      }`}
                    >
                      <Star className="w-3.5 h-3.5 fill-current" />
                    </button>

                    <button
                      type="button"
                      onClick={() => deleteSavedPhrase(ph.id)}
                      aria-label="Xóa câu đã lưu"
                      className="p-1.5 rounded-lg lf-elevated text-red-500 ml-2 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div
                  onClick={() =>
                    openWordLookup(ph.sourceText, ph.sourceLanguage, ph.sourceText)
                  }
                  className="text-sm font-medium text-[var(--text-secondary)] cursor-pointer hover:underline"
                >
                  {ph.sourceText}
                </div>
                <div className="text-sm font-bold text-[var(--text-primary)]">
                  {ph.userEditedTranslation || ph.aiTranslation}
                </div>

                <input
                  type="text"
                  value={ph.notes ?? ''}
                  onChange={(e) => updateSavedPhrase(ph.id, { notes: e.target.value })}
                  placeholder="Thêm ghi chú cá nhân cho câu này…"
                  className="w-full min-h-[36px] px-3 rounded-xl lf-elevated text-xs outline-none"
                />
              </div>
            ))
          )}
        </section>
      )}

      {/* 3. PERSONAL DICTIONARY TAB (Section 15.3 & 15.4) */}
      {subTab === 'dictionary' && (
        <section className="space-y-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!dictOriginal.trim() || (!dictKeepOrig && !dictPreferredVi.trim())) return;
              addDictionaryEntry({
                originalTerm: dictOriginal.trim(),
                preferredTranslation: dictKeepOrig
                  ? dictOriginal.trim()
                  : dictPreferredVi.trim(),
                sourceLanguage: dictLang,
                category: dictCategory,
                keepOriginal: dictKeepOrig,
              });
              setDictOriginal('');
              setDictPreferredVi('');
            }}
            className="rounded-3xl lf-surface p-4 space-y-3"
          >
            <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)]">
              <BookOpen className="w-4 h-4 text-[var(--accent-primary)]" />
              <span>Thêm thuật ngữ / Tên riêng ưu tiên</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                value={dictOriginal}
                onChange={(e) => setDictOriginal(e.target.value)}
                placeholder="Từ gốc (VD: 페이커, 原神, 推し)…"
                className="min-h-[40px] px-3.5 rounded-xl lf-elevated text-xs outline-none"
              />
              <input
                type="text"
                disabled={dictKeepOrig}
                value={dictPreferredVi}
                onChange={(e) => setDictPreferredVi(e.target.value)}
                placeholder="Cách hiển thị tiếng Việt…"
                className="min-h-[40px] px-3.5 rounded-xl lf-elevated text-xs outline-none disabled:opacity-50"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <select
                  aria-label="Ngôn ngữ từ điển"
                  value={dictLang}
                  onChange={(e) => setDictLang(e.target.value as SourceLanguageCode)}
                  className="min-h-[36px] px-2.5 rounded-xl lf-elevated text-xs font-semibold"
                >
                  <option value="auto">Mọi ngôn ngữ</option>
                  <option value="ko">Tiếng Hàn</option>
                  <option value="ja">Tiếng Nhật</option>
                  <option value="zh-CN">Trung (Giản thể)</option>
                  <option value="zh-TW">Trung (Phồn thể)</option>
                </select>

                <select
                  aria-label="Phân loại từ"
                  value={dictCategory}
                  onChange={(e) =>
                    setDictCategory(e.target.value as DictionaryEntry['category'])
                  }
                  className="min-h-[36px] px-2.5 rounded-xl lf-elevated text-xs font-semibold"
                >
                  <option value="streamer">Streamer / Idol</option>
                  <option value="person">Tên người</option>
                  <option value="game">Tên game</option>
                  <option value="brand">Thương hiệu</option>
                  <option value="pronoun">Xưng hô</option>
                  <option value="slang">Tiếng lóng</option>
                  <option value="general">Thuật ngữ chung</option>
                </select>
              </div>

              <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={dictKeepOrig}
                  onChange={(e) => setDictKeepOrig(e.target.checked)}
                  className="accent-[var(--accent-primary)]"
                />
                <span>Giữ nguyên từ gốc</span>
              </label>
            </div>

            <button
              type="submit"
              className="w-full min-h-[42px] rounded-xl bg-[var(--accent-primary)] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Lưu vào Từ điển cá nhân</span>
            </button>
          </form>

          <div className="space-y-2">
            {dictionary.map((entry) => (
              <div
                key={entry.id}
                className="rounded-2xl lf-surface px-4 py-3 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
                    <span>{entry.originalTerm}</span>
                    <span className="text-[var(--accent-primary)]">→</span>
                    <span>{entry.preferredTranslation}</span>
                  </div>
                  <div className="text-[11px] text-[var(--text-secondary)]">
                    {LANGUAGE_REGISTRY[entry.sourceLanguage].shortLabelVi} · {entry.category}
                    {entry.notes ? ` · ${entry.notes}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => deleteDictionaryEntry(entry.id)}
                  aria-label={`Xóa từ ${entry.originalTerm}`}
                  className="p-2 rounded-xl text-[var(--text-muted)] hover:text-red-500 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Confirmation Modals */}
      <ConfirmDialog
        open={Boolean(sessionToDeleteId)}
        title="Xóa phiên dịch này?"
        description="Transcript của phiên này sẽ bị xóa vĩnh viễn khỏi thiết bị."
        confirmLabel="Xóa phiên"
        danger
        onConfirm={() => {
          if (sessionToDeleteId) deleteSession(sessionToDeleteId);
        }}
        onCancel={() => setSessionToDeleteId(null)}
      />

      <ConfirmDialog
        open={confirmClearAllOpen}
        title="Xóa toàn bộ lịch sử dịch?"
        description="Tất cả các phiên dịch đã lưu trong Lịch sử sẽ bị xóa. Từ điển cá nhân và Preset phụ đề vẫn được giữ nguyên."
        confirmLabel="Xóa toàn bộ"
        danger
        onConfirm={clearAllSessions}
        onCancel={() => setConfirmClearAllOpen(false)}
      />
    </div>
  );
};
