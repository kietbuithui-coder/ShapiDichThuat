export type SourceLanguageCode = 'auto' | 'ko' | 'ja' | 'zh-CN' | 'zh-TW';
export type ConcreteLanguageCode = 'ko' | 'ja' | 'zh-CN' | 'zh-TW';
export type TargetLanguageCode = 'vi';

export type SessionMode =
  | 'livestream'
  | 'video'
  | 'microphone'
  | 'subtitle-file'
  | 'quick-translate';

/**
 * 10 explicit session states required by Section 9.3
 */
export type SessionStatus =
  | 'idle'          // Chờ bắt đầu
  | 'connecting'    // Đang kết nối
  | 'listening'     // Đang nghe
  | 'recognizing'   // Đang nhận diện
  | 'translating'   // Đang dịch
  | 'syncing'       // Đang đồng bộ
  | 'paused'        // Tạm dừng
  | 'source_lost'   // Mất nguồn
  | 'offline'       // Mất mạng
  | 'completed';    // Hoàn thành

export type RecognitionStatus = 'recognizing' | 'updating' | 'confirmed';
export type TranslationStatus = 'pending' | 'translating' | 'completed' | 'uncertain' | 'error';

/**
 * 5 translation styles + 3 naturalness levels (Section 13)
 */
export type TranslationStyleMode =
  | 'natural'        // Dịch tự nhiên (livestream, giải trí)
  | 'literal'        // Dịch sát nghĩa (học ngoại ngữ, đối chiếu)
  | 'easy'           // Dịch dễ hiểu (rõ ý cho người mới)
  | 'conversational' // Dịch hội thoại (ưu tiên đại từ, xưng hô)
  | 'entertainment'; // Dịch giải trí (giữ sắc thái, tiếng lóng, biểu cảm)

export type NaturalnessLevel = 'accurate' | 'balanced' | 'natural';

export type CostQualityTier = 'economy' | 'balanced' | 'high_quality';

export type AudioSourceType =
  | 'microphone'
  | 'display-audio'
  | 'android-playback-capture'
  | 'video-element'
  | 'subtitle-track'
  | 'qa-test-stream';

/**
 * Subtitle display modes (Section 12)
 */
export type SubtitleDisplayMode =
  | 'vi-only'        // Chỉ tiếng Việt (mặc định)
  | 'bilingual'      // Song ngữ (Gốc + Việt)
  | 'source-only'    // Chỉ ngôn ngữ gốc
  | 'minimal'        // Phụ đề tối giản (bỏ khung/nền)
  | 'full-transcript'; // Chế độ transcript đầy đủ

export type SubtitleSegmentationMode =
  | 'live-incremental' // Phụ đề cập nhật trực tiếp
  | 'sentence-complete'; // Phụ đề theo câu hoàn chỉnh

export interface MorphologicalToken {
  surface: string;
  baseForm?: string;
  reading?: string;       // Romaja / Hiragana-Romaji / Pinyin có dấu
  hanViet?: string;       // Âm Hán-Việt (cho chữ Hán / Kanji)
  meaningVi?: string;     // Nghĩa tiếng Việt theo từ điển
  pos?: string;           // Từ loại (Danh từ, Động từ, Trợ từ, Kính ngữ...)
  grammarNote?: string;
  isProperNoun?: boolean;
  isGlossaryMatch?: boolean;
}

