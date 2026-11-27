import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bookmark,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Languages,
  Layers,
  List,
  Maximize2,
  Mic,
  Minimize2,
  MonitorSpeaker,
  Pause,
  Play,
  RotateCcw,
  Send,
  SlidersHorizontal,
  Sparkles,
  Square,
} from 'lucide-react';
import { useLinguaFlow } from '../context/LinguaFlowContext';
import { LiveAudioPipeline } from '../core/audio/audioPipeline';
import { LANGUAGE_REGISTRY } from '../core/languages/languageRegistry';
import { BUILTIN_QA_STREAMS } from '../core/media/sampleMedia';
import { translationClient } from '../core/network/translationClient';
import { LinguaFlowNative } from '../core/platform/platformDetector';
import { formatMsToReadableClock } from '../core/subtitles/subtitleParser';
import type {
  AudioSourceType,
  ConcreteLanguageCode,
  SessionStatus,
  SourceLanguageCode,
  TranscriptSegment,
  TranslationStyleMode,
} from '../types/domain';
import { DraggableSubtitleBox } from '../components/subtitle/DraggableSubtitleBox';
import { QuickSubtitleSheet } from '../components/subtitle/QuickSubtitleSheet';
import {
  ConfirmDialog,
  ErrorRecoveryBanner,
  LanguageSelectorPills,
  LiveWaveformMeter,
  SessionStatusBadge,
} from '../components/ui/DesignSystem';

