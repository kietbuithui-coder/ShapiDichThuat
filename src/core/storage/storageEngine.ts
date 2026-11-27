import type {
  DictionaryEntry,
  SavedPhrase,
  StudioLayoutProfile,
  SubtitlePreset,
  TranslationSession,
  UserSettings,
} from '../../types/domain';
import {
  BUILTIN_SUBTITLE_PRESETS,
  DEFAULT_STUDIO_LAYOUT_PROFILES,
} from '../subtitles/presets';

const STORAGE_KEYS = {
  SETTINGS: 'linguaflow.v1.settings',
  CUSTOM_PRESETS: 'linguaflow.v1.custom_presets',
  LAYOUT_PROFILES: 'linguaflow.v1.layout_profiles',
  SESSIONS: 'linguaflow.v1.sessions',
  DICTIONARY: 'linguaflow.v1.dictionary',
  SAVED_PHRASES: 'linguaflow.v1.saved_phrases',
} as const;

export const CURRENT_SCHEMA_VERSION = 1;

export const DEFAULT_USER_SETTINGS: UserSettings = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  onboardingCompleted: false,
  uiLanguage: 'vi',
  defaultSourceLanguage: 'ko',
  targetLanguage: 'vi',
  autoDetectLanguage: true,
  activePresetId: 'preset-live',
  defaultBilingual: false,
  defaultTranslationStyle: 'natural',
  naturalnessLevel: 'balanced',
  dictionaryEnabledByDefault: true,
  properNounMode: 'keep-original',
  preferredProvider: 'auto',
  costQualityTier: 'balanced',
  preferredAudioSource: 'microphone',
  micSensitivity: 0.65,
  noiseSuppression: true,
  autoGainControl: true,
  batterySaver: false,
  networkDataMode: 'standard',
  saveHistory: true,
  saveTranscript: true,
  saveRawAudio: false, // Never store raw audio by default (Section 8.3 & 30)
  themeMode: 'light',  // Light Mode default per Section 7.3
  reduceMotion: false,
  uiScale: 'normal',
  hapticFeedback: true,
  activeLayoutProfileId: 'layout-livestream',
};

export const INITIAL_DICTIONARY_ENTRIES: DictionaryEntry[] = [
  {
    id: 'dict-faker',
    originalTerm: '페이커',
    preferredTranslation: 'Faker',
    sourceLanguage: 'ko',
    category: 'streamer',
    keepOriginal: false,
    notes: 'Tuyển thủ T1 đường giữa — giữ biệt danh quốc tế',
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now() - 86400000,
  },
  {
    id: 'dict-genshin',
    originalTerm: '原神',
    preferredTranslation: 'Genshin Impact',
    sourceLanguage: 'auto',
    category: 'game',
    keepOriginal: false,
    notes: 'Tên game chung cho cả tiếng Trung và tiếng Nhật',
    createdAt: Date.now() - 72000000,
    updatedAt: Date.now() - 72000000,
  },
  {
    id: 'dict-oshi',
    originalTerm: '推し',
    preferredTranslation: 'bias / idol yêu thích',
    sourceLanguage: 'ja',
    category: 'slang',
    keepOriginal: false,
    notes: 'Thuật ngữ văn hóa thần tượng Nhật Bản',
    createdAt: Date.now() - 36000000,
    updatedAt: Date.now() - 36000000,
  },
];

function safeReadJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined' || !window.localStorage) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeWriteJson<T>(key: string, value: T): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Handle storage quota gracefully
  }
}

/**
 * Local-First Storage Engine with Schema Migration (Section 34 & Section 39)
 */
export const storageEngine = {
  loadSettings(): UserSettings {
    const saved = safeReadJson<Partial<UserSettings>>(STORAGE_KEYS.SETTINGS, {});
    const merged: UserSettings = {
      ...DEFAULT_USER_SETTINGS,
      ...saved,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      // Enforce safety invariant: raw audio is never persisted unexpectedly
      saveRawAudio: Boolean(saved.saveRawAudio ?? false),
    };
    return merged;
  },

  saveSettings(settings: UserSettings): void {
    safeWriteJson(STORAGE_KEYS.SETTINGS, {
      ...settings,
      schemaVersion: CURRENT_SCHEMA_VERSION,
    });
  },

  loadAllPresets(): SubtitlePreset[] {
    const custom = safeReadJson<SubtitlePreset[]>(STORAGE_KEYS.CUSTOM_PRESETS, []);
    return [...BUILTIN_SUBTITLE_PRESETS, ...custom];
  },

  saveCustomPresets(presets: SubtitlePreset[]): void {
    const customOnly = presets.filter((p) => !p.isBuiltIn);
    safeWriteJson(STORAGE_KEYS.CUSTOM_PRESETS, customOnly);
  },

  loadLayoutProfiles(): StudioLayoutProfile[] {
    const saved = safeReadJson<StudioLayoutProfile[] | null>(STORAGE_KEYS.LAYOUT_PROFILES, null);
    if (!saved || saved.length === 0) {
      return DEFAULT_STUDIO_LAYOUT_PROFILES;
    }
    return saved;
  },

  saveLayoutProfiles(profiles: StudioLayoutProfile[]): void {
    safeWriteJson(STORAGE_KEYS.LAYOUT_PROFILES, profiles);
  },

  loadSessions(): TranslationSession[] {
    return safeReadJson<TranslationSession[]>(STORAGE_KEYS.SESSIONS, []);
  },

  saveSessions(sessions: TranslationSession[]): void {
    // Bound max stored sessions to 100 to prevent unbounded storage bloat
    safeWriteJson(STORAGE_KEYS.SESSIONS, sessions.slice(0, 100));
  },

  loadDictionary(): DictionaryEntry[] {
    const saved = safeReadJson<DictionaryEntry[] | null>(STORAGE_KEYS.DICTIONARY, null);
    if (saved === null) {
      safeWriteJson(STORAGE_KEYS.DICTIONARY, INITIAL_DICTIONARY_ENTRIES);
      return INITIAL_DICTIONARY_ENTRIES;
    }
    return saved;
  },

  saveDictionary(entries: DictionaryEntry[]): void {
    safeWriteJson(STORAGE_KEYS.DICTIONARY, entries);
  },

  loadSavedPhrases(): SavedPhrase[] {
    return safeReadJson<SavedPhrase[]>(STORAGE_KEYS.SAVED_PHRASES, []);
  },

  saveSavedPhrases(phrases: SavedPhrase[]): void {
    safeWriteJson(STORAGE_KEYS.SAVED_PHRASES, phrases);
  },

  clearAllUserData(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    Object.values(STORAGE_KEYS).forEach((k) => window.localStorage.removeItem(k));
  },

  exportBackupJson(): string {
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        app: 'SHAPI FLOW',
        schemaVersion: CURRENT_SCHEMA_VERSION,
        settings: this.loadSettings(),
        customPresets: safeReadJson(STORAGE_KEYS.CUSTOM_PRESETS, []),
        layoutProfiles: this.loadLayoutProfiles(),
        dictionary: this.loadDictionary(),
        savedPhrases: this.loadSavedPhrases(),
        sessions: this.loadSessions(),
      },
      null,
      2
    );
  },
};