export interface TranscriptSegment {
  id: string;
  sessionId: string;
  startTimestamp: number; // milliseconds from session/video start
  endTimestamp: number;   // milliseconds
  sourceText: string;
  translatedText: string;
  userEditedText?: string;
  isUserEdited?: boolean;
  speakerId?: string;     // e.g. 'speaker-1', 'speaker-2'
  recognitionStatus: RecognitionStatus;
  translationStatus: TranslationStatus;
  confidence: number;     // 0.0 - 1.0
  detectedLanguage: ConcreteLanguageCode;
  tokens?: MorphologicalToken[];
  explanationVi?: string; // Giải thích ngắn về ngữ cảnh/kính ngữ (42.3)
  note?: string;          // Ghi chú cá nhân (42.4)
  isSaved?: boolean;
  latencyMs?: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Complete 22+ property SubtitlePreset (Section 10.1 & Section 39)
 */
export interface SubtitlePreset {
  id: string;
  name: string;
  description?: string;
  isBuiltIn?: boolean;
  contextTag?: 'livestream' | 'cinema' | 'study' | 'night' | 'compact' | 'general';
  fontFamily: 'sans' | 'cjk' | 'rounded' | 'serif' | 'mono';
  fontSize: number;           // 13 - 42 px
  fontWeight: 400 | 500 | 600 | 700;
  textColor: string;          // Hex
  sourceTextColor: string;    // Hex for original language line in bilingual mode
  backgroundColor: string;    // Hex
  backgroundOpacity: number;  // 0.0 - 1.0
  backdropBlur: number;       // 0 - 20 px (Floating Glass)
  textOutline: 'none' | 'light' | 'medium' | 'strong';
  textShadow: 'none' | 'soft' | 'crisp' | 'cinema';
  lineSpacing: number;        // 1.15 - 2.0
  letterSpacing: number;      // -0.02 - 0.08 em
  alignment: 'left' | 'center' | 'right';
  positionX: number;          // 5 - 95 (% center anchor X)
  positionY: number;          // 8 - 92 (% anchor Y from top)
  safeMargin: number;         // 8 - 36 px from screen edge
  maxWidth: number;           // 50 - 96 (% of viewport width)
  maxLines: number;           // 1 - 4
  cornerRadius: number;       // 0 - 28 px
  paddingX: number;           // 8 - 28 px
  paddingY: number;           // 6 - 22 px
  subtitleMode: SubtitleDisplayMode;
  bilingualOrder: 'source-top' | 'vi-top';
  bilingualScaleRatio: number; // 0.65 - 1.0 (size of secondary line vs primary Vietnamese)
  segmentationMode: SubtitleSegmentationMode;
  displaySpeed: 'instant' | 'smooth' | 'calm';
  holdDurationMs: number;     // 1500 - 8000 ms
}

export interface PrivacySessionSettings {
  saveHistory: boolean;
  saveTranscript: boolean;
  saveRawAudio: boolean; // Always false by default (Section 8.3 & 30)
}

export interface TranslationSession {
  id: string;
  title: string;
  sourceLanguage: SourceLanguageCode;
  detectedLanguage?: ConcreteLanguageCode;
  targetLanguage: TargetLanguageCode;
  sourceType: SessionMode;
  createdAt: number;
  startedAt: number;
  endedAt?: number;
  durationMs: number;
  sessionStatus: SessionStatus;
  subtitlePresetId: string;
  translationMode: TranslationStyleMode;
  naturalnessLevel: NaturalnessLevel;
  audioSource: AudioSourceType;
  transcriptSegments: TranscriptSegment[];
  speakerLabels: Record<string, string>; // e.g., { 'speaker-1': 'Người nói 1' }
  dictionaryEnabled: boolean;
  privacySettings: PrivacySessionSettings;
  notes?: string;
}

export interface DictionaryEntry {
  id: string;
  originalTerm: string;
  preferredTranslation: string;
  sourceLanguage: SourceLanguageCode;
  category: 'person' | 'streamer' | 'game' | 'brand' | 'pronoun' | 'slang' | 'general';
  keepOriginal: boolean;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface SavedPhrase {
  id: string;
  sessionId?: string;
  sourceLanguage: ConcreteLanguageCode;
  sourceText: string;
  aiTranslation: string;
  userEditedTranslation?: string;
  reading?: string;
  timestampLabel?: string;
  notes?: string;
  isFavorite: boolean;
  createdAt: number;
  updatedAt: number;
}

/**
 * Customize Studio Canvas & Flexible Toolbar (Section 11)
 */
export type StudioWidgetId =
  | 'subtitle-box'
  | 'control-bar'
  | 'quick-pause'
  | 'quick-translate'
  | 'status-badge'
  | 'language-pill'
  | 'mini-transcript';

export interface StudioWidgetPlacement {
  id: StudioWidgetId;
  label: string;
  x: number; // % 5..95
  y: number; // % 5..95
  visible: boolean;
  lockedSafeZone?: boolean;
}

export type ToolbarActionId =
  | 'pause-resume'
  | 'subtitle-style'
  | 'bilingual-toggle'
  | 'hide-subtitle'
  | 'language-switch'
  | 'mini-transcript'
  | 'minimal-mode'
  | 'end-session';

export interface ToolbarConfig {
  orderedActions: ToolbarActionId[];
  hiddenActions: ToolbarActionId[];
  buttonDisplay: 'icon-only' | 'icon-label';
  size: 'compact' | 'standard' | 'large';
  position: 'bottom' | 'top' | 'floating-right';
  expanded: boolean;
}

export interface StudioLayoutProfile {
  id: string;
  name: string;
  contextType: 'livestream' | 'long-video' | 'short-video' | 'study' | 'cinema';
  widgets: StudioWidgetPlacement[];
  toolbar: ToolbarConfig;
  snapToGrid: boolean;
  gridSizePct: number;
  updatedAt: number;
}

export type ThemeMode = 'light' | 'dark' | 'system';
export type NetworkDataMode = 'standard' | 'speed-priority' | 'data-saver';

export interface UserSettings {
  schemaVersion: number;
  onboardingCompleted: boolean;
  // 1. Ngôn ngữ
  uiLanguage: 'vi';
  defaultSourceLanguage: SourceLanguageCode;
  targetLanguage: TargetLanguageCode;
  autoDetectLanguage: boolean;
  // 2. Phụ đề
  activePresetId: string;
  defaultBilingual: boolean;
  // 3. Dịch thuật
  defaultTranslationStyle: TranslationStyleMode;
  naturalnessLevel: NaturalnessLevel;
  dictionaryEnabledByDefault: boolean;
  properNounMode: 'keep-original' | 'smart-transliterate';
  preferredProvider: 'auto' | 'local-hybrid' | 'openai' | 'gemini';
  costQualityTier: CostQualityTier;
  // 4. Âm thanh
  preferredAudioSource: AudioSourceType;
  micSensitivity: number; // 0.2 - 1.0
  noiseSuppression: boolean;
  autoGainControl: boolean;
  // 5. Hiệu năng
  batterySaver: boolean;
  networkDataMode: NetworkDataMode;
  // 6. Quyền riêng tư
  saveHistory: boolean;
  saveTranscript: boolean;
  saveRawAudio: boolean;
  // 7. Giao diện & Trợ năng
  themeMode: ThemeMode;
  reduceMotion: boolean;
  uiScale: 'normal' | 'large' | 'extra-large';
  hapticFeedback: boolean;
  activeLayoutProfileId: string;
}

export interface PlatformCapabilities {
  os: 'android' | 'ios' | 'desktop-web' | 'mobile-web';
  isNativeCapacitor: boolean;
  supportsMicrophone: boolean;
  supportsWebSpeechASR: boolean;
  supportsDisplayAudioCapture: boolean;
  supportsAndroidFloatingOverlay: boolean;
  supportsAndroidPlaybackCapture: boolean;
  supportsPictureInPicture: boolean;
  supportsSpeechSynthesis: boolean;
  limitationsSummaryVi: string[];
}

export interface TranslationRequestPayload {
  text: string;
  sourceLanguage: SourceLanguageCode;
  targetLanguage?: TargetLanguageCode;
  styleMode: TranslationStyleMode;
  naturalnessLevel: NaturalnessLevel;
  properNounMode: 'keep-original' | 'smart-transliterate';
  costTier?: CostQualityTier;
  preferredProvider?: 'auto' | 'local-hybrid' | 'openai' | 'gemini';
  contextTurns?: Array<{
    sourceText: string;
    translatedText: string;
    speakerId?: string;
  }>;
  glossary?: Array<{
    originalTerm: string;
    preferredTranslation: string;
    keepOriginal?: boolean;
  }>;
  previousDetectedLanguage?: ConcreteLanguageCode;
  isInterim?: boolean;
}

export interface TranslationResponsePayload {
  translatedText: string;
  detectedLanguage: ConcreteLanguageCode;
  languageSwitchSuggested?: boolean;
  confidence: number;
  providerUsed: string;
  latencyMs: number;
  tokens: MorphologicalToken[];
  explanationVi?: string;
  uncertainReasonVi?: string;
}
