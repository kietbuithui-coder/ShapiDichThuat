import React, { useRef, useState } from 'react';
import { Bookmark, Copy, Mic, MicOff, Sparkles, Volume2 } from 'lucide-react';
import { useLinguaFlow } from '../../context/LinguaFlowContext';
import { translationClient } from '../../core/network/translationClient';
import { LANGUAGE_REGISTRY } from '../../core/languages/languageRegistry';
import type {
  SourceLanguageCode,
  TranslationResponsePayload,
} from '../../types/domain';
import { BottomSheet, LanguageSelectorPills } from '../ui/DesignSystem';

const QUICK_SAMPLE_CHIPS: Array<{ lang: SourceLanguageCode; text: string }> = [
  { lang: 'ko', text: '여러분 오늘 방송 잘 들리나요?' },
  { lang: 'ja', text: '今日の日本語の授業はとてもわかりやすいですね。' },
  { lang: 'zh-CN', text: '今天直播间的朋友们太热情了！' },
  { lang: 'zh-TW', text: '這支教學影片講解得非常清楚，請大家訂閱按讚！' },
];

/**
 * Quick Single-Sentence Translator (Section 5.5)
 * Fast voice or text translation without launching a full video/livestream session.
 */
export const QuickTranslateModal: React.FC = () => {
  const {
    quickTranslateOpen,
    setQuickTranslateOpen,
    settings,
    dictionary,
    capabilities,
    openWordLookup,
    savePhraseFromSegment,
    showToast,
  } = useLinguaFlow();

  const [sourceLang, setSourceLang] = useState<SourceLanguageCode>(settings.defaultSourceLanguage);
  const [inputText, setInputText] = useState('');
  const [translating, setTranslating] = useState(false);
  const [recording, setRecording] = useState(false);
  const [result, setResult] = useState<TranslationResponsePayload | null>(null);
  const recRef = useRef<{ stop: () => void } | null>(null);

  const runTranslate = async (overrideText?: string, overrideLang?: SourceLanguageCode) => {
    const text = (overrideText ?? inputText).trim();
    if (!text) return;
    setTranslating(true);
    try {
      const res = await translationClient.translateStream({
        text,
        sourceLanguage: overrideLang ?? sourceLang,
        styleMode: settings.defaultTranslationStyle,
        naturalnessLevel: settings.naturalnessLevel,
        properNounMode: settings.properNounMode,
        preferredProvider: settings.preferredProvider,
        glossary: settings.dictionaryEnabledByDefault ? dictionary : [],
      });
      setResult(res);
    } catch {
      showToast('Không thể dịch câu này. Kiểm tra kết nối mạng.', 'error');
    } finally {
      setTranslating(false);
    }
  };

  const toggleVoiceShortCapture = () => {
    if (recording) {
      recRef.current?.stop();
      setRecording(false);
      return;
    }

    const SpeechRecCtor =
      (window as unknown as { SpeechRecognition?: new () => unknown }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => unknown }).webkitSpeechRecognition;

    if (!SpeechRecCtor) {
      showToast('Trình duyệt hiện tại không hỗ trợ nhận diện giọng nói ngắn. Hãy nhập văn bản.', 'warning');
      return;
    }

    const rec = new (SpeechRecCtor as new () => {
      continuous: boolean;
      interimResults: boolean;
      lang: string;
      start: () => void;
      stop: () => void;
      onresult: ((ev: { results: { [k: number]: { [j: number]: { transcript: string } } } }) => void) | null;
      onend: (() => void) | null;
      onerror: (() => void) | null;
    })();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = LANGUAGE_REGISTRY[sourceLang]?.bcp47 ?? 'ko-KR';

    rec.onresult = (ev) => {
      const transcript = ev.results[0]?.[0]?.transcript?.trim() ?? '';
      if (transcript) {
        setInputText(transcript);
        runTranslate(transcript);
      }
    };
    rec.onend = () => setRecording(false);
    rec.onerror = () => {
      setRecording(false);
      showToast('Không nhận được giọng nói từ Micro.', 'warning');
    };

    recRef.current = rec;
    setRecording(true);
    rec.start();
  };

  const speakVietnamese = (text: string) => {
    if (!capabilities.supportsSpeechSynthesis) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = 'vi-VN';
    window.speechSynthesis.speak(utt);
  };

  return (
    <BottomSheet
      open={quickTranslateOpen}
      onClose={() => {
        recRef.current?.stop();
        setRecording(false);
        setQuickTranslateOpen(false);
      }}
      title="Dịch nhanh một câu"
    >
      <div className="space-y-3.5">
        <LanguageSelectorPills
          value={sourceLang}
          detectedLanguage={result?.detectedLanguage}
          onChange={setSourceLang}
          compact
        />

        {/* Quick test chips */}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {QUICK_SAMPLE_CHIPS.map((sample) => (
            <button
              key={sample.text}
              type="button"
              onClick={() => {
                setSourceLang(sample.lang);
                setInputText(sample.text);
                runTranslate(sample.text, sample.lang);
              }}
              className="shrink-0 px-2.5 py-1 rounded-lg lf-elevated text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              {LANGUAGE_REGISTRY[sample.lang].shortLabelVi}: {sample.text.slice(0, 16)}…
            </button>
          ))}
        </div>

        <div className="relative">
          <textarea
            rows={3}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Nhập hoặc nói một câu tiếng Hàn, Nhật, Trung…"
            className="w-full p-3.5 pr-12 rounded-2xl lf-elevated text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent-primary)] resize-none"
          />
          <button
            type="button"
            onClick={toggleVoiceShortCapture}
            aria-label={recording ? 'Dừng nghe' : 'Nói một câu ngắn'}
            className={`absolute right-2.5 bottom-3 w-9 h-9 rounded-xl inline-flex items-center justify-center cursor-pointer ${
              recording
                ? 'bg-red-600 text-white animate-pulse'
                : 'lf-surface text-[var(--accent-primary)]'
            }`}
          >
            {recording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
        </div>

        <button
          type="button"
          disabled={!inputText.trim() || translating}
          onClick={() => runTranslate()}
          className="w-full min-h-[46px] rounded-2xl lf-brand-gradient text-white text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-45 cursor-pointer"
        >
          <Sparkles className="w-4 h-4" />
          <span>{translating ? 'Đang dịch…' : 'Dịch sang Tiếng Việt'}</span>
        </button>

        {result && result.translatedText && (
          <div className="rounded-2xl lf-elevated p-4 space-y-3">
            <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
              <span>
                Đã nhận diện: <strong>{LANGUAGE_REGISTRY[result.detectedLanguage].nameVi}</strong> → Tiếng Việt
              </span>
              <span className="font-mono">{result.latencyMs}ms</span>
            </div>

            <div className="text-base font-bold text-[var(--text-primary)] leading-snug">
              {result.translatedText}
            </div>

            {result.explanationVi && (
              <div className="text-xs text-[var(--accent-flow)]">{result.explanationVi}</div>
            )}

            {/* Word-by-word lookup chips */}
            {result.tokens.length > 0 && (
              <div className="space-y-1 pt-1">
                <div className="text-[11px] text-[var(--text-secondary)]">
                  Chạm từ để tra cứu phiên âm & nghĩa:
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {result.tokens.map((tok, idx) => (
                    <button
                      key={`${tok.surface}-${idx}`}
                      type="button"
                      onClick={() => openWordLookup(tok.surface, result.detectedLanguage, inputText)}
                      className="px-2 py-1 rounded-lg lf-surface text-xs font-medium text-[var(--text-primary)] hover:border-[var(--accent-primary)] cursor-pointer"
                    >
                      <span>{tok.surface}</span>
                      {tok.reading && (
                        <span className="ml-1 text-[10px] text-[var(--text-secondary)]">
                          {tok.reading.split(' ')[0]}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 pt-2 border-t border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(result.translatedText);
                  showToast('Đã sao chép bản dịch', 'success');
                }}
                className="min-h-[38px] px-3 rounded-xl lf-surface text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Sao chép</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  savePhraseFromSegment({
                    id: `seg-${Date.now()}`,
                    sessionId: 'quick-translate',
                    startTimestamp: 0,
                    endTimestamp: 2000,
                    sourceText: inputText,
                    translatedText: result.translatedText,
                    recognitionStatus: 'confirmed',
                    translationStatus: 'completed',
                    confidence: result.confidence,
                    detectedLanguage: result.detectedLanguage,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                  })
                }
                className="min-h-[38px] px-3 rounded-xl lf-surface text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Bookmark className="w-3.5 h-3.5" />
                <span>Lưu câu</span>
              </button>

              {capabilities.supportsSpeechSynthesis && (
                <button
                  type="button"
                  onClick={() => speakVietnamese(result.translatedText)}
                  className="min-h-[38px] px-3 rounded-xl lf-surface text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>Đọc tiếng Việt</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </BottomSheet>
  );
};
