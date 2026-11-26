import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  ConcreteLanguageCode,
  DictionaryEntry,
  PlatformCapabilities,
  SavedPhrase,
  SourceLanguageCode,
  StudioLayoutProfile,
  SubtitlePreset,
  TranslationSession,
  TranscriptSegment,
  UserSettings,
} from '../types/domain';
import {
  DEFAULT_USER_SETTINGS,
  storageEngine,
} from '../core/storage/storageEngine';
import {
  BUILTIN_SUBTITLE_PRESETS,
  DEFAULT_STUDIO_LAYOUT_PROFILES,
} from '../core/subtitles/presets';
import {
  detectPlatformCapabilities,
  prefersSystemReducedMotion,
  triggerSubtleHaptic,
} from '../core/platform/platformDetector';
import { translationClient } from '../core/network/translationClient';

export type MainTabId = 'home' | 'live' | 'video' | 'studio' | 'library' | 'settings';

export interface ToastMessage {
  id: string;
  text: string;
  tone: 'info' | 'success' | 'warning' | 'error';
}

interface LinguaFlowContextValue {
  activeTab: MainTabId;
  setActiveTab: (tab: MainTabId) => void;
  settings: UserSettings;
  updateSettings: (patch: Partial<UserSettings>) => void;
  resolvedDark: boolean;
  capabilities: PlatformCapabilities;
  serverStatus: {
    activeDefault: string;
    providers: Array<{ id: string; name: string; configured: boolean; isPaidCloud: boolean }>;
  } | null;
  presets: SubtitlePreset[];
  activePreset: SubtitlePreset;
  setActivePresetId: (id: string) => void;
  updateActivePresetLive: (patch: Partial<SubtitlePreset>) => void;
  savePresetAsNew: (name: string, base?: SubtitlePreset) => SubtitlePreset;
  duplicatePreset: (id: string) => void;
  renamePreset: (id: string, newName: string) => void;
  deletePreset: (id: string) => void;
  resetActivePresetToDefault: () => void;
  undoPresetChange: () => void;
  canUndoPreset: boolean;

  layoutProfiles: StudioLayoutProfile[];
  activeLayout: StudioLayoutProfile;
  setActiveLayoutId: (id: string) => void;
  updateActiveLayout: (updater: (prev: StudioLayoutProfile) => StudioLayoutProfile) => void;
  undoLayoutChange: () => void;
  canUndoLayout: boolean;
  resetLayoutToDefault: () => void;
  duplicateLayoutProfile: (name?: string) => void;

  sessions: TranslationSession[];
  upsertSession: (session: TranslationSession) => void;
  renameSession: (id: string, title: string) => void;
  deleteSession: (id: string) => void;
  clearAllSessions: () => void;
  updateSegmentInSession: (
    sessionId: string,
    segmentId: string,
    patch: Partial<TranscriptSegment>
  ) => void;

  dictionary: DictionaryEntry[];
  addDictionaryEntry: (
    entry: Omit<DictionaryEntry, 'id' | 'createdAt' | 'updatedAt'>
  ) => DictionaryEntry;
  updateDictionaryEntry: (id: string, patch: Partial<DictionaryEntry>) => void;
  deleteDictionaryEntry: (id: string) => void;

  savedPhrases: SavedPhrase[];
  savePhraseFromSegment: (
    segment: TranscriptSegment,
    sessionId?: string,
    timestampLabel?: string
  ) => void;
  updateSavedPhrase: (id: string, patch: Partial<SavedPhrase>) => void;
  deleteSavedPhrase: (id: string) => void;

  // Word Lookup Sheet global state
  wordLookupTarget: {
    term: string;
    sourceLanguage: SourceLanguageCode;
    contextSentence?: string;
  } | null;
  openWordLookup: (
    term: string,
    sourceLanguage: SourceLanguageCode,
    contextSentence?: string
  ) => void;
  closeWordLookup: () => void;

