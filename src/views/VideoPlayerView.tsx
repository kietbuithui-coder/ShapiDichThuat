import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  ArrowUpRight,
  Bookmark,
  ClipboardPaste,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FastForward,
  FileText,
  Film,
  Globe,
  Link2,
  List,
  Maximize2,
  Mic,
  Minimize2,
  MonitorSpeaker,
  Pause,
  PictureInPicture2,
  Play,
  Rewind,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Square,
  Upload,
} from 'lucide-react';
import { useLinguaFlow } from '../context/LinguaFlowContext';
import { LiveAudioPipeline } from '../core/audio/audioPipeline';
import { BUILTIN_QA_STREAMS, type QATestStreamDefinition } from '../core/media/sampleMedia';
import {
  parseWebVideoUrl,
  SAMPLE_WEB_VIDEO_LINKS,
  type ParsedWebVideoSource,
} from '../core/media/webVideoParser';
import { resolveAutomaticYouTubeSubtitles } from '../core/media/youtubeAutoSubtitles';
import { LANGUAGE_REGISTRY } from '../core/languages/languageRegistry';
import { translationClient } from '../core/network/translationClient';
import { subtitlePipManager } from '../core/pip/subtitlePipManager';
import {
  exportSubtitleSegments,
  findSyncedSegmentAtTime,
  formatMsToReadableClock,
  parseSubtitleFileContent,
} from '../core/subtitles/subtitleParser';
import type {
  AudioSourceType,
  SessionStatus,
  SourceLanguageCode,
  TranscriptSegment,
  TranslationStyleMode,
} from '../types/domain';
import { DraggableSubtitleBox } from '../components/subtitle/DraggableSubtitleBox';
import { QuickSubtitleSheet } from '../components/subtitle/QuickSubtitleSheet';
import {
  ErrorRecoveryBanner,
  LanguageSelectorPills,
  LiveWaveformMeter,
  SessionStatusBadge,
} from '../components/ui/DesignSystem';

interface YTPlayerInstance {
  destroy(): void;
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  setPlaybackRate(rate: number): void;
  getPlayerState(): number;
}

interface YTGlobal {
  Player: new (
    element: HTMLElement | string,
    options: {
      videoId: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (ev: { target: YTPlayerInstance }) => void;
        onStateChange?: (ev: { data: number; target: YTPlayerInstance }) => void;
        onError?: () => void;
      };
    }
  ) => YTPlayerInstance;
}

let ytApiPromise: Promise<YTGlobal> | null = null;

function loadYouTubeIframeApi(): Promise<YTGlobal> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('No window'));
  }
  const win = window as unknown as {
    YT?: YTGlobal;
    onYouTubeIframeAPIReady?: () => void;
  };
  if (win.YT && win.YT.Player) {
    return Promise.resolve(win.YT);
  }
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise<YTGlobal>((resolve, reject) => {
    const prevCallback = win.onYouTubeIframeAPIReady;
    win.onYouTubeIframeAPIReady = () => {
      prevCallback?.();
      if (win.YT && win.YT.Player) {
        resolve(win.YT);
      } else {
        reject(new Error('Không thể khởi tạo YouTube Player API'));
      }
    };

    const existing = document.querySelector('script[src*="youtube.com/iframe_api"]');
    if (!existing) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.async = true;
      tag.onerror = () => {
        ytApiPromise = null;
        reject(new Error('Không tải được trình phát nhúng YouTube'));
      };
      document.head.appendChild(tag);
    }
  });

  return ytApiPromise;
}

