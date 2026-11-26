import type { ConcreteLanguageCode, SourceLanguageCode } from '../../types/domain';

export interface LanguageDefinition {
  code: SourceLanguageCode;
  bcp47: string;
  nameVi: string;
  shortLabelVi: string;
  nativeName: string;
  scriptBadge: string; // Non-flag typographic badge (Section 37: avoid flags as core identity)
  sampleGreeting: string;
  sampleVi: string;
  fontStackClass: string;
  punctuationMarks: string[];
  supportsRegionalVariants?: boolean;
}

/**
 * Extensible Language Configuration Registry (Section 4 & Section 51)
 * Designed so adding Thai, English, Indonesian, Spanish, etc. requires only registering a descriptor.
 */
export const LANGUAGE_REGISTRY: Record<SourceLanguageCode, LanguageDefinition> = {
  auto: {
    code: 'auto',
    bcp47: 'ko-KR',
    nameVi: 'Tự động nhận diện',
    shortLabelVi: 'Tự động',
    nativeName: 'Auto CJK',
    scriptBadge: 'AI',
    sampleGreeting: 'Tự nhận diện Hàn · Nhật · Trung',
    sampleVi: 'Tự động phát hiện ngôn ngữ đang nói',
    fontStackClass: 'font-sans',
    punctuationMarks: ['.', '?', '!', '。', '？', '！'],
  },
  ko: {
    code: 'ko',
    bcp47: 'ko-KR',
    nameVi: 'Tiếng Hàn',
    shortLabelVi: 'Hàn',
    nativeName: '한국어',
    scriptBadge: '한',
    sampleGreeting: '여러분 안녕하세요! 오늘 방송 시작할게요.',
    sampleVi: 'Chào mọi người nhé! Hôm nay mình bắt đầu buổi phát sóng đây.',
    fontStackClass: 'font-ko',
    punctuationMarks: ['.', '?', '!', '…', '~'],
  },
  ja: {
    code: 'ja',
    bcp47: 'ja-JP',
    nameVi: 'Tiếng Nhật',
    shortLabelVi: 'Nhật',
    nativeName: '日本語',
    scriptBadge: 'あ',
    sampleGreeting: '皆さんこんばんは！今日の配信もよろしくお願いします。',
    sampleVi: 'Chào buổi tối mọi người! Buổi livestream hôm nay cũng mong mọi người ủng hộ nhé.',
    fontStackClass: 'font-ja',
    punctuationMarks: ['。', '？', '！', '…', '、'],
  },
  'zh-CN': {
    code: 'zh-CN',
    bcp47: 'zh-CN',
    nameVi: 'Tiếng Trung (Giản thể)',
    shortLabelVi: 'Trung · Giản',
    nativeName: '简体中文',
    scriptBadge: '简',
    sampleGreeting: '大家好，欢迎来到今天的直播间！',
    sampleVi: 'Chào mọi người, chào mừng đến với phòng livestream hôm nay!',
    fontStackClass: 'font-zh-hans',
    punctuationMarks: ['。', '？', '！', '…', '，'],
    supportsRegionalVariants: true,
  },
  'zh-TW': {
    code: 'zh-TW',
    bcp47: 'zh-TW',
    nameVi: 'Tiếng Trung (Phồn thể)',
    shortLabelVi: 'Trung · Phồn',
    nativeName: '繁體中文',
    scriptBadge: '繁',
    sampleGreeting: '大家好，歡迎來到今天的直播間，這支影片超精彩！',
    sampleVi: 'Chào mọi người, chào mừng đến với buổi livestream hôm nay, video này cực kỳ hấp dẫn!',
    fontStackClass: 'font-zh-hant',
    punctuationMarks: ['。', '？', '！', '…', '，'],
    supportsRegionalVariants: true,
  },
};

export const ORDERED_SOURCE_LANGUAGES: SourceLanguageCode[] = [
  'auto',
  'ko',
  'ja',
  'zh-CN',
  'zh-TW',
];

export const CONCRETE_SOURCE_LANGUAGES: ConcreteLanguageCode[] = [
  'ko',
  'ja',
  'zh-CN',
  'zh-TW',
];