  // Quick Single-Sentence Modal & Subtitle File Modal triggers
  quickTranslateOpen: boolean;
  setQuickTranslateOpen: (open: boolean) => void;
  subtitleFileModalOpen: boolean;
  setSubtitleFileModalOpen: (open: boolean) => void;

  // Opened Transcript session viewer
  inspectingSessionId: string | null;
  setInspectingSessionId: (id: string | null) => void;

  // Active background/live indicator
  liveRunningIndicator: {
    isRunning: boolean;
    modeLabel: string;
    sourceLang: SourceLanguageCode;
    detectedLang?: ConcreteLanguageCode;
  };
  setLiveRunningIndicator: React.Dispatch<
    React.SetStateAction<{
      isRunning: boolean;
      modeLabel: string;
      sourceLang: SourceLanguageCode;
      detectedLang?: ConcreteLanguageCode;
    }>
  >;

  // Global Web / YouTube Link Opener routing
  pendingWebLink: {
    url: string;
    sourceLang?: SourceLanguageCode;
    nonce: number;
  } | null;
  openWebVideoLink: (url: string, sourceLang?: SourceLanguageCode) => void;
  clearPendingWebLink: () => void;

  // Global Floating Bubble ("Bong bóng dịch nổi") & Always-On-Top PiP state
  floatingBubbleVisible: boolean;
  setFloatingBubbleVisible: React.Dispatch<React.SetStateAction<boolean>>;
  floatingBubbleExpanded: boolean;
  setFloatingBubbleExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  globalSubtitleFeed: {
    sourceText: string;
    translatedText: string;
    isPartial: boolean;
    statusLabel: string;
  };
  setGlobalSubtitleFeed: React.Dispatch<
    React.SetStateAction<{
      sourceText: string;
      translatedText: string;
      isPartial: boolean;
      statusLabel: string;
    }>
  >;
  liveQuickCommand: {
    action: 'start-tab' | 'start-mic' | 'toggle-pause' | 'stop';
    nonce: number;
  } | null;
  dispatchLiveQuickCommand: (
    action: 'start-tab' | 'start-mic' | 'toggle-pause' | 'stop'
  ) => void;

  toasts: ToastMessage[];
  showToast: (text: string, tone?: ToastMessage['tone']) => void;
  wipeAllLocalData: () => void;
  haptic: (ms?: number) => void;
}

const LinguaFlowContext = createContext<LinguaFlowContextValue | null>(null);

