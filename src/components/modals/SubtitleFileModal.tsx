import React, { useRef, useState } from 'react';
import { Download, Edit3, FileText, Sparkles, Upload } from 'lucide-react';
import { useLinguaFlow } from '../../context/LinguaFlowContext';
import {
  exportSubtitleSegments,
  formatMsToReadableClock,
  parseSubtitleFileContent,
} from '../../core/subtitles/subtitleParser';
import { translationClient } from '../../core/network/translationClient';
import { BUILTIN_QA_STREAMS } from '../../core/media/sampleMedia';
import type {
  SourceLanguageCode,
  TranscriptSegment,
} from '../../types/domain';
import {
  BottomSheet,
  ErrorRecoveryBanner,
  LanguageSelectorPills,
} from '../ui/DesignSystem';

/**
 * Subtitle File Importer, Contextual Translator, Editor & Exporter (Sections 5.4, 22.2, 23.2)
 * Supports .SRT, .VTT, .ASS/.SSA while strictly preserving timestamps and distinguishing AI vs User-Edited lines.
 */
export const SubtitleFileModal: React.FC = () => {
  const {
    subtitleFileModalOpen,
    setSubtitleFileModalOpen,
    settings,
    dictionary,
    upsertSession,
    showToast,
  } = useLinguaFlow();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [sourceLang, setSourceLang] = useState<SourceLanguageCode>('auto');
  const [fileName, setFileName] = useState('phu-de-tieng-viet');
  const [detectedFormat, setDetectedFormat] = useState<string>('');
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [translating, setTranslating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const loadRawSubtitleString = (rawContent: string, originName: string) => {
    setErrorMsg(null);
    try {
      const parsed = parseSubtitleFileContent(rawContent, originName);
      const baseName = originName.replace(/\.(srt|vtt|ass|ssa|txt)$/i, '');
      setFileName(`${baseName}.vi`);
      setDetectedFormat(parsed.format.toUpperCase());

      const initialSegments: TranscriptSegment[] = parsed.cues.map((cue) => ({
        id: cue.id,
        sessionId: `subfile-${Date.now()}`,
        startTimestamp: cue.startTimestamp,
        endTimestamp: cue.endTimestamp,
        sourceText: cue.sourceText,
        translatedText: '',
        speakerId: cue.speakerId,
        recognitionStatus: 'confirmed',
        translationStatus: 'pending',
        confidence: 1,
        detectedLanguage: 'ko',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }));
      setSegments(initialSegments);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Tệp phụ đề lỗi định dạng.');
      setSegments([]);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    loadRawSubtitleString(text, file.name);
    e.target.value = '';
  };

  const runBatchTranslation = async () => {
    if (segments.length === 0) return;
    setTranslating(true);
    setErrorMsg(null);
    try {
      const results = await translationClient.translateBatch({
        items: segments.map((s) => ({ id: s.id, text: s.sourceText })),
        sourceLanguage: sourceLang,
        styleMode: settings.defaultTranslationStyle,
        naturalnessLevel: settings.naturalnessLevel,
        properNounMode: settings.properNounMode,
        preferredProvider: settings.preferredProvider,
        glossary: settings.dictionaryEnabledByDefault ? dictionary : [],
      });

      const byId = new Map(results.map((r) => [r.id, r]));
      const updatedSegments: TranscriptSegment[] = segments.map((seg) => {
        const hit = byId.get(seg.id);
        if (!hit) return seg;
        return {
          ...seg,
          translatedText: hit.translatedText,
          detectedLanguage: hit.detectedLanguage,
          confidence: hit.confidence,
          tokens: hit.tokens,
          translationStatus: hit.confidence < 0.66 ? 'uncertain' : 'completed',
          updatedAt: Date.now(),
        };
      });

      setSegments(updatedSegments);
      const lastEnd = updatedSegments[updatedSegments.length - 1]?.endTimestamp ?? 0;

      upsertSession({
        id: updatedSegments[0]?.sessionId ?? `subfile-${Date.now()}`,
        title: `Tệp phụ đề: ${fileName}`,
        sourceLanguage: sourceLang,
        detectedLanguage: updatedSegments[0]?.detectedLanguage,
        targetLanguage: 'vi',
        sourceType: 'subtitle-file',
        createdAt: Date.now(),
        startedAt: Date.now(),
        endedAt: Date.now(),
        durationMs: lastEnd,
        sessionStatus: 'completed',
        subtitlePresetId: settings.activePresetId,
        translationMode: settings.defaultTranslationStyle,
        naturalnessLevel: settings.naturalnessLevel,
        audioSource: 'subtitle-track',
        transcriptSegments: updatedSegments,
        speakerLabels: {},
        dictionaryEnabled: settings.dictionaryEnabledByDefault,
        privacySettings: {
          saveHistory: settings.saveHistory,
          saveTranscript: settings.saveTranscript,
          saveRawAudio: false,
        },
      });

      showToast(`Đã dịch xong ${updatedSegments.length} dòng phụ đề!`, 'success');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Dịch tệp phụ đề thất bại.');
    } finally {
      setTranslating(false);
    }
  };

  const handleExport = (fmt: 'srt' | 'vtt' | 'txt' | 'bilingual-srt') => {
    try {
      const content = exportSubtitleSegments(segments, fmt);
      const ext = fmt === 'bilingual-srt' ? 'bilingual.srt' : fmt;
      const cleanName = (fileName.trim() || 'lingua-flow-export').replace(/[^a-zA-Z0-9._-\u00C0-\u1EF9]/g, '_');
      const blob = new Blob(['\uFEFF' + content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${cleanName}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(`Đã xuất tệp ${cleanName}.${ext}`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Không thể xuất tệp', 'error');
    }
  };

  return (
    <BottomSheet
      open={subtitleFileModalOpen}
      onClose={() => setSubtitleFileModalOpen(false)}
      title="Dịch tệp phụ đề (.SRT / .VTT / .ASS)"
    >
      <div className="space-y-4">
        <LanguageSelectorPills value={sourceLang} onChange={setSourceLang} compact />

        <input
          ref={fileInputRef}
          type="file"
          accept=".srt,.vtt,.ass,.ssa,.txt"
          onChange={handleFileUpload}
          className="hidden"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[46px] px-4 rounded-2xl lf-elevated text-xs font-semibold inline-flex items-center justify-center gap-2 cursor-pointer hover:border-[var(--accent-primary)]"
          >
            <Upload className="w-4 h-4 text-[var(--accent-primary)]" />
            <span>Chọn tệp .SRT / .VTT / .ASS từ máy</span>
          </button>

          <div className="flex gap-1.5">
            {BUILTIN_QA_STREAMS.map((st, idx) => {
              const ext = idx === 0 ? 'SRT Hàn' : idx === 1 ? 'VTT Nhật' : 'ASS Trung';
              return (
                <button
                  key={st.id}
                  type="button"
                  onClick={() =>
                    loadRawSubtitleString(
                      st.sampleSrtContent,
                      idx === 0 ? 'sample-ko.srt' : idx === 1 ? 'sample-ja.vtt' : 'sample-zh.ass'
                    )
                  }
                  className="flex-1 min-h-[46px] px-2 rounded-2xl lf-surface text-[11px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  Mẫu {ext}
                </button>
              );
            })}
          </div>
        </div>

        {errorMsg && (
          <ErrorRecoveryBanner message={errorMsg} onDismiss={() => setErrorMsg(null)} />
        )}

        {segments.length > 0 && (
          <>
            <div className="flex items-center justify-between gap-2 rounded-2xl lf-elevated px-3.5 py-2.5">
              <div className="flex items-center gap-2 text-xs">
                <FileText className="w-4 h-4 text-[var(--accent-primary)]" />
                <span className="font-semibold">
                  {segments.length} câu · Định dạng gốc: {detectedFormat}
                </span>
              </div>
              <button
                type="button"
                disabled={translating}
                onClick={runBatchTranslation}
                className="min-h-[38px] px-3.5 rounded-xl lf-brand-gradient text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{translating ? 'Đang dịch…' : 'Dịch toàn bộ'}</span>
              </button>
            </div>

            {/* Cue list with inline manual editing (Section 23.2: differentiates AI vs User Edited) */}
            <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
              {segments.map((seg, i) => {
                const isEditing = editingId === seg.id;
                const shownVi = seg.isUserEdited ? seg.userEditedText ?? '' : seg.translatedText;
                return (
                  <div
                    key={seg.id}
                    className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
                      <span className="font-mono">
                        #{i + 1} · {formatMsToReadableClock(seg.startTimestamp)} →{' '}
                        {formatMsToReadableClock(seg.endTimestamp)}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {seg.isUserEdited ? (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[10px] font-semibold">
                            Bản bạn đã sửa
                          </span>
                        ) : seg.translatedText ? (
                          <span className="px-1.5 py-0.5 rounded bg-blue-500/12 text-blue-600 dark:text-blue-300 text-[10px] font-semibold">
                            Bản dịch AI
                          </span>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => setEditingId(isEditing ? null : seg.id)}
                          aria-label="Sửa câu dịch"
                          className="p-1 rounded hover:bg-[var(--bg-elevated)] cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="text-xs text-[var(--text-secondary)]">{seg.sourceText}</div>

                    {isEditing ? (
                      <div className="space-y-1.5 pt-1">
                        <input
                          type="text"
                          value={seg.userEditedText ?? seg.translatedText}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSegments((prev) =>
                              prev.map((item) =>
                                item.id === seg.id
                                  ? { ...item, userEditedText: val, isUserEdited: true }
                                  : item
                              )
                            );
                          }}
                          placeholder="Nhập bản dịch tiếng Việt chỉnh sửa…"
                          className="w-full min-h-[36px] px-2.5 rounded-lg lf-elevated text-xs text-[var(--text-primary)] outline-none"
                        />
                        {seg.isUserEdited && seg.translatedText && (
                          <div className="text-[10px] text-[var(--text-muted)]">
                            Bản AI gốc: {seg.translatedText}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-xs font-semibold text-[var(--text-primary)]">
                        {shownVi || <span className="italic opacity-55">Chưa dịch — bấm "Dịch toàn bộ"</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Editable Filename + Format Export */}
            <div className="pt-2 border-t border-[var(--border-subtle)] space-y-2.5">
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-[var(--text-secondary)] shrink-0">
                  Tên tệp xuất:
                </label>
                <input
                  type="text"
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  className="flex-1 min-h-[38px] px-3 rounded-xl lf-elevated text-xs font-mono text-[var(--text-primary)] outline-none"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: 'srt' as const, label: 'Xuất .SRT' },
                  { id: 'bilingual-srt' as const, label: 'SRT Song ngữ' },
                  { id: 'vtt' as const, label: 'Xuất .VTT' },
                  { id: 'txt' as const, label: 'Xuất .TXT' },
                ].map((btn) => (
                  <button
                    key={btn.id}
                    type="button"
                    onClick={() => handleExport(btn.id)}
                    className="min-h-[40px] px-2.5 rounded-xl lf-elevated text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer hover:border-[var(--accent-primary)]"
                  >
                    <Download className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                    <span>{btn.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </BottomSheet>
  );
};