export const VideoPlayerView: React.FC = () => {
  const {
    settings,
    capabilities,
    activePreset,
    updateActivePresetLive,
    dictionary,
    upsertSession,
    savePhraseFromSegment,
    openWordLookup,
    pendingWebLink,
    clearPendingWebLink,
    setGlobalSubtitleFeed,
    setLiveRunningIndicator,
    setActiveTab,
    showToast,
    haptic,
  } = useLinguaFlow();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const ytContainerRef = useRef<HTMLDivElement | null>(null);
  const ytPlayerRef = useRef<YTPlayerInstance | null>(null);
  const ytPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const subInputRef = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasAnimRef = useRef<number | null>(null);
  const audioPipelineRef = useRef<LiveAudioPipeline | null>(null);

  const [videoSourceType, setVideoSourceType] = useState<
    'qa-video' | 'local-file' | 'direct-video' | 'web-embed' | 'external-web'
  >('qa-video');
  const [parsedWebSource, setParsedWebSource] = useState<ParsedWebVideoSource | null>(null);
  const [selectedQaId, setSelectedQaId] = useState<string>(BUILTIN_QA_STREAMS[0].id);
  const [videoTitle, setVideoTitle] = useState<string>(BUILTIN_QA_STREAMS[0].title);
  const [localObjectUrl, setLocalObjectUrl] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState('');

  const [sourceLang, setSourceLang] = useState<SourceLanguageCode>(settings.defaultSourceLanguage);
  const [styleMode, setStyleMode] = useState<TranslationStyleMode>(settings.defaultTranslationStyle);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [durationMs, setDurationMs] = useState(BUILTIN_QA_STREAMS[0].durationMs);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [syncOffsetMs, setSyncOffsetMs] = useState<number>(0);
  const [focusMode, setFocusMode] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [subtitleHidden, setSubtitleHidden] = useState(false);
  const [quickSwapOriginal, setQuickSwapOriginal] = useState(false);

  // Live audio speech-to-subtitle state inside Video Player (for YouTube / Web / unsubtitled videos!)
  const [liveAudioActive, setLiveAudioActive] = useState(false);
  const [liveAudioStatus, setLiveAudioStatus] = useState<SessionStatus>('idle');
  const [liveAudioSourceUsed, setLiveAudioSourceUsed] = useState<AudioSourceType | null>(null);
  const [liveAudioWarning, setLiveAudioWarning] = useState<string | null>(null);
  const [liveWaveform, setLiveWaveform] = useState<number[]>(new Array(12).fill(0));
  const [liveOverlayCue, setLiveOverlayCue] = useState<{
    sourceText: string;
    translatedText: string;
    isPartial: boolean;
    detectedLanguage: SourceLanguageCode;
  } | null>(null);

  // Subtitle segments synced to video timeline
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [translatingCue, setTranslatingCue] = useState(false);
  const [autoSubStatus, setAutoSubStatus] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [quickPanelOpen, setQuickPanelOpen] = useState(false);
  const [isDraggingSub, setIsDraggingSub] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);

  const isEmbeddedPreviewIframe = useMemo(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  }, []);

  const qaClockRef = useRef<number>(0);
  const qaTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const generatedNoSubIndexesRef = useRef<Set<number>>(new Set());
  const currentTimeMsRef = useRef<number>(0);
  currentTimeMsRef.current = currentTimeMs;
  const segmentsRef = useRef<TranscriptSegment[]>([]);
  segmentsRef.current = segments;

  const currentQaDef: QATestStreamDefinition | undefined = useMemo(
    () => BUILTIN_QA_STREAMS.find((q) => q.id === selectedQaId),
    [selectedQaId]
  );

  const cleanupHlsAndYouTube = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (ytPollRef.current) {
      clearInterval(ytPollRef.current);
      ytPollRef.current = null;
    }
    if (ytPlayerRef.current) {
      try {
        ytPlayerRef.current.destroy();
      } catch {
        // Ignore
      }
      ytPlayerRef.current = null;
    }
  }, []);

  const stopLiveVideoAudio = useCallback(() => {
    audioPipelineRef.current?.stop();
    setLiveAudioActive(false);
    setLiveAudioStatus('idle');
    setLiveAudioSourceUsed(null);
    setLiveAudioWarning(null);
    setLiveWaveform(new Array(12).fill(0));
    setLiveOverlayCue(null);
    setLiveRunningIndicator((prev) => ({ ...prev, isRunning: false }));
  }, [setLiveRunningIndicator]);

  // Clean up all streams on unmount
  useEffect(() => {
    return () => {
      cleanupHlsAndYouTube();
      audioPipelineRef.current?.stop();
      if (localObjectUrl) URL.revokeObjectURL(localObjectUrl);
    };
  }, [cleanupHlsAndYouTube, localObjectUrl]);

  // Translate an array of raw cues with sliding context
  const translateVideoSegments = useCallback(
    async (rawSegs: TranscriptSegment[], lang: SourceLanguageCode, titleForHistory: string) => {
      if (rawSegs.length === 0) return;
      setTranslatingCue(true);
      try {
        const batch = await translationClient.translateBatch({
          items: rawSegs.map((s) => ({ id: s.id, text: s.sourceText })),
          sourceLanguage: lang,
          styleMode,
          naturalnessLevel: settings.naturalnessLevel,
          properNounMode: settings.properNounMode,
          preferredProvider: settings.preferredProvider,
          glossary: settings.dictionaryEnabledByDefault ? dictionary : [],
        });

        const byId = new Map(batch.map((b) => [b.id, b]));
        const enriched = rawSegs.map((seg) => {
          const hit = byId.get(seg.id);
          if (!hit) return seg;
          return {
            ...seg,
            translatedText: hit.translatedText,
            detectedLanguage: hit.detectedLanguage,
            confidence: hit.confidence,
            tokens: hit.tokens,
            translationStatus: (hit.confidence < 0.66
              ? 'uncertain'
              : 'completed') as TranscriptSegment['translationStatus'],
            updatedAt: Date.now(),
          };
        });

        setSegments(enriched);

        upsertSession({
          id: enriched[0]?.sessionId ?? `vid-${Date.now()}`,
          title: titleForHistory,
          sourceLanguage: lang,
          detectedLanguage: enriched[0]?.detectedLanguage,
          targetLanguage: 'vi',
          sourceType: 'video',
          createdAt: Date.now(),
          startedAt: Date.now(),
          endedAt: Date.now(),
          durationMs: enriched[enriched.length - 1]?.endTimestamp ?? durationMs,
          sessionStatus: 'completed',
          subtitlePresetId: activePreset.id,
          translationMode: styleMode,
          naturalnessLevel: settings.naturalnessLevel,
          audioSource: 'video-element',
          transcriptSegments: enriched,
          speakerLabels: {},
          dictionaryEnabled: settings.dictionaryEnabledByDefault,
          privacySettings: {
            saveHistory: settings.saveHistory,
            saveTranscript: settings.saveTranscript,
            saveRawAudio: false,
          },
        });
      } catch {
        setErrorMsg('Không thể dịch toàn bộ phụ đề video lúc này.');
      } finally {
        setTranslatingCue(false);
      }
    },
    [
      activePreset.id,
      dictionary,
      durationMs,
      settings.dictionaryEnabledByDefault,
      settings.naturalnessLevel,
      settings.preferredProvider,
      settings.properNounMode,
      settings.saveHistory,
      settings.saveTranscript,
      styleMode,
      upsertSession,
    ]
  );

  const loadQaVideo = useCallback(
    (qa: QATestStreamDefinition) => {
      stopLiveVideoAudio();
      cleanupHlsAndYouTube();
      setParsedWebSource(null);
      setErrorMsg(null);
      setIsPlaying(false);
      setVideoSourceType('qa-video');
      setSelectedQaId(qa.id);
      setVideoTitle(qa.title);
      setSourceLang(qa.language);
      setDurationMs(qa.durationMs);
      setCurrentTimeMs(0);
      qaClockRef.current = 0;
      generatedNoSubIndexesRef.current.clear();

      if (qa.hasEmbeddedSubtitles) {
        const parsed = parseSubtitleFileContent(
          qa.sampleSrtContent,
          qa.id === 'qa-zh-stream' ? 'track.ass' : 'track.srt'
        );
        const sessId = `vid-${qa.id}-${Date.now()}`;
        const baseSegs: TranscriptSegment[] = parsed.cues.map((c) => ({
          id: c.id,
          sessionId: sessId,
          startTimestamp: c.startTimestamp,
          endTimestamp: c.endTimestamp,
          sourceText: c.sourceText,
          translatedText: 'Đang dịch…',
          speakerId: c.speakerId,
          recognitionStatus: 'confirmed',
          translationStatus: 'translating',
          confidence: 0.95,
          detectedLanguage: qa.language,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }));
        setSegments(baseSegs);
        translateVideoSegments(baseSegs, qa.language, qa.title);
      } else {
        setSegments([]);
      }
    },
    [cleanupHlsAndYouTube, stopLiveVideoAudio, translateVideoSegments]
  );

  // Progressive Priority Translator: translates first 8 cues immediately (<250ms) so live video shows subtitles right away, then translates the rest in background!
  const translateVideoSegmentsProgressively = useCallback(
    async (rawSegs: TranscriptSegment[], lang: SourceLanguageCode, titleForHistory: string) => {
      if (rawSegs.length === 0) return;
      setTranslatingCue(true);
      try {
        const firstWave = rawSegs.slice(0, 8);
        const restWave = rawSegs.slice(8);

        const firstBatch = await translationClient.translateBatch({
          items: firstWave.map((s) => ({ id: s.id, text: s.sourceText })),
          sourceLanguage: lang,
          styleMode,
          naturalnessLevel: settings.naturalnessLevel,
          properNounMode: settings.properNounMode,
          preferredProvider: settings.preferredProvider,
          glossary: settings.dictionaryEnabledByDefault ? dictionary : [],
        });

        const firstMap = new Map(firstBatch.map((b) => [b.id, b]));
        const partialEnriched = rawSegs.map((seg) => {
          const hit = firstMap.get(seg.id);
          if (!hit) return seg;
          return {
            ...seg,
            translatedText: hit.translatedText,
            detectedLanguage: hit.detectedLanguage,
            confidence: hit.confidence,
            tokens: hit.tokens,
            translationStatus: (hit.confidence < 0.66
              ? 'uncertain'
              : 'completed') as TranscriptSegment['translationStatus'],
            updatedAt: Date.now(),
          };
        });
        setSegments(partialEnriched);

        let finalEnriched = partialEnriched;
        if (restWave.length > 0) {
          const restBatch = await translationClient.translateBatch({
            items: restWave.map((s) => ({ id: s.id, text: s.sourceText })),
            sourceLanguage: lang,
            styleMode,
            naturalnessLevel: settings.naturalnessLevel,
            properNounMode: settings.properNounMode,
            preferredProvider: settings.preferredProvider,
            glossary: settings.dictionaryEnabledByDefault ? dictionary : [],
          });
          const restMap = new Map(restBatch.map((b) => [b.id, b]));
          finalEnriched = partialEnriched.map((seg) => {
            const hit = restMap.get(seg.id);
            if (!hit) return seg;
            return {
              ...seg,
              translatedText: hit.translatedText,
              detectedLanguage: hit.detectedLanguage,
              confidence: hit.confidence,
              tokens: hit.tokens,
              translationStatus: (hit.confidence < 0.66
                ? 'uncertain'
                : 'completed') as TranscriptSegment['translationStatus'],
              updatedAt: Date.now(),
            };
          });
          setSegments(finalEnriched);
        }

        upsertSession({
          id: finalEnriched[0]?.sessionId ?? `vid-${Date.now()}`,
          title: titleForHistory,
          sourceLanguage: lang,
          detectedLanguage: finalEnriched[0]?.detectedLanguage,
          targetLanguage: 'vi',
          sourceType: 'video',
          createdAt: Date.now(),
          startedAt: Date.now(),
          endedAt: Date.now(),
          durationMs: finalEnriched[finalEnriched.length - 1]?.endTimestamp ?? durationMs,
          sessionStatus: 'completed',
          subtitlePresetId: activePreset.id,
          translationMode: styleMode,
          naturalnessLevel: settings.naturalnessLevel,
          audioSource: 'subtitle-track',
          transcriptSegments: finalEnriched,
          speakerLabels: {},
          dictionaryEnabled: settings.dictionaryEnabledByDefault,
          privacySettings: {
            saveHistory: settings.saveHistory,
            saveTranscript: settings.saveTranscript,
            saveRawAudio: false,
          },
        });
      } catch {
        // Keep whatever already translated
      } finally {
        setTranslatingCue(false);
      }
    },
    [
      activePreset.id,
      dictionary,
      durationMs,
      settings.dictionaryEnabledByDefault,
      settings.naturalnessLevel,
      settings.preferredProvider,
      settings.properNounMode,
      settings.saveHistory,
      settings.saveTranscript,
      styleMode,
      upsertSession,
    ]
  );

  // Open any parsed YouTube / Bilibili / Twitch / HLS / Direct / Web URL
  const openParsedWebVideo = useCallback(
    (parsed: ParsedWebVideoSource, overrideLang?: SourceLanguageCode) => {
      stopLiveVideoAudio();
      cleanupHlsAndYouTube();
      setErrorMsg(null);
      setAutoSubStatus(null);
      setIsPlaying(false);
      setSegments([]);
      setCurrentTimeMs((parsed.startSeconds ?? 0) * 1000);
      setDurationMs(0);
      setParsedWebSource(parsed);
      setVideoTitle(parsed.suggestedTitle);
      setUrlInput(parsed.normalizedUrl);
      const targetLang = overrideLang ?? sourceLang;
      if (overrideLang) {
        setSourceLang(overrideLang);
      }

      if (parsed.kind === 'hls-stream' || parsed.kind === 'direct-video') {
        setVideoSourceType('direct-video');
        const v = videoRef.current;
        if (v) {
          v.srcObject = null;
          v.muted = false;
          v.crossOrigin = 'anonymous';
          if (parsed.kind === 'hls-stream' && Hls.isSupported()) {
            const hls = new Hls();
            hls.loadSource(parsed.normalizedUrl);
            hls.attachMedia(v);
            hlsRef.current = hls;
          } else {
            v.src = parsed.normalizedUrl;
          }
        }
        showToast(`Đã nạp ${parsed.platformLabel}!`, 'success');
        return;
      }

      if (parsed.canEmbedDirectly && parsed.embedUrl) {
        setVideoSourceType('web-embed');

        // AUTOMATIC YOUTUBE LIVE TRANSLATION: extract captions / synced CJK lyrics & translate progressively right away!
        if (parsed.kind === 'youtube' && parsed.videoId) {
          setAutoSubStatus('Đang tự động trích xuất & dịch phụ đề trực tiếp từ YouTube…');
          resolveAutomaticYouTubeSubtitles(parsed.videoId, targetLang)
            .then(async (autoRes) => {
              if (!autoRes) {
                setAutoSubStatus(
                  'Video này không có phụ đề nhúng sẵn — hãy dùng nút Nghe qua Micro hoặc mở Tab riêng để bắt tiếng.'
                );
                return;
              }
              const realTitle = autoRes.title || parsed.suggestedTitle;
              setVideoTitle(realTitle);

              if (autoRes.cues.length > 0) {
                const sessId = `yt-auto-${parsed.videoId}-${Date.now()}`;
                const baseSegs: TranscriptSegment[] = autoRes.cues.map((c) => ({
                  id: c.id,
                  sessionId: sessId,
                  startTimestamp: c.startTimestamp,
                  endTimestamp: c.endTimestamp,
                  sourceText: c.sourceText,
                  translatedText: 'Đang dịch…',
                  recognitionStatus: 'confirmed',
                  translationStatus: 'translating',
                  confidence: 0.95,
                  detectedLanguage: autoRes.detectedLanguage,
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                }));
                setSegments(baseSegs);
                setAutoSubStatus(
                  `Đang dịch trực tiếp ${baseSegs.length} câu (${autoRes.sourceLabel})…`
                );
                await translateVideoSegmentsProgressively(
                  baseSegs,
                  targetLang === 'auto' ? autoRes.detectedLanguage : targetLang,
                  realTitle
                );
                setAutoSubStatus(
                  `Đã dịch tự động ${baseSegs.length} câu phụ đề tiếng Việt · ${autoRes.sourceLabel}`
                );
                showToast(`Đã tự động dịch trực tiếp ${baseSegs.length} câu phụ đề!`, 'success');
              } else {
                setAutoSubStatus(
                  'Video YouTube này chưa có phụ đề gốc — bấm "Nghe qua Micro" hoặc mở ra Tab riêng để thu dịch giọng nói.'
                );
              }
            })
            .catch(() => {
              setAutoSubStatus(
                'Không lấy được phụ đề tự động — bạn có thể dùng Nghe qua Micro hoặc đính kèm tệp SRT.'
              );
            });
          return;
        }

        showToast(`Đã mở ${parsed.platformLabel}!`, 'success');
      } else {
        setVideoSourceType('external-web');
        showToast(
          `${parsed.platformLabel} chặn nhúng khung — hãy dùng chế độ Mở Tab Bên Cạnh + Bong Bóng Nổi PiP!`,
          'info'
        );
      }
    },
    [
      cleanupHlsAndYouTube,
      showToast,
      sourceLang,
      stopLiveVideoAudio,
      translateVideoSegmentsProgressively,
    ]
  );

  // Initialize first QA video on mount (unless a pendingWebLink was already queued!)
  useEffect(() => {
    if (!pendingWebLink) {
      loadQaVideo(BUILTIN_QA_STREAMS[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Consume global pendingWebLink from HomeView or FloatingBubbleOverlay!
  useEffect(() => {
    if (!pendingWebLink) return;
    const parsed = parseWebVideoUrl(pendingWebLink.url);
    clearPendingWebLink();
    if (parsed) {
      openParsedWebVideo(parsed, pendingWebLink.sourceLang);
    } else {
      setErrorMsg('Đường dẫn vừa nhập không đúng định dạng URL video hợp lệ.');
    }
  }, [clearPendingWebLink, openParsedWebVideo, pendingWebLink]);

  // Mount real YouTube IFrame API Player when parsedWebSource.kind === 'youtube'
  useEffect(() => {
    if (
      videoSourceType !== 'web-embed' ||
      !parsedWebSource ||
      parsedWebSource.kind !== 'youtube' ||
      !parsedWebSource.videoId
    ) {
      return;
    }

    let cancelled = false;
    const mountParent = ytContainerRef.current;
    if (!mountParent) return;

    mountParent.innerHTML = '';
    const playerDiv = document.createElement('div');
    playerDiv.style.width = '100%';
    playerDiv.style.height = '100%';
    mountParent.appendChild(playerDiv);

    loadYouTubeIframeApi()
      .then((YT) => {
        if (cancelled) return;
        const player = new YT.Player(playerDiv, {
          videoId: parsedWebSource.videoId!,
          playerVars: {
            playsinline: 1,
            rel: 0,
            modestbranding: 1,
            start: parsedWebSource.startSeconds ?? 0,
          },
          events: {
            onReady: (ev) => {
              if (cancelled) return;
              const dur = ev.target.getDuration?.() ?? 0;
              if (dur > 0) setDurationMs(Math.round(dur * 1000));
              ytPollRef.current = setInterval(() => {
                try {
                  const t = ev.target.getCurrentTime?.();
                  const d = ev.target.getDuration?.();
                  if (typeof t === 'number' && Number.isFinite(t)) {
                    setCurrentTimeMs(Math.round(t * 1000));
                  }
                  if (typeof d === 'number' && d > 0) {
                    setDurationMs(Math.round(d * 1000));
                  }
                } catch {
                  // Ignore
                }
              }, 220);
            },
            onStateChange: (ev) => {
              if (cancelled) return;
              // YT.PlayerState: 1 = PLAYING, 2 = PAUSED, 0 = ENDED
              if (ev.data === 1) setIsPlaying(true);
              else if (ev.data === 2 || ev.data === 0) setIsPlaying(false);
            },
            onError: () => {
              if (!cancelled) {
                setErrorMsg(
                  'Chủ sở hữu video YouTube này giới hạn phát nhúng ngoài YouTube — bạn có thể bấm "Mở ở tab YouTube + Bật Bong bóng nổi PiP" bên dưới!'
                );
              }
            },
          },
        });
        ytPlayerRef.current = player;
      })
      .catch(() => {
        if (!cancelled) {
          setErrorMsg(
            'Không thể nạp thư viện YouTube IFrame — kiểm tra kết nối mạng trình duyệt của bạn.'
          );
        }
      });

    return () => {
      cancelled = true;
      if (ytPollRef.current) {
        clearInterval(ytPollRef.current);
        ytPollRef.current = null;
      }
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.destroy();
        } catch {
          // Ignore
        }
        ytPlayerRef.current = null;
      }
    };
  }, [parsedWebSource, videoSourceType]);

  // Render procedural visual stream onto canvas when in qa-video mode
  useEffect(() => {
    if (videoSourceType !== 'qa-video') {
      if (canvasAnimRef.current) cancelAnimationFrame(canvasAnimRef.current);
      return;
    }

    const canvas = canvasRef.current;
    const videoEl = videoRef.current;
    if (!canvas || !videoEl) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const drawFrame = () => {
      const w = canvas.width;
      const h = canvas.height;
      const t = qaClockRef.current / 1000;
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, '#0B1222');
      grad.addColorStop(0.55, currentQaDef?.accentColor ?? '#1E3A8A');
      grad.addColorStop(1, '#090D16');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      const activeUtt = currentQaDef?.utterances.find(
        (u) => qaClockRef.current >= u.startMs && qaClockRef.current <= u.endMs
      );
      const pulse = activeUtt ? 18 + Math.sin(t * 9) * 10 : 4;
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(w / 2, h * 0.42, 46 + pulse, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(currentQaDef?.badgeLabel ?? 'SHAPI FLOW Video', w / 2, h * 0.43);

      ctx.fillStyle = 'rgba(226,232,240,0.72)';
      ctx.font = '13px monospace';
      ctx.fillText(
        `${formatMsToReadableClock(qaClockRef.current)} / ${formatMsToReadableClock(durationMs)}`,
        w / 2,
        h * 0.54
      );

      canvasAnimRef.current = requestAnimationFrame(drawFrame);
    };

    drawFrame();

    try {
      if ('captureStream' in canvas && videoEl.srcObject === null) {
        const stream = (
          canvas as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream }
        ).captureStream(24);
        videoEl.srcObject = stream;
        videoEl.muted = true;
        videoEl.play().catch(() => {});
      }
    } catch {
      // Ignore
    }

    return () => {
      if (canvasAnimRef.current) cancelAnimationFrame(canvasAnimRef.current);
    };
  }, [currentQaDef, durationMs, videoSourceType]);

  // Drive QA Video timeline & dynamic unsubtitled QA recognition
  useEffect(() => {
    if (videoSourceType !== 'qa-video') {
      if (qaTimerRef.current) clearInterval(qaTimerRef.current);
      return;
    }

    if (!isPlaying) {
      if (qaTimerRef.current) {
        clearInterval(qaTimerRef.current);
        qaTimerRef.current = null;
      }
      return;
    }

    qaTimerRef.current = setInterval(() => {
      const nextMs = qaClockRef.current + 120 * playbackRate;
      if (nextMs >= durationMs) {
        qaClockRef.current = durationMs;
        setCurrentTimeMs(durationMs);
        setIsPlaying(false);
        return;
      }
      qaClockRef.current = nextMs;
      setCurrentTimeMs(nextMs);

      if (currentQaDef && !currentQaDef.hasEmbeddedSubtitles) {
        currentQaDef.utterances.forEach((utt, idx) => {
          if (nextMs >= utt.startMs && !generatedNoSubIndexesRef.current.has(idx)) {
            generatedNoSubIndexesRef.current.add(idx);
            setTranslatingCue(true);
            translationClient
              .translateStream({
                text: utt.finalText,
                sourceLanguage: sourceLang,
                styleMode,
                naturalnessLevel: settings.naturalnessLevel,
                properNounMode: settings.properNounMode,
                preferredProvider: settings.preferredProvider,
                glossary: settings.dictionaryEnabledByDefault ? dictionary : [],
              })
              .then((res) => {
                const seg: TranscriptSegment = {
                  id: `dyn-cue-${idx}-${Date.now()}`,
                  sessionId: `vid-nosub-${selectedQaId}`,
                  startTimestamp: utt.startMs,
                  endTimestamp: utt.endMs,
                  sourceText: utt.finalText,
                  translatedText: res.translatedText,
                  speakerId: utt.speakerId,
                  recognitionStatus: 'confirmed',
                  translationStatus: 'completed',
                  confidence: res.confidence,
                  detectedLanguage: res.detectedLanguage,
                  tokens: res.tokens,
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                };
                setSegments((prev) =>
                  [...prev, seg].sort((a, b) => a.startTimestamp - b.startTimestamp)
                );
              })
              .catch(() => {})
              .finally(() => setTranslatingCue(false));
          }
        });
      }
    }, 120);

    return () => {
      if (qaTimerRef.current) clearInterval(qaTimerRef.current);
    };
  }, [
    currentQaDef,
    dictionary,
    durationMs,
    isPlaying,
    playbackRate,
    selectedQaId,
    settings.dictionaryEnabledByDefault,
    settings.naturalnessLevel,
    settings.preferredProvider,
    settings.properNounMode,
    sourceLang,
    styleMode,
    videoSourceType,
  ]);

  // Start REAL Live Audio Speech-to-Vietnamese Translation for YouTube / Web / Local Video!
  const startLiveVideoAudioTranslation = async (
    requestedSource: 'auto-best' | 'display-audio' | 'microphone',
    preferCurrentTab = true
  ) => {
    haptic(10);
    setErrorMsg(null);
    setLiveAudioWarning(null);

    if (!audioPipelineRef.current) {
      audioPipelineRef.current = new LiveAudioPipeline();
    }

    let chosenSource: AudioSourceType =
      requestedSource === 'microphone' ? 'microphone' : 'display-audio';
    let externalStream: MediaStream | undefined = undefined;

    // If playing a local file or CORS-enabled direct/HLS video, try zero-popup <video>.captureStream() first!
    if (
      requestedSource === 'auto-best' &&
      (videoSourceType === 'local-file' || videoSourceType === 'direct-video') &&
      videoRef.current
    ) {
      try {
        const vidWithCapture = videoRef.current as HTMLVideoElement & {
          captureStream?: () => MediaStream;
          mozCaptureStream?: () => MediaStream;
        };
        const captured =
          vidWithCapture.captureStream?.() ?? vidWithCapture.mozCaptureStream?.();
        if (captured && captured.getAudioTracks().length > 0) {
          chosenSource = 'video-element';
          externalStream = captured;
        }
      } catch {
        // Cross-origin video without CORS headers -> falls back to display-audio cleanly!
      }
    }

    // Ensure YouTube / HTML5 video is playing so there is audio to hear!
    if (videoSourceType === 'web-embed' && ytPlayerRef.current) {
      try {
        ytPlayerRef.current.playVideo();
      } catch {
        // Ignore
      }
    } else if (
      (videoSourceType === 'local-file' || videoSourceType === 'direct-video') &&
      videoRef.current?.paused
    ) {
      videoRef.current.play().catch(() => {});
    }

    setLiveAudioActive(true);
    setLiveAudioSourceUsed(chosenSource);
    setLiveAudioStatus('connecting');
    setLiveRunningIndicator({
      isRunning: true,
      modeLabel: `Video: ${videoTitle}`,
      sourceLang,
    });

    const videoSessionId = `vid-live-${Date.now()}`;

    await audioPipelineRef.current.start({
      audioSource: chosenSource,
      sourceLanguage: sourceLang,
      noiseSuppression: settings.noiseSuppression,
      autoGainControl: settings.autoGainControl,
      micSensitivity: settings.micSensitivity,
      preferCurrentTab,
      externalMediaStream: externalStream,
      callbacks: {
        onStatusChange: (st) => {
          setLiveAudioStatus(st);
          setGlobalSubtitleFeed((prev) => ({
            ...prev,
            statusLabel:
              st === 'listening'
                ? 'Đang nghe video'
                : st === 'recognizing'
                ? 'Đang tách lời thoại'
                : st === 'paused'
                ? 'Tạm dừng'
                : 'Đang kết nối',
          }));
        },
        onWaveformUpdate: (_rms, bands) => {
          setLiveWaveform(bands);
        },
        onInterimTranscript: (interimTxt) => {
          // If interimTxt is actual CJK text (from Web Speech), translate stream; if status hint from Whisper VAD, show hint
          if (/^Đang nghe/.test(interimTxt)) {
            setLiveOverlayCue((prev) =>
              prev ?? {
                sourceText: '',
                translatedText: interimTxt,
                isPartial: true,
                detectedLanguage: sourceLang,
              }
            );
            return;
          }
          translationClient
            .translateStream({
              text: interimTxt,
              sourceLanguage: sourceLang,
              styleMode,
              naturalnessLevel: settings.naturalnessLevel,
              properNounMode: settings.properNounMode,
              preferredProvider: settings.preferredProvider,
              glossary: settings.dictionaryEnabledByDefault ? dictionary : [],
              isInterim: true,
            })
            .then((res) => {
              setLiveOverlayCue({
                sourceText: interimTxt,
                translatedText: res.translatedText,
                isPartial: true,
                detectedLanguage: res.detectedLanguage,
              });
              setGlobalSubtitleFeed({
                sourceText: interimTxt,
                translatedText: res.translatedText,
                isPartial: true,
                statusLabel: 'Đang dịch trực tiếp',
              });
            })
            .catch(() => {});
        },
        onFinalTranscript: (finalTxt, relStartMs, relEndMs) => {
          setLiveAudioStatus('translating');
          const timelineAnchor = currentTimeMsRef.current;
          const startTs = timelineAnchor > 0 ? Math.max(0, timelineAnchor - 1800) : relStartMs;
          const endTs = timelineAnchor > 0 ? timelineAnchor + 2600 : Math.max(relEndMs, relStartMs + 2500);

          const contextTurns = segmentsRef.current.slice(-5).map((s) => ({
            sourceText: s.sourceText,
            translatedText: s.translatedText,
          }));

          translationClient
            .translateStream({
              text: finalTxt,
              sourceLanguage: sourceLang,
              styleMode,
              naturalnessLevel: settings.naturalnessLevel,
              properNounMode: settings.properNounMode,
              preferredProvider: settings.preferredProvider,
              glossary: settings.dictionaryEnabledByDefault ? dictionary : [],
              contextTurns,
            })
            .then((res) => {
              setLiveAudioStatus('listening');
              setLiveOverlayCue({
                sourceText: finalTxt,
                translatedText: res.translatedText,
                isPartial: false,
                detectedLanguage: res.detectedLanguage,
              });
              setGlobalSubtitleFeed({
                sourceText: finalTxt,
                translatedText: res.translatedText,
                isPartial: false,
                statusLabel: 'Đang dịch Video/Web',
              });

              const newSeg: TranscriptSegment = {
                id: `vid-seg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                sessionId: videoSessionId,
                startTimestamp: startTs,
                endTimestamp: endTs,
                sourceText: finalTxt,
                translatedText: res.translatedText,
                recognitionStatus: 'confirmed',
                translationStatus: res.confidence < 0.66 ? 'uncertain' : 'completed',
                confidence: res.confidence,
                detectedLanguage: res.detectedLanguage,
                tokens: res.tokens,
                createdAt: Date.now(),
                updatedAt: Date.now(),
              };

              setSegments((prev) => {
                const next = [...prev, newSeg];
                upsertSession({
                  id: videoSessionId,
                  title: videoTitle,
                  sourceLanguage: sourceLang,
                  detectedLanguage: res.detectedLanguage,
                  targetLanguage: 'vi',
                  sourceType: 'video',
                  createdAt: Date.now(),
                  startedAt: Date.now(),
                  endedAt: Date.now(),
                  durationMs: Math.max(durationMs, endTs),
                  sessionStatus: 'listening',
                  subtitlePresetId: activePreset.id,
                  translationMode: styleMode,
                  naturalnessLevel: settings.naturalnessLevel,
                  audioSource: chosenSource,
                  transcriptSegments: next,
                  speakerLabels: {},
                  dictionaryEnabled: settings.dictionaryEnabledByDefault,
                  privacySettings: {
                    saveHistory: settings.saveHistory,
                    saveTranscript: settings.saveTranscript,
                    saveRawAudio: false,
                  },
                });
                return next;
              });
            })
            .catch(() => {
              setLiveAudioStatus('listening');
            });
        },
        onWarning: (w) => {
          setLiveAudioWarning(w);
        },
        onError: (errText) => {
          setErrorMsg(errText);
          stopLiveVideoAudio();
        },
      },
    });
  };

  const handleLocalVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    stopLiveVideoAudio();
    cleanupHlsAndYouTube();
    setParsedWebSource(null);
    setErrorMsg(null);

    if (!file.type.startsWith('video/') && !/\.(mp4|webm|mov|m4v|ogg)$/i.test(file.name)) {
      setErrorMsg('Định dạng tệp không phải video được hỗ trợ (.MP4, .WEBM, .MOV).');
      return;
    }

    if (localObjectUrl) URL.revokeObjectURL(localObjectUrl);
    const objUrl = URL.createObjectURL(file);

    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.muted = false;
      videoRef.current.src = objUrl;
    }

    setLocalObjectUrl(objUrl);
    setVideoSourceType('local-file');
    setVideoTitle(file.name);
    setSegments([]);
    setCurrentTimeMs(0);
    setIsPlaying(false);
    showToast(
      `Đã nạp "${file.name}". Bấm "Bắt tiếng Video" để dịch trực tiếp hoặc đính kèm tệp SRT/VTT!`,
      'success'
    );
    e.target.value = '';
  };

  const handleExternalSubtitleAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    try {
      const content = await file.text();
      const parsed = parseSubtitleFileContent(content, file.name);
      const sessId = `vid-sub-${Date.now()}`;
      const rawSegs: TranscriptSegment[] = parsed.cues.map((c) => ({
        id: c.id,
        sessionId: sessId,
        startTimestamp: c.startTimestamp,
        endTimestamp: c.endTimestamp,
        sourceText: c.sourceText,
        translatedText: 'Đang dịch…',
        speakerId: c.speakerId,
        recognitionStatus: 'confirmed',
        translationStatus: 'translating',
        confidence: 1,
        detectedLanguage: 'ko',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }));
      setSegments(rawSegs);
      await translateVideoSegments(rawSegs, sourceLang, `Video: ${videoTitle}`);
      showToast(`Đã đồng bộ và dịch ${rawSegs.length} câu phụ đề!`, 'success');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Tệp phụ đề không hợp lệ.');
    }
    e.target.value = '';
  };

  const handleLoadUrlForm = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseWebVideoUrl(urlInput);
    if (!parsed) {
      setErrorMsg('Hãy dán đường dẫn YouTube, Bilibili, Twitch, .M3U8, .MP4 hoặc trang web hợp lệ.');
      return;
    }
    openParsedWebVideo(parsed);
  };

  const handlePasteUrlClipboard = async () => {
    try {
      const txt = await navigator.clipboard.readText();
      if (txt.trim()) {
        setUrlInput(txt.trim());
        haptic(8);
      }
    } catch {
      showToast('Hãy chạm giữ vào ô nhập để dán đường dẫn', 'info');
    }
  };

  const togglePlayPause = () => {
    haptic(8);
    if (videoSourceType === 'qa-video') {
      if (currentTimeMs >= durationMs) {
        qaClockRef.current = 0;
        setCurrentTimeMs(0);
      }
      setIsPlaying((p) => !p);
      return;
    }

    if (videoSourceType === 'web-embed' && ytPlayerRef.current) {
      if (isPlaying) ytPlayerRef.current.pauseVideo();
      else ytPlayerRef.current.playVideo();
      return;
    }

    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => {
        setErrorMsg('Không thể phát tệp hoặc đường dẫn video này.');
      });
    } else {
      v.pause();
    }
  };

  const seekToMs = (targetMs: number) => {
    const maxDur = durationMs > 0 ? durationMs : targetMs + 10000;
    const clamped = Math.max(0, Math.min(maxDur, targetMs));
    if (videoSourceType === 'qa-video') {
      qaClockRef.current = clamped;
      setCurrentTimeMs(clamped);
    } else if (videoSourceType === 'web-embed' && ytPlayerRef.current) {
      ytPlayerRef.current.seekTo(clamped / 1000, true);
      setCurrentTimeMs(clamped);
    } else if (videoRef.current) {
      videoRef.current.currentTime = clamped / 1000;
      setCurrentTimeMs(clamped);
    }
  };

  const cycleSpeed = () => {
    const speeds = [0.75, 1.0, 1.25, 1.5, 2.0];
    const next = speeds[(speeds.indexOf(playbackRate) + 1) % speeds.length] ?? 1.0;
    setPlaybackRate(next);
    if (videoSourceType === 'web-embed' && ytPlayerRef.current) {
      try {
        ytPlayerRef.current.setPlaybackRate(next);
      } catch {
        // Ignore
      }
    } else if (videoRef.current && videoSourceType !== 'qa-video') {
      videoRef.current.playbackRate = next;
    }
  };

  const togglePiP = async () => {
    // If watching YouTube/Web embed, pop out the Floating Subtitle PiP Window so subtitles float on top!
    if (videoSourceType === 'web-embed' || videoSourceType === 'external-web') {
      const res = await subtitlePipManager.open({
        sourceText: liveOverlayCue?.sourceText ?? activeSyncedSegment?.sourceText ?? '',
        translatedText:
          liveOverlayCue?.translatedText ??
          activeSyncedSegment?.translatedText ??
          'Phụ đề nổi SHAPI FLOW sẵn sàng!',
        isPartial: liveOverlayCue?.isPartial,
        statusLabel: liveAudioActive ? 'Đang dịch Video/Web' : 'Phụ đề nổi',
        isRunning: liveAudioActive,
        preset: activePreset,
      });
      if (res.ok) {
        showToast('Đã tách cửa sổ phụ đề nổi (PiP)!', 'success');
      } else if (res.error) {
        showToast(res.error, 'warning');
      }
      return;
    }

    const v = videoRef.current;
    if (!v || !capabilities.supportsPictureInPicture) {
      showToast('Thiết bị/trình duyệt không hỗ trợ Picture-in-Picture cho nguồn này.', 'warning');
      return;
    }
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await v.requestPictureInPicture();
      }
    } catch {
      showToast('Hãy phát video trước khi bật cửa sổ thu nhỏ PiP.', 'warning');
    }
  };

  const toggleFullscreen = () => {
    const el = stageRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      el.requestFullscreen?.().catch(() => {});
    }
  };

  const exportCurrentSubtitles = (fmt: 'srt' | 'vtt' | 'txt') => {
    try {
      const content = exportSubtitleSegments(segments, fmt);
      const blob = new Blob(['\uFEFF' + content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `video-subtitles.${fmt}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(`Đã xuất phụ đề video (.${fmt.toUpperCase()})`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Chưa có phụ đề để xuất', 'warning');
    }
  };

  const activeSyncedSegment = useMemo(
    () => findSyncedSegmentAtTime(segments, currentTimeMs, syncOffsetMs),
    [segments, currentTimeMs, syncOffsetMs]
  );

  // Sync active video segment into Global Floating Bubble / PiP window too!
  useEffect(() => {
    if (activeSyncedSegment && !liveAudioActive) {
      setGlobalSubtitleFeed({
        sourceText: activeSyncedSegment.sourceText,
        translatedText:
          activeSyncedSegment.isUserEdited && activeSyncedSegment.userEditedText
            ? activeSyncedSegment.userEditedText
            : activeSyncedSegment.translatedText,
        isPartial: false,
        statusLabel: 'Đang phát Video',
      });
    }
  }, [activeSyncedSegment, liveAudioActive, setGlobalSubtitleFeed]);

  const effectivePreset = useMemo(() => {
    if (!quickSwapOriginal) return activePreset;
    return { ...activePreset, subtitleMode: 'source-only' as const };
  }, [activePreset, quickSwapOriginal]);

  // Determine what subtitle should render over the video stage right now
  const displayedStageSubtitle = useMemo(() => {
    if (liveAudioActive && liveOverlayCue) {
      return {
        sourceText: liveOverlayCue.sourceText,
        translatedText: liveOverlayCue.translatedText,
        isPartial: liveOverlayCue.isPartial,
        isUncertain: false,
        tokens: undefined,
        lang: liveOverlayCue.detectedLanguage,
      };
    }
    if (activeSyncedSegment) {
      return {
        sourceText: activeSyncedSegment.sourceText,
        translatedText:
          activeSyncedSegment.isUserEdited && activeSyncedSegment.userEditedText
            ? activeSyncedSegment.userEditedText
            : activeSyncedSegment.translatedText,
        isPartial: false,
        isUncertain: activeSyncedSegment.confidence < 0.66,
        tokens: activeSyncedSegment.tokens,
        lang: activeSyncedSegment.detectedLanguage,
      };
    }
    return null;
  }, [activeSyncedSegment, liveAudioActive, liveOverlayCue]);

  const isIframeStage = videoSourceType === 'web-embed' || videoSourceType === 'external-web';

  return (
    <div className="space-y-4 pb-8">
      {/* Hidden file pickers */}
      <input
        ref={videoInputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime,video/*"
        onChange={handleLocalVideoUpload}
        className="hidden"
      />
      <input
        ref={subInputRef}
        type="file"
        accept=".srt,.vtt,.ass,.ssa"
        onChange={handleExternalSubtitleAttach}
        className="hidden"
      />

      {!focusMode && (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Film className="w-4 h-4 text-[var(--accent-flow)]" />
            <h1 className="text-base font-extrabold text-[var(--text-primary)]">
              Trình phát YouTube, Web & Video
            </h1>
          </div>
          <SessionStatusBadge
            status={
              liveAudioActive
                ? liveAudioStatus
                : translatingCue
                ? 'translating'
                : isPlaying
                ? 'syncing'
                : 'idle'
            }
            compact
          />
        </div>
      )}

      {errorMsg && (
        <ErrorRecoveryBanner message={errorMsg} onDismiss={() => setErrorMsg(null)} />
      )}

      {/* Always-Visible Link Opener + Local File + Subtitle Picker */}
      {!focusMode && (
        <section className="video-opener rounded-3xl lf-surface p-4 space-y-3">
          <form onSubmit={handleLoadUrlForm} className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Link2 className="w-4 h-4 text-[var(--accent-primary)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="Dán link YouTube, Shorts, Bilibili, Twitch, .M3U8, .MP4 hoặc Web…"
                className="w-full min-h-[44px] pl-10 pr-16 rounded-2xl lf-elevated border border-[var(--border-subtle)] text-xs sm:text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)]"
              />
              <button
                type="button"
                onClick={handlePasteUrlClipboard}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[11px] font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] inline-flex items-center gap-1 cursor-pointer"
              >
                <ClipboardPaste className="w-3 h-3" />
                <span>Dán</span>
              </button>
            </div>

            <button
              type="submit"
              className="min-h-[44px] px-4 rounded-2xl lf-brand-gradient text-white text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
            >
              <span>Mở Link</span>
              <ArrowUpRight className="w-4 h-4" />
            </button>
          </form>

          <details className="video-more">
          <summary>Thêm lựa chọn</summary>
          {/* Sample YouTube / Web Links + Built-in QA Video Streams */}
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            {SAMPLE_WEB_VIDEO_LINKS.map((sample) => (
              <button
                key={sample.id}
                type="button"
                onClick={() => {
                  const parsed = parseWebVideoUrl(sample.url);
                  if (parsed) openParsedWebVideo(parsed, sample.sourceLang);
                }}
                className={`shrink-0 min-h-[34px] px-2.5 rounded-xl text-[11px] font-semibold inline-flex items-center gap-1.5 cursor-pointer border ${
                  parsedWebSource?.normalizedUrl === sample.url
                    ? 'bg-[var(--accent-primary)] text-white border-transparent'
                    : 'lf-elevated text-[var(--text-secondary)] border-[var(--border-subtle)]'
                }`}
              >
                <Globe className="w-3 h-3" />
                <span>{sample.label}</span>
              </button>
            ))}

            {BUILTIN_QA_STREAMS.map((qa) => (
              <button
                key={qa.id}
                type="button"
                onClick={() => loadQaVideo(qa)}
                className={`shrink-0 min-h-[34px] px-2.5 rounded-xl text-[11px] font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
                  videoSourceType === 'qa-video' && selectedQaId === qa.id
                    ? 'bg-[var(--accent-primary)] text-white'
                    : 'lf-elevated text-[var(--text-secondary)]'
                }`}
              >
                <Sparkles className="w-3 h-3" />
                <span>{qa.badgeLabel}</span>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={() => videoInputRef.current?.click()}
              className="min-h-[40px] px-3 rounded-xl lf-elevated text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
              <span>Mở tệp Video từ máy</span>
            </button>

            <button
              type="button"
              onClick={() => subInputRef.current?.click()}
              className="min-h-[40px] px-3 rounded-xl lf-elevated text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-[var(--accent-flow)]" />
              <span>Đính kèm tệp SRT/VTT/ASS</span>
            </button>
          </div>
          </details>
        </section>
      )}

      {/* INTEGRATED UNIVERSAL VIDEO STAGE */}
      <section className="space-y-3">
        {/* Clean Header Bar ABOVE the YouTube / Web IFrame so nothing overlaps YouTube's own title or gear button! */}
        {isIframeStage && (
          <div className="rounded-2xl lf-surface px-3.5 py-2.5 flex items-center justify-between gap-2 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-extrabold text-[var(--text-primary)] truncate">
                {videoTitle}
              </div>
              {autoSubStatus && (
                <div className="text-[11px] font-semibold text-[var(--accent-flow)] truncate mt-0.5">
                  {autoSubStatus}
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {parsedWebSource && (
                <a
                  href={parsedWebSource.normalizedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Mở trang gốc ở tab mới"
                  className="h-8 px-2.5 rounded-xl lf-elevated text-xs font-semibold inline-flex items-center gap-1"
                >
                  <span>Tab gốc</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}

              <button
                type="button"
                onClick={() => setFocusMode((f) => !f)}
                className={`h-8 px-2.5 rounded-xl text-xs font-semibold cursor-pointer ${
                  focusMode
                    ? 'bg-[var(--accent-primary)] text-white'
                    : 'lf-elevated text-[var(--text-primary)]'
                }`}
              >
                {focusMode ? 'Thoát tập trung' : 'Tập trung'}
              </button>

              <button
                type="button"
                onClick={togglePiP}
                title="Tách cửa sổ phụ đề nổi / Picture-in-Picture"
                className="w-8 h-8 rounded-xl lf-elevated inline-flex items-center justify-center cursor-pointer"
              >
                <PictureInPicture2 className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={toggleFullscreen}
                aria-label="Toàn màn hình"
                className="w-8 h-8 rounded-xl lf-elevated inline-flex items-center justify-center cursor-pointer"
              >
                {focusMode ? (
                  <Minimize2 className="w-3.5 h-3.5" />
                ) : (
                  <Maximize2 className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>
        )}

        <div
          ref={stageRef}
          onClick={() => {
            if (!isIframeStage) setControlsVisible((v) => !v);
          }}
          className={`relative w-full ${
            focusMode ? 'h-[66vh]' : 'aspect-video min-h-[255px]'
          } rounded-3xl overflow-hidden bg-black shadow-xl select-none`}
        >
          {/* 1. Backing Canvas for QA Video */}
          <canvas
            ref={canvasRef}
            width={640}
            height={360}
            className={`absolute inset-0 w-full h-full object-cover ${
              videoSourceType === 'qa-video' ? 'block' : 'hidden'
            }`}
          />

          {/* 2. Native HTML5 / HLS <video> Element */}
          <video
            ref={videoRef}
            playsInline
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onLoadedMetadata={(e) => {
              if (videoSourceType === 'local-file' || videoSourceType === 'direct-video') {
                const dur = e.currentTarget.duration;
                if (Number.isFinite(dur) && dur > 0) {
                  setDurationMs(Math.round(dur * 1000));
                }
              }
            }}
            onTimeUpdate={(e) => {
              if (videoSourceType === 'local-file' || videoSourceType === 'direct-video') {
                setCurrentTimeMs(Math.round(e.currentTarget.currentTime * 1000));
              }
            }}
            onError={() => {
              if (videoSourceType === 'local-file' || videoSourceType === 'direct-video') {
                setErrorMsg(
                  'Không thể phát trực tiếp luồng tệp này — kiểm tra định dạng hoặc mở bằng chế độ Tab Web.'
                );
              }
            }}
            className={`w-full h-full object-contain ${
              videoSourceType === 'local-file' || videoSourceType === 'direct-video'
                ? 'opacity-100'
                : 'opacity-0 pointer-events-none absolute inset-0'
            }`}
          />

          {/* 3. Real YouTube IFrame API Mount */}
          <div
            ref={ytContainerRef}
            className={`absolute inset-0 w-full h-full ${
              videoSourceType === 'web-embed' && parsedWebSource?.kind === 'youtube'
                ? 'block z-10'
                : 'hidden'
            }`}
          />

          {/* 4. Bilibili / Twitch / Vimeo / Dailymotion / Embeddable Web IFrame */}
          {videoSourceType === 'web-embed' &&
            parsedWebSource &&
            parsedWebSource.kind !== 'youtube' &&
            parsedWebSource.embedUrl && (
              <iframe
                src={parsedWebSource.embedUrl}
                title={parsedWebSource.suggestedTitle}
                allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                allowFullScreen
                className="absolute inset-0 w-full h-full border-0 z-10"
              />
            )}

          {/* 5. Companion Mode for External Sites that Block IFrames (TikTok, Douyin, Facebook, Weverse...) */}
          {videoSourceType === 'external-web' && parsedWebSource && (
            <div className="absolute inset-0 z-10 bg-slate-950 text-white p-5 flex flex-col items-center justify-center text-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-teal-500/15 text-teal-400 flex items-center justify-center">
                <ExternalLink className="w-6 h-6" />
              </div>
              <div className="space-y-1 max-w-md">
                <h3 className="text-sm sm:text-base font-extrabold">
                  {parsedWebSource.platformLabel} yêu cầu mở ở tab riêng
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Trang này chặn nhúng trực tiếp trong khung. Hãy mở video ở tab bên cạnh, bật{' '}
                  <strong>Bong bóng phụ đề nổi PiP</strong> và nhấn{' '}
                  <strong>Bắt tiếng Tab</strong> để phụ đề tiếng Việt nổi đè ngay trên video đó!
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                <a
                  href={parsedWebSource.normalizedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[40px] px-4 rounded-xl bg-white text-slate-950 text-xs font-extrabold inline-flex items-center gap-1.5"
                >
                  <span>1. Mở {parsedWebSource.platformLabel}</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <button
                  type="button"
                  onClick={togglePiP}
                  className="min-h-[40px] px-3.5 rounded-xl bg-teal-500 text-slate-950 text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <PictureInPicture2 className="w-3.5 h-3.5" />
                  <span>2. Tách Phụ đề Nổi PiP</span>
                </button>
                <button
                  type="button"
                  onClick={() => startLiveVideoAudioTranslation('display-audio', false)}
                  className="min-h-[40px] px-3.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <MonitorSpeaker className="w-3.5 h-3.5" />
                  <span>3. Bắt tiếng Tab đó</span>
                </button>
              </div>
            </div>
          )}

          {/* Top Focus / PiP / Fullscreen corner controls (ONLY for non-iframe HTML5/QA videos; YouTube/Web embeds use the clean bar above!) */}
          {controlsVisible && !isIframeStage && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute top-3 inset-x-3 z-30 flex items-center justify-between gap-2 pointer-events-none"
            >
              <span className="px-3 py-1 rounded-full bg-black/65 backdrop-blur-md text-[11px] font-semibold text-slate-200 truncate max-w-[55%] pointer-events-auto">
                {videoTitle}
              </span>

              <div className="flex items-center gap-1.5 pointer-events-auto">
                {parsedWebSource && (
                  <a
                    href={parsedWebSource.normalizedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Mở trang gốc ở tab mới"
                    className="h-8 px-2.5 rounded-full bg-black/65 text-white border border-white/15 text-[11px] font-semibold inline-flex items-center gap-1"
                  >
                    <span>Tab gốc</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}

                <button
                  type="button"
                  onClick={() => setFocusMode((f) => !f)}
                  className={`h-8 px-2.5 rounded-full text-[11px] font-semibold backdrop-blur-md border cursor-pointer ${
                    focusMode
                      ? 'bg-teal-500/30 text-teal-100 border-teal-400/50'
                      : 'bg-black/65 text-white border-white/15'
                  }`}
                >
                  {focusMode ? 'Thoát tập trung' : 'Tập trung'}
                </button>

                <button
                  type="button"
                  onClick={togglePiP}
                  title="Tách cửa sổ phụ đề nổi / Picture-in-Picture"
                  className="w-8 h-8 rounded-full bg-black/65 text-white border border-white/15 inline-flex items-center justify-center cursor-pointer"
                >
                  <PictureInPicture2 className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={toggleFullscreen}
                  aria-label="Toàn màn hình"
                  className="w-8 h-8 rounded-full bg-black/65 text-white border border-white/15 inline-flex items-center justify-center cursor-pointer"
                >
                  {focusMode ? (
                    <Minimize2 className="w-3.5 h-3.5" />
                  ) : (
                    <Maximize2 className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Synchronized or Live-Recognized Draggable Subtitle Layer */}
          {displayedStageSubtitle && (
            <div onClick={(e) => e.stopPropagation()} className="z-30">
              <DraggableSubtitleBox
                preset={effectivePreset}
                sourceText={displayedStageSubtitle.sourceText}
                translatedText={displayedStageSubtitle.translatedText}
                isInterim={displayedStageSubtitle.isPartial}
                isUncertain={displayedStageSubtitle.isUncertain}
                tokens={displayedStageSubtitle.tokens}
                hidden={subtitleHidden}
                draggable
                onDragStateChange={setIsDraggingSub}
                onUpdatePosition={(patch) => updateActivePresetLive(patch)}
                onTapWord={(term, ctxSentence) =>
                  openWordLookup(term, displayedStageSubtitle.lang, ctxSentence)
                }
              />
            </div>
          )}

          {/* Bottom Timeline Overlay (shown inside stage for non-iframe videos; for YouTube/Web embeds we place transport right below stage so we never block YouTube's native controls!) */}
          {controlsVisible && !isIframeStage && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute bottom-0 inset-x-0 z-20 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-4 pb-3 pt-6 space-y-2"
            >
              <input
                type="range"
                min={0}
                max={Math.max(1000, durationMs)}
                step={100}
                value={Math.min(currentTimeMs, Math.max(1000, durationMs))}
                aria-label="Thanh tiến trình video"
                onChange={(e) => seekToMs(Number(e.target.value))}
                className="w-full h-1.5 accent-sky-400 cursor-pointer"
              />

              <div className="flex items-center justify-between gap-2 text-white">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => seekToMs(currentTimeMs - 5000)}
                    aria-label="Tua lùi 5 giây"
                    className="w-9 h-9 rounded-full bg-white/12 inline-flex items-center justify-center cursor-pointer"
                  >
                    <Rewind className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={togglePlayPause}
                    aria-label={isPlaying ? 'Tạm dừng video' : 'Phát video'}
                    className="w-10 h-10 rounded-full bg-white text-slate-950 inline-flex items-center justify-center cursor-pointer shadow-md"
                  >
                    {isPlaying ? (
                      <Pause className="w-4 h-4 fill-current" />
                    ) : (
                      <Play className="w-4 h-4 fill-current ml-0.5" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => seekToMs(currentTimeMs + 5000)}
                    aria-label="Tua tới 5 giây"
                    className="w-9 h-9 rounded-full bg-white/12 inline-flex items-center justify-center cursor-pointer"
                  >
                    <FastForward className="w-4 h-4" />
                  </button>

                  <span className="text-xs font-mono text-slate-200 ml-1">
                    {formatMsToReadableClock(currentTimeMs)} / {formatMsToReadableClock(durationMs)}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={cycleSpeed}
                    className="h-8 px-2.5 rounded-xl bg-white/14 text-xs font-bold font-mono cursor-pointer"
                  >
                    {playbackRate}x
                  </button>

                  <button
                    type="button"
                    onClick={() => setQuickSwapOriginal((s) => !s)}
                    title="Chuyển nhanh bản gốc / bản dịch"
                    className={`h-8 px-2.5 rounded-xl text-xs font-semibold cursor-pointer ${
                      quickSwapOriginal ? 'bg-sky-500 text-white' : 'bg-white/14 text-white'
                    }`}
                  >
                    {quickSwapOriginal ? 'Bản gốc' : 'Tiếng Việt'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setSubtitleHidden((h) => !h)}
                    aria-label={subtitleHidden ? 'Hiện phụ đề' : 'Ẩn phụ đề'}
                    className="w-8 h-8 rounded-xl bg-white/14 inline-flex items-center justify-center cursor-pointer"
                  >
                    {subtitleHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Dedicated YouTube / Embedded Web Transport Bar (when watching YouTube!) */}
        {videoSourceType === 'web-embed' && parsedWebSource?.kind === 'youtube' && (
          <div className="rounded-2xl lf-surface px-4 py-2.5 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => seekToMs(currentTimeMs - 5000)}
                className="w-8 h-8 rounded-xl lf-elevated inline-flex items-center justify-center cursor-pointer"
              >
                <Rewind className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={togglePlayPause}
                className="h-8 px-3 rounded-xl bg-[var(--accent-primary)] text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                <span>{isPlaying ? 'Tạm dừng YT' : 'Phát YT'}</span>
              </button>
              <button
                type="button"
                onClick={() => seekToMs(currentTimeMs + 5000)}
                className="w-8 h-8 rounded-xl lf-elevated inline-flex items-center justify-center cursor-pointer"
              >
                <FastForward className="w-3.5 h-3.5" />
              </button>
              <span className="text-xs font-mono text-[var(--text-secondary)]">
                {formatMsToReadableClock(currentTimeMs)}
                {durationMs > 0 ? ` / ${formatMsToReadableClock(durationMs)}` : ''}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={cycleSpeed}
                className="h-8 px-2.5 rounded-xl lf-elevated text-xs font-bold font-mono cursor-pointer"
              >
                {playbackRate}x
              </button>
              <button
                type="button"
                onClick={() => setSubtitleHidden((h) => !h)}
                className="h-8 px-2.5 rounded-xl lf-elevated text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
              >
                {subtitleHidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                <span>{subtitleHidden ? 'Hiện chữ' : 'Ẩn chữ'}</span>
              </button>
            </div>
          </div>
        )}

        {/* REAL-TIME AUDIO SPEECH TRANSLATOR FOR YOUTUBE / WEB / UNSUBTITLED VIDEO */}
        {videoSourceType !== 'qa-video' && (
          <div className="rounded-3xl lf-surface p-4 space-y-3 border-2 border-[var(--accent-flow)]/30">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <h2 className="text-sm font-extrabold text-[var(--text-primary)]">
                  Dịch trực tiếp âm thanh Video / YouTube / Web
                </h2>
                <p className="text-[11px] text-[var(--text-secondary)]">
                  {liveAudioActive
                    ? `Đang thu qua ${
                        liveAudioSourceUsed === 'video-element'
                          ? 'luồng Video trực tiếp'
                          : liveAudioSourceUsed === 'display-audio'
                          ? 'âm thanh Tab trình duyệt (Whisper AI)'
                          : 'Micro thiết bị'
                      }`
                    : 'Nhận diện lời nói Hàn · Nhật · Trung từ video đang phát và hiện phụ đề Việt ngay trên khung'}
                </p>
              </div>

              {liveAudioActive && <LiveWaveformMeter bands={liveWaveform} active />}
            </div>

            {liveAudioWarning && (
              <div className="px-3 py-2 rounded-xl bg-amber-500/12 border border-amber-500/25 text-xs text-amber-800 dark:text-amber-200 font-medium">
                {liveAudioWarning}
              </div>
            )}

            {isEmbeddedPreviewIframe && isIframeStage && !liveAudioActive && (
              <div className="px-3 py-2.5 rounded-2xl bg-[var(--accent-primary-soft)] text-xs text-[var(--text-primary)] flex items-center justify-between gap-2 flex-wrap">
                <span className="leading-snug">
                  Ứng dụng đã <strong>tự động trích xuất phụ đề YouTube</strong>. Nếu muốn thu trực tiếp âm thanh mọi Tab mà không bị giới hạn khung xem trước, hãy mở ra Tab riêng:
                </span>
                <a
                  href={
                    typeof window !== 'undefined'
                      ? `${window.location.origin}/?video=${encodeURIComponent(
                          parsedWebSource?.normalizedUrl ?? ''
                        )}`
                      : '#'
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-xl bg-[var(--accent-primary)] text-white font-bold inline-flex items-center gap-1 shrink-0"
                >
                  <span>Mở ra Tab riêng</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}

            {!liveAudioActive ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    startLiveVideoAudioTranslation(
                      videoSourceType === 'local-file' || videoSourceType === 'direct-video'
                        ? 'auto-best'
                        : 'display-audio',
                      true
                    )
                  }
                  className="min-h-[44px] px-3.5 rounded-2xl lf-brand-gradient text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <MonitorSpeaker className="w-4 h-4 shrink-0" />
                  <span>
                    {videoSourceType === 'local-file' || videoSourceType === 'direct-video'
                      ? 'Bắt tiếng trực tiếp từ Video'
                      : 'Bắt tiếng Tab Video này'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => startLiveVideoAudioTranslation('microphone', false)}
                  className="min-h-[44px] px-3.5 rounded-2xl lf-elevated text-xs font-bold text-[var(--text-primary)] inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Mic className="w-4 h-4 text-indigo-500 shrink-0" />
                  <span>Nghe qua Loa / Micro</span>
                </button>

                <button
                  type="button"
                  onClick={togglePiP}
                  className="min-h-[44px] px-3.5 rounded-2xl lf-elevated text-xs font-bold text-[var(--text-primary)] inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <PictureInPicture2 className="w-4 h-4 text-[var(--accent-flow)] shrink-0" />
                  <span>Tách Phụ đề Nổi (PiP)</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={stopLiveVideoAudio}
                  className="min-h-[42px] px-4 rounded-2xl bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30 text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5" />
                  <span>Dừng thu & dịch âm thanh</span>
                </button>

                <button
                  type="button"
                  onClick={togglePiP}
                  className="min-h-[42px] px-3.5 rounded-2xl lf-elevated text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <PictureInPicture2 className="w-4 h-4 text-[var(--accent-flow)]" />
                  <span>Tách Phụ đề Nổi (PiP)</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Video Subtitle Action & Sync Control Row */}
        {!focusMode && (
          <div className="rounded-3xl lf-surface p-4 space-y-3.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setQuickPanelOpen(true)}
                  className="min-h-[42px] px-3.5 rounded-2xl lf-elevated text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <SlidersHorizontal className="w-4 h-4 text-[var(--accent-primary)]" />
                  <span>Chỉnh phụ đề</span>
                </button>

                {activeSyncedSegment && (
                  <button
                    type="button"
                    onClick={() =>
                      savePhraseFromSegment(
                        activeSyncedSegment,
                        activeSyncedSegment.sessionId,
                        formatMsToReadableClock(activeSyncedSegment.startTimestamp)
                      )
                    }
                    className="min-h-[42px] px-3.5 rounded-2xl lf-elevated text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Bookmark className="w-4 h-4 text-[var(--accent-flow)]" />
                    <span>Lưu câu thoại</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setShowTranscript((v) => !v)}
                  className="min-h-[42px] px-3.5 rounded-2xl lf-elevated text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <List className="w-4 h-4" />
                  <span>Transcript ({segments.length})</span>
                </button>
              </div>

              {segments.length > 0 && (
                <button
                  type="button"
                  onClick={() => exportCurrentSubtitles('srt')}
                  className="min-h-[42px] px-3.5 rounded-2xl lf-elevated text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-4 h-4 text-[var(--accent-primary)]" />
                  <span>Xuất .SRT</span>
                </button>
              )}
            </div>

            {/* Manual Sync Offset Control */}
            <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between gap-2 flex-wrap">
              <div className="text-xs font-semibold text-[var(--text-secondary)]">
                Đồng bộ phụ đề:{' '}
                <span className="font-mono text-[var(--accent-primary)]">
                  {syncOffsetMs === 0
                    ? 'Tự động (0.0s)'
                    : `${syncOffsetMs > 0 ? '+' : ''}${(syncOffsetMs / 1000).toFixed(1)}s`}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setSyncOffsetMs((v) => Math.max(-5000, v - 300))}
                  className="min-h-[36px] px-2.5 rounded-xl lf-elevated text-xs font-semibold cursor-pointer"
                >
                  Sớm hơn (-0.3s)
                </button>
                <button
                  type="button"
                  onClick={() => setSyncOffsetMs((v) => Math.min(5000, v + 300))}
                  className="min-h-[36px] px-2.5 rounded-xl lf-elevated text-xs font-semibold cursor-pointer"
                >
                  Muộn hơn (+0.3s)
                </button>
                {syncOffsetMs !== 0 && (
                  <button
                    type="button"
                    onClick={() => setSyncOffsetMs(0)}
                    aria-label="Đặt lại đồng bộ tự động"
                    className="min-h-[36px] px-2.5 rounded-xl lf-elevated text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Tự động</span>
                  </button>
                )}
              </div>
            </div>

            {/* Language & Translation Style for Video */}
            <div className="pt-2 border-t border-[var(--border-subtle)] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--text-secondary)]">
                  Ngôn ngữ & Kiểu dịch video
                </span>
                <select
                  aria-label="Kiểu dịch video"
                  value={styleMode}
                  onChange={(e) => {
                    const nextStyle = e.target.value as TranslationStyleMode;
                    setStyleMode(nextStyle);
                    if (segments.length > 0) {
                      translateVideoSegments(segments, sourceLang, videoTitle);
                    }
                  }}
                  className="min-h-[34px] px-2.5 rounded-xl lf-elevated text-xs font-semibold text-[var(--text-primary)]"
                >
                  <option value="natural">Dịch tự nhiên</option>
                  <option value="literal">Dịch sát nghĩa</option>
                  <option value="easy">Dịch dễ hiểu</option>
                  <option value="conversational">Dịch hội thoại</option>
                  <option value="entertainment">Dịch giải trí</option>
                </select>
              </div>
              <LanguageSelectorPills
                value={sourceLang}
                onChange={(lang) => {
                  setSourceLang(lang);
                  audioPipelineRef.current?.updateRecognitionLanguage(lang);
                  if (segments.length > 0) {
                    translateVideoSegments(segments, lang, videoTitle);
                  }
                }}
                compact
              />
            </div>
          </div>
        )}

        {/* Interactive Timestamped Transcript Jump List */}
        {showTranscript && (
          <div className="rounded-3xl lf-surface p-4 space-y-2 max-h-68 overflow-y-auto">
            <div className="text-xs font-bold text-[var(--text-secondary)]">
              Chạm vào câu thoại để nhảy tới thời điểm tương ứng trong video
            </div>
            {segments.length === 0 ? (
              <div className="text-xs text-[var(--text-muted)] py-3">
                {videoSourceType === 'qa-video' && !currentQaDef?.hasEmbeddedSubtitles
                  ? 'Video này không có sẵn phụ đề — bấm Phát để hệ thống nhận diện và tạo phụ đề theo lời nói.'
                  : 'Chưa có câu phụ đề nào. Bấm "Bắt tiếng Video / Tab" để dịch trực tiếp hoặc đính kèm tệp .SRT/.VTT/.ASS.'}
              </div>
            ) : (
              segments.map((seg) => {
                const isActive = activeSyncedSegment?.id === seg.id;
                return (
                  <button
                    key={seg.id}
                    type="button"
                    onClick={() => seekToMs(seg.startTimestamp + 50)}
                    className={`w-full text-left rounded-2xl p-3 transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-[var(--accent-primary-soft)] border border-[var(--accent-primary)]'
                        : 'lf-elevated border border-transparent'
                    }`}
                  >
                    <div className="text-[11px] font-mono text-[var(--accent-primary)]">
                      {formatMsToReadableClock(seg.startTimestamp)} ·{' '}
                      {LANGUAGE_REGISTRY[seg.detectedLanguage].shortLabelVi}
                    </div>
                    <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                      {seg.sourceText}
                    </div>
                    <div className="text-sm font-semibold text-[var(--text-primary)]">
                      {seg.translatedText}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}
      </section>

      <QuickSubtitleSheet
        open={quickPanelOpen}
        onClose={() => setQuickPanelOpen(false)}
        subtitleHidden={subtitleHidden}
        onToggleHidden={() => setSubtitleHidden((h) => !h)}
        sourceLanguage={sourceLang}
        onChangeSourceLanguage={(lang) => {
          setSourceLang(lang);
          audioPipelineRef.current?.updateRecognitionLanguage(lang);
        }}
        isPaused={!isPlaying}
        onTogglePause={togglePlayPause}
        isDraggingSubtitle={isDraggingSub}
        onOpenFullStudio={() => setActiveTab('studio')}
      />
    </div>
  );
};
