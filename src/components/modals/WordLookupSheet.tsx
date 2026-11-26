import React, { useEffect, useState } from 'react';
import { BookPlus, Volume2 } from 'lucide-react';
import { useLinguaFlow } from '../../context/LinguaFlowContext';
import { translationClient } from '../../core/network/translationClient';
import { LANGUAGE_REGISTRY } from '../../core/languages/languageRegistry';
import { BottomSheet } from '../ui/DesignSystem';

export const WordLookupSheet: React.FC = () => {
  const {
    wordLookupTarget,
    closeWordLookup,
    addDictionaryEntry,
    capabilities,
  } = useLinguaFlow();

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Awaited<
    ReturnType<typeof translationClient.lookupWord>
  > | null>(null);
  const [customVi, setCustomVi] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!wordLookupTarget) {
      setData(null);
      setCustomVi('');
      setNote('');
      return;
    }

    let cancelled = false;
    setLoading(true);
    translationClient
      .lookupWord(
        wordLookupTarget.term,
        wordLookupTarget.sourceLanguage,
        wordLookupTarget.contextSentence
      )
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setCustomVi(res.meaningVi?.replace(/\s*\(.+\)$/, '') ?? '');
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [wordLookupTarget]);

  const speakWord = () => {
    if (!wordLookupTarget || !capabilities.supportsSpeechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(wordLookupTarget.term);
      const langCode = data?.detectedLanguage ?? 'ko';
      utt.lang = LANGUAGE_REGISTRY[langCode]?.bcp47 ?? 'ko-KR';
      window.speechSynthesis.speak(utt);
    } catch {
      // Ignore synthesis error
    }
  };

  return (
    <BottomSheet
      open={Boolean(wordLookupTarget)}
      onClose={closeWordLookup}
      title="Tra cứu từ nhanh"
    >
      {loading && (
        <div className="py-6 text-center text-xs text-[var(--text-secondary)]">
          Đang phân tích hình thái từ vựng…
        </div>
      )}

      {!loading && data && (
        <div className="space-y-4">
          <div className="rounded-2xl lf-elevated p-4 flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-[var(--text-primary)]">
                  {data.term}
                </span>
                <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[var(--accent-primary-soft)] text-[var(--accent-primary)]">
                  {LANGUAGE_REGISTRY[data.detectedLanguage].shortLabelVi} · {data.pos}
                </span>
              </div>

              {data.reading ? (
                <div className="text-xs font-mono text-[var(--text-secondary)]">
                  Cách đọc: <strong className="text-[var(--text-primary)]">{data.reading}</strong>
                </div>
              ) : (
                <div className="text-xs text-[var(--text-muted)]">
                  Chưa có dữ liệu phiên âm xác thực
                </div>
              )}

              {data.hanViet && (
                <div className="text-xs text-[var(--text-secondary)]">
                  Âm Hán-Việt:{' '}
                  <strong className="uppercase tracking-wide text-[var(--accent-flow)]">
                    {data.hanViet}
                  </strong>
                </div>
              )}
            </div>

            {capabilities.supportsSpeechSynthesis && (
              <button
                type="button"
                onClick={speakWord}
                aria-label="Nghe phát âm từ gốc"
                className="w-10 h-10 rounded-xl lf-surface inline-flex items-center justify-center text-[var(--accent-primary)] cursor-pointer"
              >
                <Volume2 className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="space-y-1">
            <div className="text-xs font-semibold text-[var(--text-secondary)]">Nghĩa tiếng Việt</div>
            {data.meaningVi ? (
              <div className="text-base font-bold text-[var(--text-primary)]">
                {data.meaningVi}
              </div>
            ) : (
              <div className="text-xs text-amber-600 dark:text-amber-400">
                Chưa có dữ liệu nghĩa xác thực trong từ điển cục bộ (không tự tạo nghĩa giả).
              </div>
            )}
            {data.grammarNote && (
              <p className="text-xs text-[var(--text-secondary)]">{data.grammarNote}</p>
            )}
          </div>

          {data.contextSentence && (
            <div className="rounded-2xl border border-[var(--border-subtle)] p-3 space-y-1">
              <div className="text-[11px] font-semibold text-[var(--text-secondary)]">
                Ngữ cảnh hiện tại
              </div>
              <div className="text-xs text-[var(--text-primary)]">{data.contextSentence}</div>
            </div>
          )}

          {/* Add to Personal Dictionary */}
          <div className="pt-2 border-t border-[var(--border-subtle)] space-y-2.5">
            <div className="text-xs font-semibold text-[var(--text-primary)]">
              Lưu vào Từ điển cá nhân (ưu tiên cho các phiên dịch sau)
            </div>
            <input
              type="text"
              value={customVi}
              onChange={(e) => setCustomVi(e.target.value)}
              placeholder="Cách dịch tiếng Việt mong muốn…"
              className="w-full min-h-[42px] px-3.5 rounded-xl lf-elevated text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent-primary)]"
            />
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ghi chú cá nhân (tùy chọn)…"
              className="w-full min-h-[40px] px-3.5 rounded-xl lf-elevated text-xs text-[var(--text-primary)] outline-none"
            />
            <button
              type="button"
              disabled={!customVi.trim()}
              onClick={() => {
                if (!customVi.trim()) return;
                addDictionaryEntry({
                  originalTerm: data.term,
                  preferredTranslation: customVi.trim(),
                  sourceLanguage: data.detectedLanguage,
                  category: 'general',
                  keepOriginal: false,
                  notes: note.trim() || undefined,
                });
                closeWordLookup();
              }}
              className="w-full min-h-[44px] rounded-xl bg-[var(--accent-primary)] disabled:opacity-45 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <BookPlus className="w-4 h-4" />
              <span>Thêm vào Từ điển cá nhân</span>
            </button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
};