export const LiveTranslationView: React.FC<{
  initialMode?: 'livestream' | 'microphone';
}> = ({ initialMode = 'livestream' }) => {
  const {
    settings,
    capabilities,
    presets,
    activePreset,
    setActivePresetId,
    updateActivePresetLive,
    resetActivePresetToDefault,
    activeLayout,
    dictionary,
    upsertSession,
    savePhraseFromSegment,
    openWordLookup,
    setActiveTab,
    setLiveRunningIndicator,
    setGlobalSubtitleFeed,
    liveQuickCommand,
    showToast,
    haptic,
  } = useLinguaFlow();

  const [mode, setMode] = useState<'livestream' | 'microphone'>(initialMode);
  const [audioSource, setAudioSource] = useState<AudioSourceType>(() =>
    initialMode === 'microphone' ? 'microphone' : 'qa-test-stream'
  );
  const [selectedQaStreamId, setSelectedQaStreamId] = useState<string>(BUILTIN_QA_STREAMS[0].id);

  const [sourceLang, setSourceLang] = useState<SourceLanguageCode>(settings.defaultSourceLanguage);
  const [detectedLang, setDetectedLang] = useState<ConcreteLanguageCode | undefined>(undefined);
  const [styleMode, setStyleMode] = useState<TranslationStyleMode>(settings.defaultTranslationStyle);
  const [useDictionary, setUseDictionary] = useState<boolean>(settings.dictionaryEnabledByDefault);
  const [showAdvancedSetup, setShowAdvancedSetup] = useState(false);

  // Active session states
  const [status, setStatus] = useState<SessionStatus>('idle');
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [interimSource, setInterimSource] = useState('');
  const [interimTranslated, setInterimTranslated] = useState('');
  const [waveformBands, setWaveformBands] = useState<number[]>(new Array(12).fill(0));
  const [lastLatencyMs, setLastLatencyMs] = useState<number>(0);
  const [warningMsg, setWarningMsg] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<{
    message: string;
    fallback?: AudioSourceType;
  } | null>(null);

  // UI view controls
  const [minimalMode, setMinimalMode] = useState(false);
  const [subtitleHidden, setSubtitleHidden] = useState(false);
  const [quickPanelOpen, setQuickPanelOpen] = useState(false);
  const [isDraggingSub, setIsDraggingSub] = useState(false);
  const [confirmEndOpen, setConfirmEndOpen] = useState(false);
  const [showTranscriptDrawer, setShowTranscriptDrawer] = useState(false);
  const [floatingPreviewMinimized, setFloatingPreviewMinimized] = useState(false);
  const [floatingModeActive, setFloatingModeActive] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [speakerLabels, setSpeakerLabels] = useState<Record<string, string>>({
    'speaker-1': 'Người nói 1',
    'speaker-2': 'Người nói 2',
  });
  const [permissionNoticeSource, setPermissionNoticeSource] = useState<AudioSourceType | null>(null);

  const pipelineRef = useRef<LiveAudioPipeline | null>(null);
  const sessionIdRef = useRef<string>(`live-${Date.now()}`);
  const sessionStartedAtRef = useRef<number>(0);
  const segmentsRef = useRef<TranscriptSegment[]>([]);
  segmentsRef.current = segments;

  useEffect(() => {
    setMode(initialMode);
    if (initialMode === 'microphone') {
      setAudioSource('microphone');
    }
  }, [initialMode]);

  // Monitor online/offline transitions cleanly (Scenario 8)
  useEffect(() => {
    const onOffline = () => {
      if (pipelineRef.current?.isActive()) {
        setStatus('offline');
        setWarningMsg('Kết nối mạng bị gián đoạn — hệ thống sẽ tự phục hồi ngay khi có mạng lại.');
      }
    };
    const onOnline = () => {
      if (pipelineRef.current?.isActive()) {
        setStatus(pipelineRef.current.isPaused() ? 'paused' : 'listening');
        setWarningMsg(null);
        showToast('Đã khôi phục kết nối mạng', 'success');
      }
    };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, [showToast]);

  // Clean up microphone / streams strictly on unmount (Rule 14)
  useEffect(() => {
    return () => {
      pipelineRef.current?.stop();
      setLiveRunningIndicator((prev) => ({ ...prev, isRunning: false }));
    };
  }, [setLiveRunningIndicator]);

  const activeGlossary = useMemo(
    () => (useDictionary ? dictionary : []),
    [dictionary, useDictionary]
  );

  const translateIncoming = useCallback(
    async (
      rawText: string,
      isInterim: boolean,
      startMs = 0,
      endMs = 1500,
      speakerId = 'speaker-1'
    ) => {
      const trimmed = rawText.trim();
      if (!trimmed) return;

      if (isInterim && /^Đang nghe/.test(trimmed)) {
        setInterimSource('');
        setInterimTranslated(trimmed);
        setGlobalSubtitleFeed({
          sourceText: '',
          translatedText: trimmed,
          isPartial: true,
          statusLabel: 'Đang tách lời thoại',
        });
        return;
      }

      if (isInterim && activePreset.segmentationMode === 'sentence-complete') {
        // In sentence-complete mode, hold off showing partial words until confirmed
        setInterimSource(trimmed);
        return;
      }

      if (!isInterim) {
        setStatus('translating');
      }

      try {
        const contextTurns = segmentsRef.current.slice(-6).map((s) => ({
          sourceText: s.sourceText,
          translatedText: s.translatedText,
          speakerId: s.speakerId,
        }));

        const res = await translationClient.translateStream({
          text: trimmed,
          sourceLanguage: sourceLang,
          styleMode,
          naturalnessLevel: settings.naturalnessLevel,
          properNounMode: settings.properNounMode,
          preferredProvider: settings.preferredProvider,
          costTier: settings.costQualityTier,
          contextTurns,
          glossary: activeGlossary,
          previousDetectedLanguage: detectedLang,
          isInterim,
        });

        setLastLatencyMs(res.latencyMs);
        setDetectedLang(res.detectedLanguage);

        if (floatingModeActive && capabilities.supportsAndroidFloatingOverlay) {
          LinguaFlowNative.updateFloatingSubtitle?.({
            translatedText: res.translatedText,
            sourceText: activePreset.subtitleMode === 'bilingual' ? trimmed : '',
            isInterim,
          }).catch(() => {});
        }

        if (isInterim) {
          setInterimSource(trimmed);
          setInterimTranslated(res.translatedText);
          setGlobalSubtitleFeed({
            sourceText: trimmed,
            translatedText: res.translatedText,
            isPartial: true,
            statusLabel: 'Đang dịch trực tiếp',
          });
        } else {
          setInterimSource('');
          setInterimTranslated('');
          setGlobalSubtitleFeed({
            sourceText: trimmed,
            translatedText: res.translatedText,
            isPartial: false,
            statusLabel: 'Đang nghe trực tiếp',
          });
          const seg: TranscriptSegment = {
            id: `seg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            sessionId: sessionIdRef.current,
            startTimestamp: startMs,
            endTimestamp: endMs,
            sourceText: trimmed,
            translatedText: res.translatedText,
            speakerId,
            recognitionStatus: 'confirmed',
            translationStatus: res.confidence < 0.66 ? 'uncertain' : 'completed',
            confidence: res.confidence,
            detectedLanguage: res.detectedLanguage,
            tokens: res.tokens,
            explanationVi: res.explanationVi,
            latencyMs: res.latencyMs,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          setSegments((prev) => {
            const next = [...prev, seg];
            return next;
          });
          setStatus(pipelineRef.current?.isPaused() ? 'paused' : 'listening');
        }
      } catch (err) {
        if (!isInterim) {
          const isOffline =
            (err instanceof Error && err.message === 'OFFLINE_NETWORK') ||
            (typeof navigator !== 'undefined' && !navigator.onLine);
          setStatus(isOffline ? 'offline' : 'listening');
          setWarningMsg(
            isOffline
              ? 'Mất kết nối mạng — đang tạm giữ câu thoại để thử lại.'
              : 'Dịch vụ dịch phản hồi chậm — đang tự động thử lại.'
          );
        }
      }
    },
    [
      activeGlossary,
      activePreset.segmentationMode,
      activePreset.subtitleMode,
      capabilities.supportsAndroidFloatingOverlay,
      detectedLang,
      floatingModeActive,
      settings.costQualityTier,
      settings.naturalnessLevel,
      settings.preferredProvider,
      settings.properNounMode,
      setGlobalSubtitleFeed,
      sourceLang,
      styleMode,
    ]
  );

  const executeStartSession = async (chosenSource: AudioSourceType) => {
    setPermissionNoticeSource(null);
    setErrorBanner(null);
    setWarningMsg(null);
    setSegments([]);
    setInterimSource('');
    setInterimTranslated('');
    translationClient.resetSessionContext();

    sessionIdRef.current = `live-${Date.now()}`;
    sessionStartedAtRef.current = Date.now();

    if (chosenSource === 'qa-test-stream') {
      const qa = BUILTIN_QA_STREAMS.find((s) => s.id === selectedQaStreamId);
      if (qa) {
        setSpeakerLabels(qa.speakerNames);
      }
    }

    const pipeline = new LiveAudioPipeline();
    pipelineRef.current = pipeline;

    setLiveRunningIndicator({
      isRunning: true,
      modeLabel: mode === 'microphone' ? 'Micro trực tiếp' : 'Livestream',
      sourceLang,
    });

    await pipeline.start({
      audioSource: chosenSource,
      sourceLanguage: sourceLang,
      noiseSuppression: settings.noiseSuppression,
      autoGainControl: settings.autoGainControl,
      micSensitivity: settings.micSensitivity,
      qaStreamId: selectedQaStreamId,
      callbacks: {
        onStatusChange: (s) => setStatus(s),
        onWaveformUpdate: (_rms, bands) => setWaveformBands(bands),
        onInterimTranscript: (txt, spk) => {
          setInterimSource(txt);
          translateIncoming(txt, true, 0, 0, spk);
        },
        onFinalTranscript: (txt, startMs, endMs, spk) => {
          translateIncoming(txt, false, startMs, endMs, spk);
        },
        onWarning: (msg) => setWarningMsg(msg),
        onError: (msg, fallback) => {
          setErrorBanner({ message: msg, fallback });
          setLiveRunningIndicator((prev) => ({ ...prev, isRunning: false }));
        },
      },
    });
  };

  const handleRequestStart = () => {
    haptic(12);
    // Contextual Permission Explanation BEFORE browser/OS permission dialog (Section 6.1)
    if (audioSource === 'microphone' || audioSource === 'display-audio') {
      setPermissionNoticeSource(audioSource);
      return;
    }
    executeStartSession(audioSource);
  };

  const handleTogglePause = () => {
    const pipe = pipelineRef.current;
    if (!pipe || !pipe.isActive()) return;
    haptic(10);
    if (pipe.isPaused()) {
      pipe.resume(sourceLang, {
        onStatusChange: setStatus,
        onWaveformUpdate: (_r, b) => setWaveformBands(b),
        onInterimTranscript: () => {},
        onFinalTranscript: () => {},
        onWarning: setWarningMsg,
        onError: (message, fallback) => setErrorBanner({ message, fallback }),
      });
    } else {
      pipe.pause({
        onStatusChange: setStatus,
        onWaveformUpdate: (_r, b) => setWaveformBands(b),
        onInterimTranscript: () => {},
        onFinalTranscript: () => {},
        onWarning: setWarningMsg,
        onError: (message, fallback) => setErrorBanner({ message, fallback }),
      });
    }
  };

  const handleEndSession = () => {
    pipelineRef.current?.stop();
    if (floatingModeActive && capabilities.supportsAndroidFloatingOverlay) {
      LinguaFlowNative.stopFloatingOverlay?.().catch(() => {});
    }
    setFloatingModeActive(false);
    setWaveformBands(new Array(12).fill(0));
    setInterimSource('');
    setInterimTranslated('');
    setStatus('completed');
    setLiveRunningIndicator((prev) => ({ ...prev, isRunning: false }));
    setGlobalSubtitleFeed((prev) => ({
      ...prev,
      isPartial: false,
      statusLabel: 'Đã dừng',
    }));

    const endedAt = Date.now();
    const durationMs = Math.max(1000, endedAt - sessionStartedAtRef.current);

    if (segmentsRef.current.length > 0) {
      const langLabel = LANGUAGE_REGISTRY[detectedLang ?? sourceLang].shortLabelVi;
      upsertSession({
        id: sessionIdRef.current,
        title: `${mode === 'microphone' ? 'Nghe Micro' : 'Livestream'} (${langLabel} → Việt)`,
        sourceLanguage: sourceLang,
        detectedLanguage: detectedLang,
        targetLanguage: 'vi',
        sourceType: mode,
        createdAt: sessionStartedAtRef.current,
        startedAt: sessionStartedAtRef.current,
        endedAt,
        durationMs,
        sessionStatus: 'completed',
        subtitlePresetId: activePreset.id,
        translationMode: styleMode,
        naturalnessLevel: settings.naturalnessLevel,
        audioSource,
        transcriptSegments: segmentsRef.current,
        speakerLabels,
        dictionaryEnabled: useDictionary,
        privacySettings: {
          saveHistory: settings.saveHistory,
          saveTranscript: settings.saveTranscript,
          saveRawAudio: false,
        },
      });
      showToast('Đã kết thúc phiên, tắt thu âm và lưu Transcript', 'success');
    } else {
      showToast('Đã kết thúc phiên và ngắt nguồn âm thanh', 'info');
    }
  };

  const handleManualUtteranceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const txt = manualInput.trim();
    if (!txt) return;
    setManualInput('');
    const relNow = sessionStartedAtRef.current ? Date.now() - sessionStartedAtRef.current : 0;
    await translateIncoming(txt, false, relNow, relNow + 2500, 'speaker-1');
  };

  // Respond to 1-tap start/pause/stop actions dispatched from the Global Floating Bubble
  const lastHandledCmdRef = useRef<number>(0);
  useEffect(() => {
    if (!liveQuickCommand || liveQuickCommand.nonce === lastHandledCmdRef.current) return;
    lastHandledCmdRef.current = liveQuickCommand.nonce;

    if (liveQuickCommand.action === 'start-tab') {
      setMode('livestream');
      setAudioSource('display-audio');
      executeStartSession('display-audio');
    } else if (liveQuickCommand.action === 'start-mic') {
      setMode('microphone');
      setAudioSource('microphone');
      executeStartSession('microphone');
    } else if (liveQuickCommand.action === 'toggle-pause') {
      handleTogglePause();
    } else if (liveQuickCommand.action === 'stop') {
      handleEndSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveQuickCommand]);

  const isRunning =
    status === 'connecting' ||
    status === 'listening' ||
    status === 'recognizing' ||
    status === 'translating' ||
    status === 'syncing' ||
    status === 'paused' ||
    status === 'offline';

  const latestConfirmed = segments[segments.length - 1];
  const activeSourceLine = interimSource || latestConfirmed?.sourceText || '';
  const activeViLine =
    interimTranslated ||
    (latestConfirmed
      ? latestConfirmed.isUserEdited && latestConfirmed.userEditedText
        ? latestConfirmed.userEditedText
        : latestConfirmed.translatedText
      : 'Đang chờ lời nói tiếng Hàn, Nhật hoặc Trung…');
  const activeSpeaker =
    !interimSource && latestConfirmed?.speakerId
      ? speakerLabels[latestConfirmed.speakerId] ?? latestConfirmed.speakerId
      : undefined;

  return (
    <div className="space-y-4 pb-8">
      {/* Mode Switcher Header */}
      {!minimalMode && (
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex rounded-2xl lf-elevated p-1">
            <button
              type="button"
              onClick={() => {
                setMode('livestream');
              }}
              className={`min-h-[38px] px-3.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer ${
                mode === 'livestream'
                  ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs'
                  : 'text-[var(--text-secondary)]'
              }`}
            >
              <MonitorSpeaker className="w-3.5 h-3.5" />
              <span>Livestream</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('microphone');
                if (!isRunning) setAudioSource('microphone');
              }}
              className={`min-h-[38px] px-3.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer ${
                mode === 'microphone'
                  ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs'
                  : 'text-[var(--text-secondary)]'
              }`}
            >
              <Mic className="w-3.5 h-3.5" />
              <span>Nghe Micro</span>
            </button>
          </div>

          <SessionStatusBadge status={status} latencyMs={lastLatencyMs} />
        </div>
      )}

      {errorBanner && (
        <ErrorRecoveryBanner
          message={errorBanner.message}
          fallbackLabel={
            errorBanner.fallback === 'microphone'
              ? 'Chuyển sang Nghe bằng Micro'
              : errorBanner.fallback === 'qa-test-stream'
              ? 'Chạy Luồng kiểm thử QA'
              : undefined
          }
          onFallback={
            errorBanner.fallback
              ? () => {
                  const fb = errorBanner.fallback!;
                  setAudioSource(fb);
                  setErrorBanner(null);
                  executeStartSession(fb);
                }
              : undefined
          }
          onDismiss={() => setErrorBanner(null)}
        />
      )}

      {warningMsg && (
        <ErrorRecoveryBanner message={warningMsg} onDismiss={() => setWarningMsg(null)} />
      )}

      {/* PRE-START COMPACT SETUP (Section 9.1) */}
      {!isRunning && (
        <section className="rounded-3xl lf-surface p-5 space-y-4">
          {/* Audio Source */}
          <div className="space-y-2">
            <div className="text-xs font-bold text-[var(--text-secondary)]">Nguồn nghe</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAudioSource('microphone')}
                className={`min-h-[48px] px-3.5 rounded-2xl text-left text-xs font-semibold border flex items-center gap-2.5 cursor-pointer ${
                  audioSource === 'microphone'
                    ? 'bg-[var(--accent-primary-soft)] border-[var(--accent-primary)] text-[var(--text-primary)]'
                    : 'lf-elevated border-transparent text-[var(--text-primary)]'
                }`}
              >
                <Mic className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
                <div>
                  <div>Microphone trực tiếp</div>
                  <div className="text-[10px] text-[var(--text-secondary)]">
                    Hoạt động trên mọi điện thoại & nguồn phát ngoài
                  </div>
                </div>
              </button>

              {capabilities.supportsDisplayAudioCapture && mode === 'livestream' && (
                <button
                  type="button"
                  onClick={() => setAudioSource('display-audio')}
                  className={`min-h-[48px] px-3.5 rounded-2xl text-left text-xs font-semibold border flex items-center gap-2.5 cursor-pointer ${
                    audioSource === 'display-audio'
                      ? 'bg-[var(--accent-primary-soft)] border-[var(--accent-primary)] text-[var(--text-primary)]'
                      : 'lf-elevated border-transparent text-[var(--text-primary)]'
                  }`}
                >
                  <MonitorSpeaker className="w-4 h-4 text-[var(--accent-flow)] shrink-0" />
                  <div>
                    <div>Âm thanh Tab / Màn hình</div>
                    <div className="text-[10px] text-[var(--text-secondary)]">
                      Chia sẻ tab livestream đang mở
                    </div>
                  </div>
                </button>
              )}

              <button
                type="button"
                onClick={() => setAudioSource('qa-test-stream')}
                className={`min-h-[48px] px-3.5 rounded-2xl text-left text-xs font-semibold border flex items-center gap-2.5 cursor-pointer ${
                  audioSource === 'qa-test-stream'
                    ? 'bg-[var(--accent-primary-soft)] border-[var(--accent-primary)] text-[var(--text-primary)]'
                    : 'lf-elevated border-transparent text-[var(--text-primary)]'
                }`}
              >
                <Sparkles className="w-4 h-4 text-indigo-500 shrink-0" />
                <div>
                  <div>Luồng kiểm thử QA (Hàn/Nhật/Trung)</div>
                  <div className="text-[10px] text-[var(--text-secondary)]">
                    Kiểm tra pipeline trực tiếp ngay lập tức
                  </div>
                </div>
              </button>
            </div>

            {audioSource === 'qa-test-stream' && (
              <div className="flex gap-1.5 overflow-x-auto pt-1">
                {BUILTIN_QA_STREAMS.map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => {
                      setSelectedQaStreamId(st.id);
                      setSourceLang(st.language);
                    }}
                    className={`shrink-0 min-h-[36px] px-3 rounded-xl text-xs font-semibold cursor-pointer ${
                      selectedQaStreamId === st.id
                        ? 'bg-[var(--accent-primary)] text-white'
                        : 'lf-elevated text-[var(--text-secondary)]'
                    }`}
                  >
                    {st.badgeLabel}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Language Pair */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-[var(--text-secondary)]">Ngôn ngữ nguồn</span>
              <span className="font-semibold text-[var(--accent-primary)]">Đích: Tiếng Việt</span>
            </div>
            <LanguageSelectorPills
              value={sourceLang}
              detectedLanguage={detectedLang}
              onChange={setSourceLang}
              compact
            />
          </div>

          {/* Expandable Advanced Options */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvancedSetup((v) => !v)}
              className="text-xs font-semibold text-[var(--text-secondary)] inline-flex items-center gap-1 cursor-pointer hover:text-[var(--text-primary)]"
            >
              <span>Kiểu dịch & Mẫu phụ đề ({activePreset.name})</span>
              {showAdvancedSetup ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>

            {showAdvancedSetup && (
              <div className="mt-3 pt-3 border-t border-[var(--border-subtle)] space-y-3">
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-[var(--text-secondary)]">
                    Kiểu bản dịch
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(
                      [
                        ['natural', 'Tự nhiên'],
                        ['literal', 'Sát nghĩa'],
                        ['easy', 'Dễ hiểu'],
                        ['conversational', 'Hội thoại'],
                        ['entertainment', 'Giải trí'],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setStyleMode(id)}
                        className={`min-h-[36px] px-3 rounded-xl text-xs font-semibold cursor-pointer ${
                          styleMode === id
                            ? 'bg-[var(--accent-primary)] text-white'
                            : 'lf-elevated text-[var(--text-primary)]'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-[var(--text-secondary)]">
                    Mẫu phụ đề
                  </div>
                  <div className="flex gap-1.5 overflow-x-auto pb-1">
                    {presets.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setActivePresetId(p.id)}
                        className={`shrink-0 min-h-[36px] px-3 rounded-xl text-xs font-semibold cursor-pointer ${
                          p.id === activePreset.id
                            ? 'bg-[var(--accent-primary)] text-white'
                            : 'lf-elevated text-[var(--text-primary)]'
                        }`}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="inline-flex items-center gap-2 text-xs font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useDictionary}
                    onChange={(e) => setUseDictionary(e.target.checked)}
                    className="rounded accent-[var(--accent-primary)]"
                  />
                  <span>Áp dụng Từ điển cá nhân ({dictionary.length} mục)</span>
                </label>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleRequestStart}
            className="w-full min-h-[54px] rounded-2xl lf-brand-gradient text-white font-bold text-[15px] shadow-md inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <Play className="w-5 h-5 fill-current" />
            <span>Bắt đầu nghe & dịch</span>
          </button>
        </section>
      )}

      {/* ACTIVE TRANSLATION STAGE (Section 9.2 & Section 50.2 — Subtitle is the hero!) */}
      {(isRunning || segments.length > 0) && (
        <section className="space-y-3">
          {/* Main Live Subtitle Stage */}
          <div
            className={`relative w-full ${
              minimalMode ? 'h-[68vh]' : 'h-[360px] sm:h-[400px]'
            } rounded-3xl overflow-hidden bg-gradient-to-b from-[#0E1420] via-[#111827] to-[#090D14] border border-white/10 shadow-xl`}
          >
            {/* Top HUD bar inside stage */}
            <div className="absolute top-3 inset-x-3 z-20 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 bg-black/45 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/10">
                <LiveWaveformMeter
                  bands={waveformBands}
                  active={isRunning && status !== 'paused'}
                />
                {detectedLang && (
                  <span className="text-[11px] font-semibold text-sky-200 pr-1">
                    Đã nhận diện: {LANGUAGE_REGISTRY[detectedLang].shortLabelVi} → Việt
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                {/* Simulated / Native Floating Overlay Window toggle */}
                <button
                  type="button"
                  onClick={() => {
                    setFloatingModeActive((v) => !v);
                    setFloatingPreviewMinimized(false);
                  }}
                  title="Chế độ cửa sổ phụ đề nổi"
                  className={`h-8 px-2.5 rounded-full text-[11px] font-semibold backdrop-blur-md border inline-flex items-center gap-1 cursor-pointer ${
                    floatingModeActive
                      ? 'bg-sky-500/30 text-sky-100 border-sky-400/50'
                      : 'bg-black/45 text-slate-200 border-white/10'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Phụ đề nổi</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMinimalMode((v) => !v)}
                  aria-label={minimalMode ? 'Thoát chế độ tối giản' : 'Chế độ hiển thị tối giản'}
                  className="w-8 h-8 rounded-full bg-black/45 text-slate-200 border border-white/10 inline-flex items-center justify-center cursor-pointer"
                >
                  {minimalMode ? (
                    <Minimize2 className="w-3.5 h-3.5" />
                  ) : (
                    <Maximize2 className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            {/* Subtle background context transcript lines (last 2 previous confirmed lines) */}
            {!minimalMode &&
              !floatingModeActive &&
              activeLayout.widgets.find((w) => w.id === 'mini-transcript')?.visible !== false &&
              segments.length > 1 && (
                <div className="absolute top-14 inset-x-5 z-10 space-y-1.5 pointer-events-none opacity-55">
                  {segments.slice(-3, -1).map((prevSeg) => (
                    <div key={prevSeg.id} className="text-xs text-slate-300 truncate">
                      {prevSeg.translatedText}
                    </div>
                  ))}
                </div>
              )}

            {/* Floating Subtitle Mini-Pill when minimized (Section 6.1) */}
            {floatingModeActive && floatingPreviewMinimized ? (
              <button
                type="button"
                onClick={() => setFloatingPreviewMinimized(false)}
                className="absolute bottom-6 right-5 z-30 h-12 px-4 rounded-full lf-brand-gradient text-white text-xs font-bold shadow-2xl inline-flex items-center gap-2 cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>Mở lại phụ đề nổi</span>
              </button>
            ) : (
              <DraggableSubtitleBox
                preset={activePreset}
                sourceText={activeSourceLine}
                translatedText={activeViLine}
                speakerLabel={activeSpeaker}
                isInterim={Boolean(interimSource)}
                isUncertain={
                  !interimSource && Boolean(latestConfirmed && latestConfirmed.confidence < 0.66)
                }
                uncertainReason={
                  latestConfirmed && latestConfirmed.confidence < 0.66
                    ? 'Độ tin cậy nhận diện thấp — chạm để đối chiếu câu gốc'
                    : undefined
                }
                sourceLanguage={detectedLang ?? sourceLang}
                tokens={!interimSource ? latestConfirmed?.tokens : undefined}
                hidden={subtitleHidden}
                draggable
                onDragStateChange={setIsDraggingSub}
                onUpdatePosition={(patch) => updateActivePresetLive(patch)}
                onTapWord={(term, ctxSentence) =>
                  openWordLookup(term, detectedLang ?? sourceLang, ctxSentence)
                }
              />
            )}

            {/* Floating Overlay quick mini bar when active */}
            {floatingModeActive && !floatingPreviewMinimized && (
              <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900/90 border border-sky-400/30 text-[11px] text-sky-200">
                <span>Kéo khung phụ đề tới vị trí bất kỳ</span>
                <button
                  type="button"
                  onClick={() => setFloatingPreviewMinimized(true)}
                  className="underline font-semibold cursor-pointer"
                >
                  Thu gọn icon
                </button>
              </div>
            )}
          </div>

          {/* ONE-HANDED CONTROL BAR (Section 9.2 & Section 20 — Safe spacing away from End button!) */}
          <div className="rounded-3xl lf-surface p-3 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              {isRunning && (
                <button
                  type="button"
                  onClick={handleTogglePause}
                  className={`min-h-[46px] px-4 rounded-2xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer ${
                    status === 'paused'
                      ? 'bg-[var(--accent-primary)] text-white'
                      : 'lf-elevated text-[var(--text-primary)]'
                  }`}
                >
                  {status === 'paused' ? (
                    <>
                      <Play className="w-4 h-4 fill-current" />
                      <span>Tiếp tục</span>
                    </>
                  ) : (
                    <>
                      <Pause className="w-4 h-4" />
                      <span>Tạm dừng</span>
                    </>
                  )}
                </button>
              )}

              <button
                type="button"
                onClick={() => setQuickPanelOpen(true)}
                className="min-h-[46px] px-3.5 rounded-2xl lf-elevated text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <SlidersHorizontal className="w-4 h-4 text-[var(--accent-primary)]" />
                <span>Phụ đề</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  updateActivePresetLive({
                    subtitleMode:
                      activePreset.subtitleMode === 'bilingual' ? 'vi-only' : 'bilingual',
                  })
                }
                className={`min-h-[46px] px-3.5 rounded-2xl text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
                  activePreset.subtitleMode === 'bilingual'
                    ? 'bg-[var(--accent-primary-soft)] text-[var(--accent-primary)]'
                    : 'lf-elevated text-[var(--text-primary)]'
                }`}
              >
                <Languages className="w-4 h-4" />
                <span>Song ngữ</span>
              </button>

              <button
                type="button"
                onClick={() => setSubtitleHidden((h) => !h)}
                aria-label={subtitleHidden ? 'Hiện phụ đề' : 'Ẩn phụ đề'}
                className="min-h-[46px] px-3 rounded-2xl lf-elevated text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
              >
                {subtitleHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </button>

              <button
                type="button"
                onClick={() => setShowTranscriptDrawer((v) => !v)}
                className="min-h-[46px] px-3 rounded-2xl lf-elevated text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <List className="w-4 h-4" />
                <span>{segments.length}</span>
              </button>

              <button
                type="button"
                onClick={resetActivePresetToDefault}
                title="Khôi phục cấu hình phụ đề mặc định"
                aria-label="Khôi phục cấu hình phụ đề mặc định"
                className="min-h-[46px] px-3 rounded-2xl lf-elevated text-xs font-semibold inline-flex items-center cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>

            {/* Safe End Button separated on the far right with confirmation modal (Section 20) */}
            {isRunning && (
              <button
                type="button"
                onClick={() => setConfirmEndOpen(true)}
                className="min-h-[46px] px-4 rounded-2xl bg-red-600/12 text-red-600 dark:text-red-400 border border-red-500/30 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Kết thúc</span>
              </button>
            )}
          </div>

          {/* Direct Live Utterance Input (Test any arbitrary KR/JP/ZH sentence into the live session!) */}
          {!minimalMode && (
            <form onSubmit={handleManualUtteranceSubmit} className="flex items-center gap-2">
              <input
                type="text"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                placeholder="Gửi nhanh câu thoại Hàn / Nhật / Trung vào phiên trực tiếp…"
                className="flex-1 min-h-[44px] px-4 rounded-2xl lf-surface text-xs text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent-primary)]"
              />
              <button
                type="submit"
                disabled={!manualInput.trim()}
                aria-label="Dịch câu vừa nhập"
                className="min-h-[44px] px-4 rounded-2xl bg-[var(--accent-primary)] disabled:opacity-40 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Dịch</span>
              </button>
            </form>
          )}

          {/* Collapsible Live Transcript List */}
          {showTranscriptDrawer && segments.length > 0 && (
            <div className="rounded-3xl lf-surface p-4 space-y-2.5 max-h-72 overflow-y-auto">
              <div className="flex items-center justify-between text-xs font-bold text-[var(--text-secondary)]">
                <span>Transcript phiên hiện tại ({segments.length} câu)</span>
                <span>Chạm câu gốc để tra từ</span>
              </div>
              {segments.map((seg) => (
                <div
                  key={seg.id}
                  className="rounded-2xl lf-elevated p-3 flex items-start justify-between gap-2.5"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="text-[11px] text-[var(--text-secondary)] flex items-center gap-2">
                      <span className="font-mono">
                        {formatMsToReadableClock(seg.startTimestamp)}
                      </span>
                      {seg.speakerId && (
                        <button
                          type="button"
                          onClick={() => {
                            const nextName = window.prompt(
                              'Đổi nhãn người nói (không khẳng định danh tính thực):',
                              speakerLabels[seg.speakerId!] ?? 'Người nói 1'
                            );
                            if (nextName?.trim()) {
                              setSpeakerLabels((prev) => ({
                                ...prev,
                                [seg.speakerId!]: nextName.trim(),
                              }));
                            }
                          }}
                          className="px-1.5 py-0.5 rounded bg-[var(--bg-surface)] font-semibold text-[var(--accent-primary)] cursor-pointer"
                        >
                          {speakerLabels[seg.speakerId] ?? seg.speakerId}
                        </button>
                      )}
                    </div>
                    <div className="text-xs text-[var(--text-secondary)] break-words">
                      {seg.tokens && seg.tokens.length > 0
                        ? seg.tokens.map((t, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() =>
                                openWordLookup(t.surface, seg.detectedLanguage, seg.sourceText)
                              }
                              className="hover:underline mr-1 cursor-pointer"
                            >
                              {t.surface}
                            </button>
                          ))
                        : seg.sourceText}
                    </div>
                    <div className="text-sm font-semibold text-[var(--text-primary)] break-words">
                      {seg.translatedText}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      savePhraseFromSegment(
                        seg,
                        sessionIdRef.current,
                        formatMsToReadableClock(seg.startTimestamp)
                      )
                    }
                    aria-label="Lưu câu thoại"
                    className="p-2 rounded-xl lf-surface text-[var(--text-secondary)] hover:text-[var(--accent-primary)] shrink-0 cursor-pointer"
                  >
                    <Bookmark className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Quick Subtitle Panel */}
      <QuickSubtitleSheet
        open={quickPanelOpen}
        onClose={() => setQuickPanelOpen(false)}
        subtitleHidden={subtitleHidden}
        onToggleHidden={() => setSubtitleHidden((v) => !v)}
        sourceLanguage={sourceLang}
        onChangeSourceLanguage={(lang) => {
          setSourceLang(lang);
          pipelineRef.current?.updateRecognitionLanguage(lang);
        }}
        isPaused={status === 'paused'}
        onTogglePause={isRunning ? handleTogglePause : undefined}
        isDraggingSubtitle={isDraggingSub}
        onOpenFullStudio={() => setActiveTab('studio')}
      />

      {/* Contextual Permission Explanation Dialog BEFORE requesting OS/Browser Mic or Screen Audio */}
      <ConfirmDialog
        open={Boolean(permissionNoticeSource)}
        title={
          permissionNoticeSource === 'microphone'
            ? 'Cho phép sử dụng Microphone?'
            : 'Chia sẻ âm thanh Tab / Màn hình?'
        }
        description={
          permissionNoticeSource === 'microphone'
            ? 'SHAPI FLOW cần quyền Micro để nghe và dịch lời nói trực tiếp sang tiếng Việt. Ứng dụng không lưu bản ghi âm cuộc trò chuyện và ngắt Micro ngay khi bạn kết thúc phiên.'
            : 'Trình duyệt sẽ hỏi quyền chia sẻ tab đang phát livestream. Hãy tích chọn "Chia sẻ âm thanh tab" để hệ thống nhận diện lời nói.'
        }
        confirmLabel="Đồng ý & Bắt đầu"
        danger={false}
        onConfirm={() => {
          if (permissionNoticeSource) {
            executeStartSession(permissionNoticeSource);
          }
        }}
        onCancel={() => setPermissionNoticeSource(null)}
      />

      {/* Safe Confirmation before Ending Active Session */}
      <ConfirmDialog
        open={confirmEndOpen}
        title="Kết thúc phiên dịch hiện tại?"
        description="Nguồn thu âm sẽ được đóng ngay lập tức. Bản văn bản đã nhận diện sẽ được lưu vào Lịch sử (nếu bạn đang bật lưu lịch sử)."
        confirmLabel="Kết thúc phiên"
        danger
        onConfirm={handleEndSession}
        onCancel={() => setConfirmEndOpen(false)}
      />
    </div>
  );
};