export const LinguaFlowProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeTab, setActiveTab] = useState<MainTabId>('home');
  const [settings, setSettings] = useState<UserSettings>(() => storageEngine.loadSettings());
  const [presets, setPresets] = useState<SubtitlePreset[]>(() => storageEngine.loadAllPresets());
  const [presetUndoStack, setPresetUndoStack] = useState<SubtitlePreset[]>([]);

  const [layoutProfiles, setLayoutProfiles] = useState<StudioLayoutProfile[]>(() =>
    storageEngine.loadLayoutProfiles()
  );
  const [layoutUndoStack, setLayoutUndoStack] = useState<StudioLayoutProfile[]>([]);

  const [sessions, setSessions] = useState<TranslationSession[]>(() =>
    storageEngine.loadSessions()
  );
  const [dictionary, setDictionary] = useState<DictionaryEntry[]>(() =>
    storageEngine.loadDictionary()
  );
  const [savedPhrases, setSavedPhrases] = useState<SavedPhrase[]>(() =>
    storageEngine.loadSavedPhrases()
  );

  const [capabilities] = useState<PlatformCapabilities>(() => detectPlatformCapabilities());
  const [serverStatus, setServerStatus] = useState<LinguaFlowContextValue['serverStatus']>(null);

  const [wordLookupTarget, setWordLookupTarget] =
    useState<LinguaFlowContextValue['wordLookupTarget']>(null);
  const [quickTranslateOpen, setQuickTranslateOpen] = useState(false);
  const [subtitleFileModalOpen, setSubtitleFileModalOpen] = useState(false);
  const [inspectingSessionId, setInspectingSessionId] = useState<string | null>(null);

  const [liveRunningIndicator, setLiveRunningIndicator] = useState<{
    isRunning: boolean;
    modeLabel: string;
    sourceLang: SourceLanguageCode;
    detectedLang?: ConcreteLanguageCode;
  }>({
    isRunning: false,
    modeLabel: '',
    sourceLang: 'ko',
  });

  const [pendingWebLink, setPendingWebLink] = useState<{
    url: string;
    sourceLang?: SourceLanguageCode;
    nonce: number;
  } | null>(null);

  const [floatingBubbleVisible, setFloatingBubbleVisible] = useState<boolean>(true);
  const [floatingBubbleExpanded, setFloatingBubbleExpanded] = useState<boolean>(false);
  const [globalSubtitleFeed, setGlobalSubtitleFeed] = useState<{
    sourceText: string;
    translatedText: string;
    isPartial: boolean;
    statusLabel: string;
  }>({
    sourceText: '',
    translatedText: '',
    isPartial: false,
    statusLabel: 'Sẵn sàng dịch',
  });

  const [liveQuickCommand, setLiveQuickCommand] = useState<{
    action: 'start-tab' | 'start-mic' | 'toggle-pause' | 'stop';
    nonce: number;
  } | null>(null);

  const cmdNonceRef = useRef(0);

  const openWebVideoLink = useCallback(
    (url: string, sourceLang?: SourceLanguageCode) => {
      const cleaned = url.trim();
      if (!cleaned) return;
      setPendingWebLink({
        url: cleaned,
        sourceLang,
        nonce: ++cmdNonceRef.current,
      });
      setActiveTab('video');
    },
    []
  );

  // Auto-open ?video=<url> query param if user opened LINGUA FLOW in a standalone tab
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const params = new URLSearchParams(window.location.search);
      const videoParam = params.get('video');
      if (videoParam && videoParam.trim()) {
        openWebVideoLink(videoParam.trim());
      }
    } catch {
      // Ignore
    }
  }, [openWebVideoLink]);

  const clearPendingWebLink = useCallback(() => {
    setPendingWebLink(null);
  }, []);

  const dispatchLiveQuickCommand = useCallback(
    (action: 'start-tab' | 'start-mic' | 'toggle-pause' | 'stop') => {
      setLiveQuickCommand({
        action,
        nonce: ++cmdNonceRef.current,
      });
    },
    []
  );

  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const toastCounter = useRef(0);

  const showToast = useCallback(
    (text: string, tone: ToastMessage['tone'] = 'info') => {
      const id = `toast-${++toastCounter.current}`;
      setToasts((prev) => [...prev.slice(-2), { id, text, tone }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 2800);
    },
    []
  );

  const haptic = useCallback(
    (ms = 10) => {
      triggerSubtleHaptic(settings.hapticFeedback, ms);
    },
    [settings.hapticFeedback]
  );

  // Sync system dark mode preference
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  const resolvedDark =
    settings.themeMode === 'dark' ||
    (settings.themeMode === 'system' && systemPrefersDark);

  // Apply theme, UI scale, and Reduce Motion to root <html>
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const html = document.documentElement;
    html.classList.toggle('dark', resolvedDark);
    html.setAttribute('data-ui-scale', settings.uiScale);
    const shouldReduce = settings.reduceMotion || prefersSystemReducedMotion();
    html.setAttribute('data-reduce-motion', shouldReduce ? 'true' : 'false');

    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', resolvedDark ? '#0B0E14' : '#F7F7F4');
    }
  }, [resolvedDark, settings.uiScale, settings.reduceMotion]);

  // Fetch server AI provider status once on load
  useEffect(() => {
    translationClient
      .fetchCapabilities()
      .then((cap) => setServerStatus(cap))
      .catch(() => {
        setServerStatus({
          activeDefault: 'local-hybrid',
          providers: [
            {
              id: 'local-hybrid',
              name: 'Local Contextual CJK Engine',
              configured: true,
              isPaidCloud: false,
            },
          ],
        });
      });
  }, []);

  const updateSettings = useCallback((patch: Partial<UserSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      storageEngine.saveSettings(next);
      return next;
    });
  }, []);

  // Live working copy of built-in or custom preset
  const [liveOverrides, setLiveOverrides] = useState<Record<string, SubtitlePreset>>({});

  const activePreset = useMemo(() => {
    const base =
      presets.find((p) => p.id === settings.activePresetId) ?? BUILTIN_SUBTITLE_PRESETS[0];
    return liveOverrides[base.id] ?? base;
  }, [presets, settings.activePresetId, liveOverrides]);

  const setActivePresetId = useCallback(
    (id: string) => {
      updateSettings({ activePresetId: id });
      setPresetUndoStack([]);
    },
    [updateSettings]
  );

  const updateActivePresetLive = useCallback(
    (patch: Partial<SubtitlePreset>) => {
      setPresetUndoStack((stack) => [...stack.slice(-19), activePreset]);
      const updated: SubtitlePreset = { ...activePreset, ...patch };

      if (activePreset.isBuiltIn) {
        setLiveOverrides((prev) => ({ ...prev, [activePreset.id]: updated }));
      } else {
        setPresets((prev) => {
          const next = prev.map((p) => (p.id === activePreset.id ? updated : p));
          storageEngine.saveCustomPresets(next);
          return next;
        });
      }
    },
    [activePreset]
  );

  const undoPresetChange = useCallback(() => {
    setPresetUndoStack((stack) => {
      if (stack.length === 0) return stack;
      const previous = stack[stack.length - 1];
      if (previous.isBuiltIn) {
        setLiveOverrides((prev) => ({ ...prev, [previous.id]: previous }));
      } else {
        setPresets((prev) => {
          const next = prev.map((p) => (p.id === previous.id ? previous : p));
          storageEngine.saveCustomPresets(next);
          return next;
        });
      }
      return stack.slice(0, -1);
    });
  }, []);

  const resetActivePresetToDefault = useCallback(() => {
    if (activePreset.isBuiltIn) {
      setLiveOverrides((prev) => {
        const copy = { ...prev };
        delete copy[activePreset.id];
        return copy;
      });
    } else {
      const def = BUILTIN_SUBTITLE_PRESETS[0];
      updateActivePresetLive({
        ...def,
        id: activePreset.id,
        name: activePreset.name,
        isBuiltIn: false,
      });
    }
    showToast('Đã đặt lại kiểu phụ đề mặc định', 'info');
  }, [activePreset, showToast, updateActivePresetLive]);

  const savePresetAsNew = useCallback(
    (name: string, base?: SubtitlePreset): SubtitlePreset => {
      const src = base ?? activePreset;
      const newPreset: SubtitlePreset = {
        ...src,
        id: `custom-preset-${Date.now()}`,
        name: name.trim() || 'Mẫu cá nhân mới',
        isBuiltIn: false,
      };
      setPresets((prev) => {
        const next = [...prev, newPreset];
        storageEngine.saveCustomPresets(next);
        return next;
      });
      updateSettings({ activePresetId: newPreset.id });
      showToast(`Đã lưu mẫu phụ đề "${newPreset.name}"`, 'success');
      return newPreset;
    },
    [activePreset, showToast, updateSettings]
  );

  const duplicatePreset = useCallback(
    (id: string) => {
      const target = presets.find((p) => p.id === id) ?? activePreset;
      savePresetAsNew(`${target.name} (Bản sao)`, liveOverrides[target.id] ?? target);
    },
    [activePreset, liveOverrides, presets, savePresetAsNew]
  );

  const renamePreset = useCallback(
    (id: string, newName: string) => {
      const trimmed = newName.trim();
      if (!trimmed) return;
      setPresets((prev) => {
        const next = prev.map((p) => (p.id === id && !p.isBuiltIn ? { ...p, name: trimmed } : p));
        storageEngine.saveCustomPresets(next);
        return next;
      });
      showToast('Đã đổi tên mẫu phụ đề', 'success');
    },
    [showToast]
  );

  const deletePreset = useCallback(
    (id: string) => {
      setPresets((prev) => {
        const target = prev.find((p) => p.id === id);
        if (!target || target.isBuiltIn) return prev;
        const next = prev.filter((p) => p.id !== id);
        storageEngine.saveCustomPresets(next);
        if (settings.activePresetId === id) {
          updateSettings({ activePresetId: BUILTIN_SUBTITLE_PRESETS[0].id });
        }
        return next;
      });
      showToast('Đã xóa mẫu phụ đề cá nhân', 'info');
    },
    [settings.activePresetId, showToast, updateSettings]
  );

  // Studio Layout Profiles
  const activeLayout = useMemo(
    () =>
      layoutProfiles.find((l) => l.id === settings.activeLayoutProfileId) ??
      layoutProfiles[0] ??
      DEFAULT_STUDIO_LAYOUT_PROFILES[0],
    [layoutProfiles, settings.activeLayoutProfileId]
  );

  const setActiveLayoutId = useCallback(
    (id: string) => {
      updateSettings({ activeLayoutProfileId: id });
      setLayoutUndoStack([]);
    },
    [updateSettings]
  );

  const updateActiveLayout = useCallback(
    (updater: (prev: StudioLayoutProfile) => StudioLayoutProfile) => {
      setLayoutUndoStack((s) => [...s.slice(-19), activeLayout]);
      setLayoutProfiles((prev) => {
        const next = prev.map((lp) =>
          lp.id === activeLayout.id ? { ...updater(lp), updatedAt: Date.now() } : lp
        );
        storageEngine.saveLayoutProfiles(next);
        return next;
      });
    },
    [activeLayout]
  );

  const undoLayoutChange = useCallback(() => {
    setLayoutUndoStack((stack) => {
      if (stack.length === 0) return stack;
      const previous = stack[stack.length - 1];
      setLayoutProfiles((prev) => {
        const next = prev.map((lp) => (lp.id === previous.id ? previous : lp));
        storageEngine.saveLayoutProfiles(next);
        return next;
      });
      return stack.slice(0, -1);
    });
  }, []);

  const resetLayoutToDefault = useCallback(() => {
    const factory =
      DEFAULT_STUDIO_LAYOUT_PROFILES.find((d) => d.id === activeLayout.id) ??
      DEFAULT_STUDIO_LAYOUT_PROFILES[0];
    setLayoutProfiles((prev) => {
      const next = prev.map((lp) =>
        lp.id === activeLayout.id
          ? { ...factory, id: lp.id, name: lp.name, updatedAt: Date.now() }
          : lp
      );
      storageEngine.saveLayoutProfiles(next);
      return next;
    });
    setLayoutUndoStack([]);
    showToast('Đã khôi phục bố cục mặc định an toàn', 'info');
  }, [activeLayout.id, showToast]);

  const duplicateLayoutProfile = useCallback(
    (name?: string) => {
      const clone: StudioLayoutProfile = {
        ...activeLayout,
        id: `layout-${Date.now()}`,
        name: name?.trim() || `${activeLayout.name} (Bản sao)`,
        updatedAt: Date.now(),
      };
      setLayoutProfiles((prev) => {
        const next = [...prev, clone];
        storageEngine.saveLayoutProfiles(next);
        return next;
      });
      updateSettings({ activeLayoutProfileId: clone.id });
      showToast(`Đã tạo hồ sơ bố cục "${clone.name}"`, 'success');
    },
    [activeLayout, showToast, updateSettings]
  );

  // Sessions & Transcript History
  const upsertSession = useCallback(
    (session: TranslationSession) => {
      if (!settings.saveHistory) return;
      const sanitized: TranslationSession = settings.saveTranscript
        ? session
        : { ...session, transcriptSegments: [] };
      setSessions((prev) => {
        const idx = prev.findIndex((s) => s.id === sanitized.id);
        const next =
          idx === -1
            ? [sanitized, ...prev]
            : prev.map((s, i) => (i === idx ? sanitized : s));
        storageEngine.saveSessions(next);
        return next;
      });
    },
    [settings.saveHistory, settings.saveTranscript]
  );

  const renameSession = useCallback(
    (id: string, title: string) => {
      const clean = title.trim();
      if (!clean) return;
      setSessions((prev) => {
        const next = prev.map((s) => (s.id === id ? { ...s, title: clean } : s));
        storageEngine.saveSessions(next);
        return next;
      });
      showToast('Đã đổi tên phiên dịch', 'success');
    },
    [showToast]
  );

  const deleteSession = useCallback(
    (id: string) => {
      setSessions((prev) => {
        const next = prev.filter((s) => s.id !== id);
        storageEngine.saveSessions(next);
        return next;
      });
      if (inspectingSessionId === id) setInspectingSessionId(null);
      showToast('Đã xóa phiên khỏi lịch sử', 'info');
    },
    [inspectingSessionId, showToast]
  );

  const clearAllSessions = useCallback(() => {
    setSessions([]);
    storageEngine.saveSessions([]);
    setInspectingSessionId(null);
    showToast('Đã xóa toàn bộ lịch sử dịch', 'info');
  }, [showToast]);

  const updateSegmentInSession = useCallback(
    (sessionId: string, segmentId: string, patch: Partial<TranscriptSegment>) => {
      setSessions((prev) => {
        const next = prev.map((s) => {
          if (s.id !== sessionId) return s;
          return {
            ...s,
            transcriptSegments: s.transcriptSegments.map((seg) =>
              seg.id === segmentId ? { ...seg, ...patch, updatedAt: Date.now() } : seg
            ),
          };
        });
        storageEngine.saveSessions(next);
        return next;
      });
    },
    []
  );

  // Personal Dictionary
  const addDictionaryEntry = useCallback(
    (entry: Omit<DictionaryEntry, 'id' | 'createdAt' | 'updatedAt'>): DictionaryEntry => {
      const now = Date.now();
      const created: DictionaryEntry = {
        ...entry,
        id: `dict-${now}-${Math.random().toString(36).slice(2, 6)}`,
        createdAt: now,
        updatedAt: now,
      };
      setDictionary((prev) => {
        const next = [created, ...prev];
        storageEngine.saveDictionary(next);
        return next;
      });
      showToast(`Đã thêm "${created.originalTerm}" vào Từ điển cá nhân`, 'success');
      return created;
    },
    [showToast]
  );

  const updateDictionaryEntry = useCallback(
    (id: string, patch: Partial<DictionaryEntry>) => {
      setDictionary((prev) => {
        const next = prev.map((e) =>
          e.id === id ? { ...e, ...patch, updatedAt: Date.now() } : e
        );
        storageEngine.saveDictionary(next);
        return next;
      });
    },
    []
  );

  const deleteDictionaryEntry = useCallback(
    (id: string) => {
      setDictionary((prev) => {
        const next = prev.filter((e) => e.id !== id);
        storageEngine.saveDictionary(next);
        return next;
      });
      showToast('Đã xóa mục khỏi Từ điển cá nhân', 'info');
    },
    [showToast]
  );

  // Saved Phrases
  const savePhraseFromSegment = useCallback(
    (segment: TranscriptSegment, sessionId?: string, timestampLabel?: string) => {
      const now = Date.now();
      const created: SavedPhrase = {
        id: `phrase-${now}-${Math.random().toString(36).slice(2, 6)}`,
        sessionId,
        sourceLanguage: segment.detectedLanguage,
        sourceText: segment.sourceText,
        aiTranslation: segment.translatedText,
        userEditedTranslation: segment.isUserEdited ? segment.userEditedText : undefined,
        timestampLabel,
        notes: segment.note,
        isFavorite: true,
        createdAt: now,
        updatedAt: now,
      };
      setSavedPhrases((prev) => {
        const next = [created, ...prev];
        storageEngine.saveSavedPhrases(next);
        return next;
      });
      haptic(12);
      showToast('Đã lưu câu thoại vào Thư viện', 'success');
    },
    [haptic, showToast]
  );

  const updateSavedPhrase = useCallback((id: string, patch: Partial<SavedPhrase>) => {
    setSavedPhrases((prev) => {
      const next = prev.map((p) =>
        p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p
      );
      storageEngine.saveSavedPhrases(next);
      return next;
    });
  }, []);

  const deleteSavedPhrase = useCallback(
    (id: string) => {
      setSavedPhrases((prev) => {
        const next = prev.filter((p) => p.id !== id);
        storageEngine.saveSavedPhrases(next);
        return next;
      });
      showToast('Đã xóa câu đã lưu', 'info');
    },
    [showToast]
  );

  const openWordLookup = useCallback(
    (term: string, sourceLanguage: SourceLanguageCode, contextSentence?: string) => {
      setWordLookupTarget({ term, sourceLanguage, contextSentence });
    },
    []
  );

  const closeWordLookup = useCallback(() => setWordLookupTarget(null), []);

  const wipeAllLocalData = useCallback(() => {
    storageEngine.clearAllUserData();
    setSettings({ ...DEFAULT_USER_SETTINGS, onboardingCompleted: true });
    setPresets(BUILTIN_SUBTITLE_PRESETS);
    setLiveOverrides({});
    setLayoutProfiles(DEFAULT_STUDIO_LAYOUT_PROFILES);
    setSessions([]);
    setDictionary([]);
    setSavedPhrases([]);
    showToast('Đã xóa sạch toàn bộ dữ liệu cục bộ', 'success');
  }, [showToast]);

  const value: LinguaFlowContextValue = {
    activeTab,
    setActiveTab,
    settings,
    updateSettings,
    resolvedDark,
    capabilities,
    serverStatus,
    presets,
    activePreset,
    setActivePresetId,
    updateActivePresetLive,
    savePresetAsNew,
    duplicatePreset,
    renamePreset,
    deletePreset,
    resetActivePresetToDefault,
    undoPresetChange,
    canUndoPreset: presetUndoStack.length > 0,
    layoutProfiles,
    activeLayout,
    setActiveLayoutId,
    updateActiveLayout,
    undoLayoutChange,
    canUndoLayout: layoutUndoStack.length > 0,
    resetLayoutToDefault,
    duplicateLayoutProfile,
    sessions,
    upsertSession,
    renameSession,
    deleteSession,
    clearAllSessions,
    updateSegmentInSession,
    dictionary,
    addDictionaryEntry,
    updateDictionaryEntry,
    deleteDictionaryEntry,
    savedPhrases,
    savePhraseFromSegment,
    updateSavedPhrase,
    deleteSavedPhrase,
    wordLookupTarget,
    openWordLookup,
    closeWordLookup,
    quickTranslateOpen,
    setQuickTranslateOpen,
    subtitleFileModalOpen,
    setSubtitleFileModalOpen,
    inspectingSessionId,
    setInspectingSessionId,
    liveRunningIndicator,
    setLiveRunningIndicator,
    pendingWebLink,
    openWebVideoLink,
    clearPendingWebLink,
    floatingBubbleVisible,
    setFloatingBubbleVisible,
    floatingBubbleExpanded,
    setFloatingBubbleExpanded,
    globalSubtitleFeed,
    setGlobalSubtitleFeed,
    liveQuickCommand,
    dispatchLiveQuickCommand,
    toasts,
    showToast,
    wipeAllLocalData,
    haptic,
  };

  return (
    <LinguaFlowContext.Provider value={value}>
      {children}
    </LinguaFlowContext.Provider>
  );
};

export function useLinguaFlow(): LinguaFlowContextValue {
  const ctx = useContext(LinguaFlowContext);
  if (!ctx) throw new Error('useLinguaFlow must be used inside LinguaFlowProvider');
  return ctx;
}