// Characters distinctly Traditional vs Simplified for fast script disambiguation
const TRADITIONAL_MARKERS =
  /[體國會發開關東車馬門見長風電買賣學時實點話語認識聽書讀寫樂愛親無應為與對專業視訊網路軟體影片連結這們個來後裡]/;
const SIMPLIFIED_MARKERS =
  /[体国会发开关东车马门见长风电买卖学时实点话语认识听书读写乐爱亲无应为与对专业视频网络软件链接这们个来后]/;

/**
 * Automatic Language Detection with Loanword Hysteresis (Section 4.3):
 * Prevents flipping input language just because of English loanwords, numbers, or short proper nouns.
 */
export function detectCJKLanguage(
  text: string,
  previousLanguage?: ConcreteLanguageCode
): { language: ConcreteLanguageCode; confidence: number; switched: boolean } {
  const cleaned = text.trim();
  if (!cleaned) {
    return {
      language: previousLanguage ?? 'ko',
      confidence: 0.4,
      switched: false,
    };
  }

  let hangulCount = 0;
  let kanaCount = 0;
  let hanziCount = 0;
  let latinCount = 0;

  for (const ch of cleaned) {
    const code = ch.codePointAt(0) ?? 0;
    if (
      (code >= 0xac00 && code <= 0xd7af) ||
      (code >= 0x1100 && code <= 0x11ff) ||
      (code >= 0x3130 && code <= 0x318f)
    ) {
      hangulCount++;
    } else if (
      (code >= 0x3040 && code <= 0x309f) || // Hiragana
      (code >= 0x30a0 && code <= 0x30ff) || // Katakana
      (code >= 0x31f0 && code <= 0x31ff)
    ) {
      kanaCount++;
    } else if (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3400 && code <= 0x4dbf)
    ) {
      hanziCount++;
    } else if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) {
      latinCount++;
    }
  }

  const cjkTotal = hangulCount + kanaCount + hanziCount;

  // Hysteresis rule: if utterance is mostly Latin loanwords/proper names (e.g. "OK!", "GG", "Faker", "YouTube")
  // keep the established session language rather than thrashing!
  if (cjkTotal === 0 && previousLanguage) {
    return {
      language: previousLanguage,
      confidence: 0.55,
      switched: false,
    };
  }

  let detected: ConcreteLanguageCode = previousLanguage ?? 'ko';
  let confidence = 0.65;

  if (hangulCount > 0 && hangulCount >= kanaCount && hangulCount >= hanziCount * 0.5) {
    detected = 'ko';
    confidence = Math.min(0.99, 0.78 + hangulCount * 0.03);
  } else if (kanaCount > 0) {
    detected = 'ja';
    confidence = Math.min(0.99, 0.8 + (kanaCount + hanziCount) * 0.025);
  } else if (hanziCount > 0) {
    // Distinguish Japanese pure-Kanji short compounds if session was already Japanese and no strong Chinese grammar particles
    const japaneseKanjiOnlyHint =
      previousLanguage === 'ja' &&
      hanziCount <= 3 &&
      !/[的了嗎吗呢吧這这那們们沒没很太在是]/.test(cleaned);
    if (japaneseKanjiOnlyHint) {
      detected = 'ja';
      confidence = 0.72;
    } else {
      const hasTrad = TRADITIONAL_MARKERS.test(cleaned);
      const hasSimp = SIMPLIFIED_MARKERS.test(cleaned);
      if (hasTrad && !hasSimp) {
        detected = 'zh-TW';
        confidence = 0.94;
      } else if (hasSimp && !hasTrad) {
        detected = 'zh-CN';
        confidence = 0.94;
      } else if (previousLanguage === 'zh-TW') {
        detected = 'zh-TW';
        confidence = 0.82;
      } else {
        detected = 'zh-CN';
        confidence = 0.84;
      }
    }
  } else if (latinCount > 0 && previousLanguage) {
    detected = previousLanguage;
    confidence = 0.5;
  }

  // Require at least 2 CJK chars to switch away from an already-locked session language
  if (previousLanguage && detected !== previousLanguage && cjkTotal < 2) {
    return {
      language: previousLanguage,
      confidence: 0.6,
      switched: false,
    };
  }

  return {
    language: detected,
    confidence,
    switched: Boolean(previousLanguage && detected !== previousLanguage),
  };
}
