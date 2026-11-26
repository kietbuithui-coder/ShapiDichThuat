import path from 'node:path';
import * as kuromojiNs from 'kuromoji';
import { pinyin } from 'pinyin-pro';
import * as OpenCC from 'opencc-js';
import { getHanviet } from 'hanviet-pinyin-words';
import * as SegmentitNs from 'segmentit';
import type {
  ConcreteLanguageCode,
  MorphologicalToken,
  NaturalnessLevel,
  SourceLanguageCode,
  TranslationRequestPayload,
  TranslationResponsePayload,
  TranslationStyleMode,
} from '../../src/types/domain';
import { detectCJKLanguage } from '../../src/core/languages/languageRegistry';
import {
  JA_LEXICON,
  JA_PHRASES,
  KO_LEXICON,
  KO_PHRASES,
  PROTECTED_PROPER_NOUNS,
  ZH_LEXICON,
  ZH_PHRASES,
} from './lexicons';

type KuromojiToken = {
  surface_form: string;
  pos: string;
  pos_detail_1: string;
  basic_form: string;
  reading?: string;
  pronunciation?: string;
};

type KuromojiTokenizer = {
  tokenize: (text: string) => KuromojiToken[];
};

// Resolve ESM / CJS interop cleanly across Node, tsx, and Vitest
const segMod = ((SegmentitNs as unknown as { default?: unknown }).default ??
  SegmentitNs) as {
  Segment?: new () => { doSegment: (text: string, opts?: { simple?: boolean }) => string[] };
  useDefault?: <T>(seg: T) => T;
  default?: {
    Segment: new () => { doSegment: (text: string, opts?: { simple?: boolean }) => string[] };
    useDefault: <T>(seg: T) => T;
  };
};
const SegmentCtor = segMod.Segment ?? segMod.default!.Segment;
const useDefaultFn = segMod.useDefault ?? segMod.default!.useDefault;

const kuroMod = ((kuromojiNs as unknown as { default?: unknown }).default ??
  kuromojiNs) as {
  builder: (opts: { dicPath: string }) => {
    build: (cb: (err: Error | null, tokenizer: KuromojiTokenizer) => void) => void;
  };
};

const zhSegmenter = useDefaultFn(new SegmentCtor());
const toSimpTw = OpenCC.Converter({ from: 'tw', to: 'cn' });
const toSimpHk = OpenCC.Converter({ from: 'hk', to: 'cn' });
const toSimp = (txt: string) => toSimpHk(toSimpTw(txt)).replace(/讚/g, '赞');
const toTrad = OpenCC.Converter({ from: 'cn', to: 't' });

let kuromojiPromise: Promise<KuromojiTokenizer> | null = null;

function getKuromojiTokenizer(): Promise<KuromojiTokenizer> {
  if (!kuromojiPromise) {
    const dicPath = path.resolve(process.cwd(), 'node_modules/kuromoji/dict');
    kuromojiPromise = new Promise((resolve, reject) => {
      kuroMod.builder({ dicPath }).build((err: Error | null, tokenizer: KuromojiTokenizer) => {
        if (err) reject(err);
        else resolve(tokenizer);
      });
    });
  }
  return kuromojiPromise;
}

// ============================================================================
// PHONETIC & SCRIPT HELPERS (Romaja, Hiragana/Romaji, Pinyin, Hán-Việt)
// ============================================================================

const CHOSEONG_RR = [
  'g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp',
  's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h',
];
const JUNGSEONG_RR = [
  'a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae',
  'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i',
];
const JONGSEONG_RR = [
  '', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'k', 'm', 'p',
  'l', 't', 'p', 'l', 'm', 'p', 'p', 't', 't', 'ng', 't', 't',
  'k', 't', 'p', 't',
];

export function romanizeHangul(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0xac00 && code <= 0xd7a3) {
      const offset = code - 0xac00;
      const cho = Math.floor(offset / 588);
      const jung = Math.floor((offset % 588) / 28);
      const jong = offset % 28;
      out += CHOSEONG_RR[cho] + JUNGSEONG_RR[jung] + JONGSEONG_RR[jong];
    } else {
      out += ch;
    }
  }
  return out;
}

export function katakanaToHiragana(kata: string): string {
  return Array.from(kata)
    .map((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      if (code >= 0x30a1 && code <= 0x30f6) {
        return String.fromCodePoint(code - 0x60);
      }
      return ch;
    })
    .join('');
}

const HIRA_ROMAJI_MAP: Record<string, string> = {
  きゃ: 'kya', きゅ: 'kyu', きょ: 'kyo', しゃ: 'sha', しゅ: 'shu', しょ: 'sho',
  ちゃ: 'cha', ちゅ: 'chu', ちょ: 'cho', にゃ: 'nya', にゅ: 'nyu', にょ: 'nyo',
  ひゃ: 'hya', ひゅ: 'hyu', ひょ: 'hyo', みゃ: 'mya', みゅ: 'myu', みょ: 'myo',
  りゃ: 'rya', りゅ: 'ryu', りょ: 'ryo', ぎゃ: 'gya', ぎゅ: 'gyu', ぎょ: 'gyo',
  じゃ: 'ja', じゅ: 'ju', じょ: 'jo', びゃ: 'bya', びゅ: 'byu', びょ: 'byo',
  ぴゃ: 'pya', ぴゅ: 'pyu', ぴょ: 'pyo',
  あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o',
  か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko',
  さ: 'sa', し: 'shi', す: 'su', せ: 'se', そ: 'so',
  た: 'ta', ち: 'chi', つ: 'tsu', て: 'te', と: 'to',
  な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no',
  は: 'ha', ひ: 'hi', ふ: 'fu', へ: 'he', ほ: 'ho',
  ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo',
  や: 'ya', ゆ: 'yu', よ: 'yo',
  ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro',
  わ: 'wa', を: 'o', ん: 'n',
  が: 'ga', ぎ: 'gi', ぐ: 'gu', げ: 'ge', ご: 'go',
  ざ: 'za', じ: 'ji', ず: 'zu', ぜ: 'ze', ぞ: 'zo',
  だ: 'da', ぢ: 'ji', づ: 'zu', で: 'de', ど: 'do',
  ば: 'ba', び: 'bi', ぶ: 'bu', べ: 'be', ぼ: 'bo',
  ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po',
  ー: '-',
};

export function hiraganaToRomaji(hira: string): string {
  let res = '';
  let i = 0;
  while (i < hira.length) {
    if (hira[i] === 'っ' && i + 1 < hira.length) {
      const nextTwo = hira.slice(i + 1, i + 3);
      const nextRom = HIRA_ROMAJI_MAP[nextTwo] ?? HIRA_ROMAJI_MAP[hira[i + 1]] ?? '';
      res += nextRom[0] ?? '';
      i++;
      continue;
    }
    const two = hira.slice(i, i + 2);
    if (HIRA_ROMAJI_MAP[two]) {
      res += HIRA_ROMAJI_MAP[two];
      i += 2;
      continue;
    }
    res += HIRA_ROMAJI_MAP[hira[i]] ?? hira[i];
    i++;
  }
  return res;
}

export function computeHanVietSafe(hanziText: string): string | undefined {
  const cjkChars = Array.from(hanziText).filter((c) => {
    const code = c.codePointAt(0) ?? 0;
    return code >= 0x4e00 && code <= 0x9fff;
  });
  if (cjkChars.length === 0) return undefined;
  try {
    const joined = cjkChars.join('');
    const simp = toSimp(joined);
    const tradArr = Array.from(toTrad(simp));
    const pyArr = pinyin(simp, { toneType: 'num', type: 'array' });
    if (tradArr.length === pyArr.length) {
      const hv = getHanviet(tradArr, pyArr);
      return hv?.trim() || undefined;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

// ============================================================================
// CONTEXT PRONOUN & STYLE ADAPTATION HELPERS
// ============================================================================

function primaryGloss(viGloss: string): string {
  return viGloss.split('/')[0].trim();
}

function inferOmittedSubject(
  contextTurns: TranslationRequestPayload['contextTurns'],
  isQuestion: boolean,
  styleMode: TranslationStyleMode
): string {
  if (isQuestion) {
    return styleMode === 'conversational' ? 'Bạn' : 'Mọi người';
  }
  if (contextTurns && contextTurns.length > 0) {
    const prev = contextTurns[contextTurns.length - 1].translatedText.toLowerCase();
    if (prev.includes('anh ấy')) return 'Anh ấy';
    if (prev.includes('cô ấy')) return 'Cô ấy';
    if (prev.includes('tuyển thủ') || prev.includes('faker')) return 'Tuyển thủ ấy';
  }
  return styleMode === 'literal' ? 'Tôi' : 'Mình';
}

function applyStylePolish(
  rawVi: string,
  styleMode: TranslationStyleMode,
  naturalness: NaturalnessLevel,
  politeness: 'formal' | 'polite' | 'casual',
  isQuestion: boolean,
  isExclamation: boolean
): string {
  let text = rawVi.replace(/\s+/g, ' ').trim();
  if (!text) return '';

  // Capitalize first letter cleanly
  text = text.charAt(0).toUpperCase() + text.slice(1);

  if (styleMode === 'literal' || naturalness === 'accurate') {
    // Strip colloquial trailing particles if added
    text = text.replace(/\s+(nhé|nha|luôn|đấy ạ|quá trời)$/i, '');
  } else if (styleMode === 'conversational') {
    if (politeness === 'formal' && !/(ạ|nhé)[.?!…]*$/i.test(text) && !isExclamation) {
      text = text.replace(/([.?!…]*)$/, ' ạ$1');
    }
  } else if (styleMode === 'entertainment' && naturalness === 'natural') {
    text = text
      .replace(/\brất thú vị\b/gi, 'cực kỳ cuốn')
      .replace(/\btuyệt vời\b/gi, 'đỉnh thật sự');
  }

  if (!/[.?!…~]$/.test(text)) {
    text += isQuestion ? '?' : isExclamation ? '!' : '.';
  }

  return text;
}

// ============================================================================
// KOREAN MORPHOLOGICAL & SYNTACTIC ENGINE
// ============================================================================

interface KoreanEndingRule {
  suffix: string;
  tense?: 'past' | 'future' | 'progressive';
  modalVi?: string;
  suffixVi?: string;
  politeness: 'formal' | 'polite' | 'casual';
  isQuestion?: boolean;
  isExclamation?: boolean;
  reconstructBase?: (stem: string) => string[];
}

const KO_VERB_ENDINGS: KoreanEndingRule[] = [
  { suffix: '고 싶어요', modalVi: 'muốn', politeness: 'polite' },
  { suffix: '고 싶습니다', modalVi: 'muốn', politeness: 'formal' },
  { suffix: '고 싶어', modalVi: 'muốn', politeness: 'casual' },
  { suffix: '고 있어요', tense: 'progressive', modalVi: 'đang', politeness: 'polite' },
  { suffix: '고 있습니다', tense: 'progressive', modalVi: 'đang', politeness: 'formal' },
  { suffix: '지 마세요', modalVi: 'xin đừng', politeness: 'polite' },
  { suffix: '지 마', modalVi: 'đừng', politeness: 'casual' },
  { suffix: '아 주세요', suffixVi: 'giúp mình nhé', politeness: 'polite' },
  { suffix: '어 주세요', suffixVi: 'giúp mình nhé', politeness: 'polite' },
  { suffix: '해 주세요', politeness: 'polite', suffixVi: 'giúp mình nhé', reconstructBase: (s) => [s + '하다', s] },
  { suffix: '할게요', modalVi: 'sẽ', suffixVi: 'nhé', politeness: 'polite', reconstructBase: (s) => [s + '하다', s] },
  { suffix: '할까요', modalVi: 'cùng', suffixVi: 'nhỉ', politeness: 'polite', isQuestion: true, reconstructBase: (s) => [s + '하다', s] },
  { suffix: '했어요', tense: 'past', modalVi: 'đã', politeness: 'polite', reconstructBase: (s) => [s + '하다', s] },
  { suffix: '했습니다', tense: 'past', modalVi: 'đã', politeness: 'formal', reconstructBase: (s) => [s + '하다', s] },
  { suffix: '해요', politeness: 'polite', reconstructBase: (s) => [s + '하다', s] },
  { suffix: '합니다', politeness: 'formal', reconstructBase: (s) => [s + '하다', s] },
  { suffix: '합니까', politeness: 'formal', isQuestion: true, reconstructBase: (s) => [s + '하다', s] },
  { suffix: '하네요', politeness: 'polite', isExclamation: true, suffixVi: 'thật đấy', reconstructBase: (s) => [s + '하다', s] },
  { suffix: '았어요', tense: 'past', modalVi: 'đã', politeness: 'polite' },
  { suffix: '었어요', tense: 'past', modalVi: 'đã', politeness: 'polite' },
  { suffix: '았습니다', tense: 'past', modalVi: 'đã', politeness: 'formal' },
  { suffix: '었습니다', tense: 'past', modalVi: 'đã', politeness: 'formal' },
  { suffix: '습니다', politeness: 'formal' },
  { suffix: '습니까', politeness: 'formal', isQuestion: true },
  { suffix: '네요', politeness: 'polite', isExclamation: true, suffixVi: 'thật đấy' },
  { suffix: '잖아요', politeness: 'polite', suffixVi: 'mà nhỉ' },
  { suffix: '거든요', politeness: 'polite', suffixVi: 'đấy nhé' },
  { suffix: '나요', politeness: 'polite', isQuestion: true },
  { suffix: '가요', politeness: 'polite', isQuestion: true },
  { suffix: '아요', politeness: 'polite' },
  { suffix: '어요', politeness: 'polite' },
  { suffix: '여요', politeness: 'polite' },
  { suffix: '이에요', modalVi: 'là', politeness: 'polite' },
  { suffix: '예요', modalVi: 'là', politeness: 'polite' },
  { suffix: '입니다', modalVi: 'là', politeness: 'formal' },
  { suffix: '입니까', modalVi: 'là', politeness: 'formal', isQuestion: true },
  { suffix: '요', politeness: 'polite' },
];

const KO_PARTICLES: Array<{ p: string; role: 'subj' | 'obj' | 'adv' | 'poss'; viPrep?: string }> = [
  { p: '에서는', role: 'adv', viPrep: 'tại' },
  { p: '에서', role: 'adv', viPrep: 'ở' },
  { p: '에게', role: 'adv', viPrep: 'cho' },
  { p: '한테', role: 'adv', viPrep: 'với' },
  { p: '으로', role: 'adv', viPrep: 'bằng / tới' },
  { p: '부터', role: 'adv', viPrep: 'từ' },
  { p: '까지', role: 'adv', viPrep: 'đến' },
  { p: '처럼', role: 'adv', viPrep: 'giống như' },
  { p: '하고', role: 'adv', viPrep: 'cùng với' },
  { p: '은', role: 'subj' },
  { p: '는', role: 'subj' },
  { p: '이', role: 'subj' },
  { p: '가', role: 'subj' },
  { p: '을', role: 'obj' },
  { p: '를', role: 'obj' },
  { p: '도', role: 'adv', viPrep: 'cũng' },
  { p: '만', role: 'adv', viPrep: 'chỉ' },
  { p: '에', role: 'adv', viPrep: 'vào / ở' },
  { p: '로', role: 'adv', viPrep: 'bằng' },
  { p: '의', role: 'poss', viPrep: 'của' },
];

// Irregular / contracted Korean stem lookup
const KO_CONTRACTED_STEMS: Record<string, string> = {
  '들리': '들리다',
  '들려': '들리다',
  '보여': '보다',
  '봐': '보다',
  '왔': '오다',
  '와': '오다',
  '갔': '가다',
  '가': '가다',
  '먹': '먹다',
  '마셔': '마시다',
  '좋': '좋다',
  '좋아': '좋다',
  '재미있': '재미있다',
  '재밌': '재미있다',
  '맛있': '맛있다',
  '예뻐': '예쁘다',
  '멋있': '멋있다',
  '기뻐': '기쁘다',
  '어려워': '어렵다',
  '쉬워': '쉽다',
  '바빠': '바쁘다',
  '고마워': '고맙다',
  '미안해': '미안하다',
  '사랑해': '사랑하다',
  '좋아해': '좋아하다',
  '생각해': '생각하다',
  '기다려': '기다리다',
  '만나': '만나다',
  '있': '있다',
  '없': '없다',
  '맞': '맞다',
  '괜찮': '괜찮다',
  '알': '알다',
  '몰라': '모르다',
};

function translateKoreanSentence(
  sourceText: string,
  req: TranslationRequestPayload,
  glossaryMap: Map<string, { vi: string; isGlossary: boolean; isProper: boolean }>
): {
  translatedText: string;
  tokens: MorphologicalToken[];
  confidence: number;
  explanationVi?: string;
} {
  let working = sourceText.trim();
  const isQuestion = working.includes('?') || /(나요|가요|까요|니까|어요\?)$/.test(working);
  const isExclamation = working.includes('!') || /(네요|대박|화이팅|파이팅)/.test(working);
  const tokens: MorphologicalToken[] = [];
  const notes: string[] = [];

  // Check exact or leading phrase matches first while still tokenizing words for lookup
  const normalizedNoPunct = working.replace(/[.?!~…]+$/g, '').trim();
  for (const ph of KO_PHRASES) {
    if (normalizedNoPunct === ph.ko) {
      const chosen =
        req.styleMode === 'literal' && ph.literalVi
          ? ph.literalVi
          : req.styleMode === 'entertainment' && ph.entertainmentVi
          ? ph.entertainmentVi
          : ph.vi;
      const wordChunks = working.split(/\s+/).filter(Boolean);
      for (const w of wordChunks) {
        const cleanW = w.replace(/[.,?!~…]/g, '');
        const lex = KO_LEXICON[cleanW];
        tokens.push({
          surface: w,
          reading: romanizeHangul(cleanW),
          meaningVi: lex?.vi ?? chosen,
          pos: lex?.pos ?? 'Cụm giao tiếp',
          grammarNote: ph.note,
        });
      }
      return {
        translatedText: applyStylePolish(
          chosen,
          req.styleMode,
          req.naturalnessLevel,
          'polite',
          isQuestion,
          isExclamation
        ),
        tokens,
        confidence: 0.96,
        explanationVi: ph.note,
      };
    }
  }

  // Replace multi-word phrases inside longer sentences with placeholders so clause grammar stays clean
  const phraseHolders = new Map<string, string>();
  let phIdx = 0;
  const sortedPhrases = [...KO_PHRASES].sort((a, b) => b.ko.length - a.ko.length);
  for (const ph of sortedPhrases) {
    if (ph.ko.includes(' ') && working.includes(ph.ko)) {
      const key = `__KOPH${phIdx++}__`;
      const chosen =
        req.styleMode === 'entertainment' && ph.entertainmentVi ? ph.entertainmentVi : ph.vi;
      phraseHolders.set(key, chosen);
      working = working.replace(ph.ko, key);
      if (ph.note) notes.push(ph.note);
    }
  }

  const rawWords = working.split(/\s+/).filter(Boolean);
  const subjectParts: string[] = [];
  const timeAdverbParts: string[] = [];
  const objectParts: string[] = [];
  const predicateParts: string[] = [];
  let pendingNounMod: string | null = null;
  let detectedPoliteness: 'formal' | 'polite' | 'casual' = 'polite';
  let matchedCount = 0;
  let totalContentWords = 0;

  const attachPendingMod = (headVi: string): string => {
    if (pendingNounMod) {
      const mod = pendingNounMod;
      pendingNounMod = null;
      return `${headVi} ${mod}`;
    }
    return headVi;
  };

  for (let idx = 0; idx < rawWords.length; idx++) {
    const rawWord = rawWords[idx];
    const punctMatch = rawWord.match(/([.,?!~…]+)$/);
    const cleanWord = rawWord.replace(/^[.,?!~…"']+|[.,?!~…"']+$/g, '');
    if (!cleanWord) continue;

    if (phraseHolders.has(cleanWord)) {
      const val = phraseHolders.get(cleanWord)!;
      predicateParts.push(val);
      tokens.push({
        surface: val,
        meaningVi: val,
        pos: 'Cụm từ',
      });
      matchedCount++;
      totalContentWords++;
      continue;
    }

    totalContentWords++;

    // 1. Glossary or Proper Noun exact/prefix match
    let glossaryHit: { term: string; vi: string; isGlossary: boolean; isProper: boolean } | null = null;
    for (const [term, meta] of glossaryMap.entries()) {
      if (cleanWord === term || cleanWord.startsWith(term)) {
        glossaryHit = { term, ...meta };
        break;
      }
    }

    if (glossaryHit) {
      const remainder = cleanWord.slice(glossaryHit.term.length);
      if (!remainder && idx + 1 < rawWords.length) {
        // Unmarked proper noun modifying next title/noun (e.g. 페이커 선수가 -> tuyển thủ Faker)
        pendingNounMod = glossaryHit.vi;
      } else {
        let role: 'subj' | 'obj' | 'adv' = 'subj';
        for (const part of KO_PARTICLES) {
          if (remainder === part.p) {
            role = part.role === 'poss' ? 'subj' : part.role;
            break;
          }
        }
        const combined = attachPendingMod(glossaryHit.vi);
        if (role === 'obj') objectParts.push(combined);
        else subjectParts.push(combined);
      }

      tokens.push({
        surface: rawWord,
        baseForm: glossaryHit.term,
        reading: romanizeHangul(cleanWord),
        meaningVi: glossaryHit.vi,
        pos: glossaryHit.isGlossary ? 'Từ điển cá nhân' : 'Tên riêng',
        isGlossaryMatch: glossaryHit.isGlossary,
        isProperNoun: glossaryHit.isProper,
      });
      matchedCount++;
      continue;
    }

    // 2. Check Korean verb/adjective endings (typically at clause end or predicate)
    let matchedEnding: KoreanEndingRule | null = null;
    let verbStem = '';
    for (const rule of KO_VERB_ENDINGS) {
      if (cleanWord.length > rule.suffix.length && cleanWord.endsWith(rule.suffix)) {
        matchedEnding = rule;
        verbStem = cleanWord.slice(0, cleanWord.length - rule.suffix.length);
        break;
      }
    }

    if (matchedEnding) {
      detectedPoliteness = matchedEnding.politeness;
      const candidates = matchedEnding.reconstructBase
        ? matchedEnding.reconstructBase(verbStem)
        : [
            KO_CONTRACTED_STEMS[verbStem] ?? '',
            verbStem + '다',
            verbStem + '하다',
            verbStem,
          ].filter(Boolean);

      let stemMeaning = '';
      let baseFound = candidates[0] ?? verbStem;
      for (const c of candidates) {
        if (KO_LEXICON[c]) {
          stemMeaning = primaryGloss(KO_LEXICON[c].vi);
          baseFound = c;
          break;
        }
      }

      if (stemMeaning || matchedEnding.modalVi === 'là') {
        if (pendingNounMod) {
          objectParts.push(pendingNounMod);
          pendingNounMod = null;
        }
        matchedCount++;
        const nounCopula = !stemMeaning && matchedEnding.modalVi === 'là'
          ? primaryGloss(KO_LEXICON[verbStem]?.vi ?? romanizeHangul(verbStem))
          : stemMeaning;

        const pieces = [
          matchedEnding.modalVi,
          nounCopula.toLowerCase(),
          matchedEnding.suffixVi,
        ].filter(Boolean);

        predicateParts.push(pieces.join(' '));
        tokens.push({
          surface: rawWord,
          baseForm: baseFound,
          reading: romanizeHangul(cleanWord),
          meaningVi: pieces.join(' '),
          pos: `Vị ngữ (${matchedEnding.politeness === 'formal' ? 'Trang trọng' : 'Lịch sự'})`,
          grammarNote:
            matchedEnding.politeness === 'formal'
              ? 'Đuôi kính ngữ trang trọng (-습니다)'
              : 'Đuôi lịch sự thân thiện (-아/어요)',
        });
        if (punctMatch && punctMatch[1].includes(',')) {
          predicateParts.push(',');
        }
        continue;
      }
    }

    // 3. Direct lexicon match
    if (KO_LEXICON[cleanWord]) {
      const entry = KO_LEXICON[cleanWord];
      const cleanVi = primaryGloss(entry.vi);
      matchedCount++;
      if (entry.pos.includes('Phó từ') || entry.pos.includes('thời gian')) {
        if (pendingNounMod) {
          objectParts.push(pendingNounMod);
          pendingNounMod = null;
        }
        timeAdverbParts.push(cleanVi);
      } else if (entry.pos.includes('Đại từ')) {
        subjectParts.push(attachPendingMod(cleanVi));
      } else if (idx + 1 < rawWords.length) {
        // Unmarked noun before another noun (e.g. 한국어 공부가 -> việc học tiếng Hàn)
        pendingNounMod = pendingNounMod ? `${cleanVi} ${pendingNounMod}` : cleanVi;
      } else {
        objectParts.push(attachPendingMod(cleanVi));
      }
      tokens.push({
        surface: rawWord,
        baseForm: cleanWord,
        reading: romanizeHangul(cleanWord),
        meaningVi: entry.vi,
        pos: entry.pos,
        grammarNote: entry.note,
      });
      if (entry.note) notes.push(entry.note);
      continue;
    }

    // 4. Strip Korean case/topic particles
    let particleHandled = false;
    for (const part of KO_PARTICLES) {
      if (cleanWord.length > part.p.length && cleanWord.endsWith(part.p)) {
        const nounStem = cleanWord.slice(0, cleanWord.length - part.p.length);
        const gloss = glossaryMap.get(nounStem);
        const lex = KO_LEXICON[nounStem];
        if (gloss || lex) {
          matchedCount++;
          const viWord = attachPendingMod(gloss ? gloss.vi : primaryGloss(lex!.vi));
          if (part.role === 'subj') {
            subjectParts.push(part.viPrep ? `${part.viPrep} ${viWord}` : viWord);
          } else if (part.role === 'obj') {
            objectParts.push(viWord);
          } else if (part.role === 'poss') {
            pendingNounMod = viWord;
          } else {
            const prep = part.viPrep ? primaryGloss(part.viPrep) : '';
            timeAdverbParts.push(prep ? `${prep} ${viWord}` : viWord);
          }
          tokens.push({
            surface: rawWord,
            baseForm: nounStem,
            reading: romanizeHangul(cleanWord),
            meaningVi: gloss ? gloss.vi : lex!.vi,
            pos: `${lex?.pos ?? 'Danh từ'} + trợ từ (${part.p})`,
            grammarNote: lex?.note,
          });
          if (lex?.note) notes.push(lex.note);
          particleHandled = true;
          break;
        }
      }
    }
    if (particleHandled) continue;

    // 5. Check short phrase match on single word (e.g. 대박, 화이팅, 꿀잼)
    const singlePhrase = KO_PHRASES.find((p) => p.ko === cleanWord);
    if (singlePhrase) {
      matchedCount++;
      const viVal =
        req.styleMode === 'entertainment' && singlePhrase.entertainmentVi
          ? singlePhrase.entertainmentVi
          : singlePhrase.vi;
      predicateParts.push(viVal);
      tokens.push({
        surface: rawWord,
        reading: romanizeHangul(cleanWord),
        meaningVi: viVal,
        pos: 'Biểu cảm / Khẩu ngữ',
        grammarNote: singlePhrase.note,
      });
      if (singlePhrase.note) notes.push(singlePhrase.note);
      continue;
    }

    // 6. Fallback: preserve Latin/numbers or transliterate Korean proper/unknown token honestly
    const isAscii = /^[\x00-\x7F]+$/.test(cleanWord);
    const romaja = isAscii ? cleanWord : romanizeHangul(cleanWord);
    const capitalizedRomaja = romaja.charAt(0).toUpperCase() + romaja.slice(1);
    objectParts.push(isAscii ? cleanWord : capitalizedRomaja);
    tokens.push({
      surface: rawWord,
      reading: romaja,
      meaningVi: isAscii ? cleanWord : `[${capitalizedRomaja}]`,
      pos: isAscii ? 'Từ mượn / Ký hiệu' : 'Từ chưa xác định / Tên riêng',
    });
  }

  // SOV -> SVO assembly for Vietnamese!
  // Time/Topic + Subject + Adverb + Predicate (Verb/Adj) + Object
  if (subjectParts.length === 0 && predicateParts.length > 0 && rawWords.length >= 2) {
    // Korean frequently omits subjects; supply natural contextual pronoun when needed
    const needsSubject =
      !predicateParts.join(' ').toLowerCase().startsWith('chào') &&
      !predicateParts.join(' ').toLowerCase().startsWith('cảm ơn') &&
      !predicateParts.join(' ').toLowerCase().startsWith('xin');
    if (needsSubject && req.styleMode !== 'literal') {
      subjectParts.push(inferOmittedSubject(req.contextTurns, isQuestion, req.styleMode));
      notes.push('Câu tiếng Hàn lược chủ ngữ — đã suy luận đại từ theo ngữ cảnh hội thoại.');
    }
  }

  const orderedVi = [
    ...subjectParts,
    ...timeAdverbParts,
    ...predicateParts,
    ...objectParts,
  ]
    .join(' ')
    .replace(/\s+,/g, ',');

  const ratio = totalContentWords > 0 ? matchedCount / totalContentWords : 0.6;
  const confidence = Math.max(0.45, Math.min(0.95, 0.52 + ratio * 0.43));

  return {
    translatedText: applyStylePolish(
      orderedVi,
      req.styleMode,
      req.naturalnessLevel,
      detectedPoliteness,
      isQuestion,
      isExclamation
    ),
    tokens,
    confidence,
    explanationVi: notes.length > 0 ? notes[0] : undefined,
  };
}

// ============================================================================
// JAPANESE MORPHOLOGICAL (KUROMOJI) & SOV -> SVO ENGINE
// ============================================================================

async function translateJapaneseSentence(
  sourceText: string,
  req: TranslationRequestPayload,
  glossaryMap: Map<string, { vi: string; isGlossary: boolean; isProper: boolean }>
): Promise<{
  translatedText: string;
  tokens: MorphologicalToken[];
  confidence: number;
  explanationVi?: string;
}> {
  const working = sourceText.trim();
  const isQuestion = working.includes('？') || working.includes('?') || /ですか[。？?]*$|ますか[。？?]*$/.test(working);
  const isExclamation = working.includes('！') || working.includes('!');
  const cleanNoPunct = working.replace(/[。？！?!…]+$/g, '').trim();

  const tokenizer = await getKuromojiTokenizer();
  const unmergedKuro = tokenizer.tokenize(working);

  // Merge adjacent Katakana compounds (e.g. アップ + ロード -> アップロード) and Verb + やすい/にくい (わかり + やすい -> わかりやすい)
  const rawKuro: KuromojiToken[] = [];
  for (let i = 0; i < unmergedKuro.length; i++) {
    const cur = unmergedKuro[i];
    const nxt = unmergedKuro[i + 1];
    if (
      nxt &&
      ((/^[\u30A0-\u30FFー]+$/.test(cur.surface_form) &&
        /^[\u30A0-\u30FFー]+$/.test(nxt.surface_form)) ||
        JA_LEXICON[cur.surface_form + nxt.basic_form])
    ) {
      const mergedSurf = cur.surface_form + nxt.surface_form;
      const mergedBase = cur.surface_form + (nxt.basic_form !== '*' ? nxt.basic_form : nxt.surface_form);
      rawKuro.push({
        surface_form: mergedSurf,
        basic_form: JA_LEXICON[mergedBase] ? mergedBase : mergedSurf,
        pos: JA_LEXICON[mergedBase]?.pos.includes('Tính từ') ? '形容詞' : cur.pos,
        pos_detail_1: cur.pos_detail_1,
        reading: (cur.reading ?? cur.surface_form) + (nxt.reading ?? nxt.surface_form),
      });
      i++;
    } else {
      rawKuro.push(cur);
    }
  }

  const tokens: MorphologicalToken[] = [];
  const notes: string[] = [];

  // Check whole-utterance idiomatic Japanese greeting/expression first
  for (const ph of JA_PHRASES) {
    if (cleanNoPunct === ph.ja) {
      for (const kt of rawKuro) {
        if (kt.pos === '記号') continue;
        const hira = kt.reading ? katakanaToHiragana(kt.reading) : kt.surface_form;
        const lex = JA_LEXICON[kt.basic_form] ?? JA_LEXICON[kt.surface_form];
        tokens.push({
          surface: kt.surface_form,
          baseForm: kt.basic_form,
          reading: `${hira} (${hiraganaToRomaji(hira)})`,
          hanViet: computeHanVietSafe(kt.surface_form),
          meaningVi: lex?.vi ?? ph.vi,
          pos: lex?.pos ?? kt.pos,
          grammarNote: ph.note,
        });
      }
      const chosen =
        req.styleMode === 'literal' && ph.literalVi
          ? ph.literalVi
          : req.styleMode === 'entertainment' && ph.entertainmentVi
          ? ph.entertainmentVi
          : ph.vi;
      return {
        translatedText: applyStylePolish(
          chosen,
          req.styleMode,
          req.naturalnessLevel,
          'polite',
          isQuestion,
          isExclamation
        ),
        tokens,
        confidence: 0.96,
        explanationVi: ph.note,
      };
    }
  }

  // Clause-level SOV -> SVO transfer over Kuromoji morphemes
  const clauseTranslations: string[] = [];
  let topicParts: string[] = [];
  let advParts: string[] = [];
  let objParts: string[] = [];
  let predParts: string[] = [];
  let currentNounBuffer: string[] = [];
  let politeness: 'formal' | 'polite' | 'casual' = 'casual';
  let matched = 0;
  let contentCount = 0;

  const flushClause = (conjunctionVi?: string) => {
    const pieces = [...topicParts, ...advParts, ...predParts, ...objParts].filter(Boolean);
    if (pieces.length > 0 || currentNounBuffer.length > 0) {
      const merged = [...pieces, ...currentNounBuffer].join(' ');
      clauseTranslations.push(conjunctionVi ? `${merged}, ${conjunctionVi}` : merged);
    }
    topicParts = [];
    advParts = [];
    objParts = [];
    predParts = [];
    currentNounBuffer = [];
  };

  for (let i = 0; i < rawKuro.length; i++) {
    const kt = rawKuro[i];
    const surf = kt.surface_form;
    const base = kt.basic_form && kt.basic_form !== '*' ? kt.basic_form : surf;

    if (kt.pos === '記号') {
      if (surf === '、' || surf === '。') {
        flushClause();
      }
      continue;
    }

    const hira = kt.reading ? katakanaToHiragana(kt.reading) : surf;
    const romaji = hiraganaToRomaji(hira);
    const hv = computeHanVietSafe(surf);

    // Check Japanese honorific suffixes (-さん, -ちゃん, -くん, -様, -先輩)
    if ((surf === 'さん' || surf === 'ちゃん' || surf === 'くん' || surf === '様') && currentNounBuffer.length > 0) {
      const prevName = currentNounBuffer.pop()!;
      const honorificVi =
        req.properNounMode === 'keep-original'
          ? `${prevName}-${romaji}`
          : surf === '様'
          ? `ngài/quý khách ${prevName}`
          : `bạn ${prevName}`;
      currentNounBuffer.push(honorificVi);
      tokens.push({
        surface: surf,
        reading: `${hira} (${romaji})`,
        meaningVi: `Hậu tố kính ngữ (${romaji})`,
        pos: 'Hậu tố xưng hô',
        grammarNote: 'Giữ sắc thái xưng hô lịch sự tiếng Nhật',
      });
      notes.push(`Xử lý hậu tố kính ngữ tiếng Nhật (-${surf}) theo ngữ cảnh.`);
      continue;
    }

    // Particles (助詞) determine syntactic slot of the buffered noun phrase!
    if (kt.pos === '助詞') {
      if (surf === 'は' || surf === 'が' || surf === 'も') {
        if (currentNounBuffer.length > 0) {
          const phrase = currentNounBuffer.join(' ');
          topicParts.push(surf === 'も' ? `${phrase} cũng` : phrase);
          currentNounBuffer = [];
        }
      } else if (surf === 'を') {
        if (currentNounBuffer.length > 0) {
          objParts.push(currentNounBuffer.join(' '));
          currentNounBuffer = [];
        }
      } else if (surf === 'の') {
        // Japanese A の B -> Vietnamese B của A (or B A)!
        // Mark buffer with possessive inversion marker
        if (currentNounBuffer.length > 0) {
          const modifier = currentNounBuffer.pop()!;
          currentNounBuffer.push(`__JA_MOD__:${modifier}`);
        }
      } else if (surf === 'に' || surf === 'へ' || surf === 'で') {
        if (currentNounBuffer.length > 0) {
          const prep = surf === 'で' ? 'tại' : 'vào / tới';
          advParts.push(`${prep} ${currentNounBuffer.join(' ')}`);
          currentNounBuffer = [];
        }
      } else if (surf === 'から' || surf === 'ので') {
        flushClause('vì vậy');
      } else if (surf === 'けど' || surf === 'けれど') {
        flushClause('nhưng');
      } else if (surf === 'ね') {
        predParts.push('nhỉ');
      } else if (surf === 'よ') {
        predParts.push('đấy');
      }
      tokens.push({
        surface: surf,
        reading: `${hira} (${romaji})`,
        meaningVi:
          surf === 'は'
            ? 'trợ từ chủ đề'
            : surf === 'を'
            ? 'trợ từ tân ngữ'
            : surf === 'の'
            ? 'của (sở hữu/bổ nghĩa)'
            : surf === 'か'
            ? 'trợ từ nghi vấn'
            : `trợ từ (${surf})`,
        pos: 'Trợ từ',
      });
      continue;
    }

    // Auxiliary verbs (助動詞: です, ます, た, ない, たい)
    if (kt.pos === '助動詞') {
      if (surf === 'です' || surf === 'ます' || base === 'ます' || base === 'です') {
        politeness = 'polite';
        if (surf === 'でした' || surf === 'ました') {
          predParts.unshift('đã');
        } else if (surf === 'ません') {
          predParts.unshift('không');
        } else if (surf === 'ましょう') {
          predParts.unshift('hãy cùng');
        }
      } else if (base === 'ない' || surf === 'ん') {
        predParts.unshift('không');
      } else if (base === 'た' || surf === 'た' || surf === 'だ') {
        if (!predParts.includes('đã')) predParts.unshift('đã');
      } else if (base === 'たい') {
        predParts.unshift('muốn');
      }
      tokens.push({
        surface: surf,
        baseForm: base,
        reading: `${hira} (${romaji})`,
        meaningVi:
          base === 'ます' || base === 'です'
            ? 'thể lịch sự (Teineigo)'
            : base === 'たい'
            ? 'muốn'
            : base === 'た'
            ? 'đã (quá khứ)'
            : 'trợ động từ',
        pos: 'Trợ động từ',
      });
      continue;
    }

    contentCount++;

    // Helper to attach noun resolving any pending `A の B` -> `B A` inversion!
    const pushNounPhrase = (viNoun: string) => {
      const prev = currentNounBuffer[currentNounBuffer.length - 1];
      if (prev && prev.startsWith('__JA_MOD__:')) {
        currentNounBuffer.pop();
        const mod = prev.replace('__JA_MOD__:', '');
        currentNounBuffer.push(`${viNoun} ${mod}`);
      } else {
        currentNounBuffer.push(viNoun);
      }
    };

    // 1. Glossary / Protected proper noun check
    const gloss = glossaryMap.get(surf) ?? glossaryMap.get(base);
    if (gloss) {
      matched++;
      pushNounPhrase(gloss.vi);
      tokens.push({
        surface: surf,
        baseForm: base,
        reading: `${hira} (${romaji})`,
        hanViet: hv,
        meaningVi: gloss.vi,
        pos: gloss.isGlossary ? 'Từ điển cá nhân' : 'Tên riêng',
        isGlossaryMatch: gloss.isGlossary,
        isProperNoun: gloss.isProper,
      });
      continue;
    }

    // 2. Suru-verb check: Noun + する (e.g., 勉強 + し + ます, アップロード + し + ました)
    const nextToken = rawKuro[i + 1];
    const lex = JA_LEXICON[base] ?? JA_LEXICON[surf];

    if (surf === 'ください' || base === 'くださる') {
      matched++;
      predParts.unshift('xin hãy');
      tokens.push({
        surface: surf,
        baseForm: base,
        reading: `${hira} (${romaji})`,
        meaningVi: 'xin hãy / vui lòng',
        pos: 'Kính ngữ yêu cầu',
      });
      continue;
    }

    if (kt.pos === '動詞' && (base === 'する' || base === 'いる')) {
      if (base === 'いる' && i > 0 && rawKuro[i - 1]?.surface_form === 'て') {
        predParts.unshift('đang');
      } else if (base === 'する' && currentNounBuffer.length > 0) {
        // Turn buffered verbal noun (e.g. アップロード, 配信, 勉強) into the clause predicate!
        const verbalNoun = currentNounBuffer.pop()!;
        predParts.push(verbalNoun);
      }
      matched++;
      tokens.push({
        surface: surf,
        baseForm: base,
        reading: `${hira} (${romaji})`,
        meaningVi: base === 'いる' ? 'đang (tiếp diễn)' : 'thực hiện',
        pos: 'Động từ bổ trợ',
      });
      continue;
    }

    if (lex) {
      matched++;
      const cleanVi = primaryGloss(lex.vi);
      // Prenominal adjective directly before a Noun (e.g. 新しい + 動画 -> video mới)
      if (kt.pos === '形容詞' && nextToken && nextToken.pos === '名詞') {
        currentNounBuffer.push(`__JA_MOD__:${cleanVi}`);
      } else if (kt.pos === '動詞' || kt.pos === '形容詞' || nextToken?.basic_form === 'する') {
        predParts.push(cleanVi);
      } else if (kt.pos === '副詞' || lex.pos.includes('thời gian') || lex.pos.includes('Phó từ')) {
        advParts.push(cleanVi);
      } else {
        pushNounPhrase(cleanVi);
      }
      tokens.push({
        surface: surf,
        baseForm: base,
        reading: `${hira} (${romaji})`,
        hanViet: hv,
        meaningVi: lex.vi,
        pos: lex.pos,
        grammarNote: lex.note,
      });
      if (lex.note) notes.push(lex.note);
      continue;
    }

    // 3. Katakana loanword or proper name or Kanji Sino-Vietnamese fallback
    if (kt.pos_detail_1 === '固有名詞') {
      matched++;
      const nameVi = romaji.charAt(0).toUpperCase() + romaji.slice(1);
      pushNounPhrase(nameVi);
      tokens.push({
        surface: surf,
        baseForm: base,
        reading: `${hira} (${romaji})`,
        hanViet: hv,
        meaningVi: nameVi,
        pos: 'Tên riêng',
        isProperNoun: true,
      });
    } else if (hv) {
      // Kanji compound fallback to Sino-Vietnamese reading with lower confidence
      pushNounPhrase(hv);
      tokens.push({
        surface: surf,
        baseForm: base,
        reading: `${hira} (${romaji})`,
        hanViet: hv,
        meaningVi: `${hv} (âm Hán-Việt)`,
        pos: kt.pos,
      });
    } else {
      pushNounPhrase(romaji || surf);
      tokens.push({
        surface: surf,
        baseForm: base,
        reading: `${hira} (${romaji})`,
        meaningVi: romaji || surf,
        pos: kt.pos,
      });
    }
  }

  flushClause();

  // Clean any dangling modifier marker
  const rawCombined = clauseTranslations
    .join(' ')
    .replace(/__JA_MOD__:(\S+)/g, 'của $1');

  const ratio = contentCount > 0 ? matched / contentCount : 0.65;
  const confidence = Math.max(0.48, Math.min(0.95, 0.54 + ratio * 0.41));

  return {
    translatedText: applyStylePolish(
      rawCombined,
      req.styleMode,
      req.naturalnessLevel,
      politeness,
      isQuestion,
      isExclamation
    ),
    tokens,
    confidence,
    explanationVi: notes[0],
  };
}

// ============================================================================
// CHINESE (SIMPLIFIED & TRADITIONAL) SEGMENTATION + MODIFIER-REVERSAL ENGINE
// ============================================================================

function translateChineseSentence(
  sourceText: string,
  detectedLang: 'zh-CN' | 'zh-TW',
  req: TranslationRequestPayload,
  glossaryMap: Map<string, { vi: string; isGlossary: boolean; isProper: boolean }>
): {
  translatedText: string;
  tokens: MorphologicalToken[];
  confidence: number;
  explanationVi?: string;
} {
  const working = sourceText.trim();
  const simpWorking = toSimp(working);
  const isQuestion = working.includes('？') || working.includes('?') || /[吗嗎呢][。？?]*$/.test(working);
  const isExclamation = working.includes('！') || working.includes('!') || /太.+了/.test(simpWorking);
  const cleanSimpNoPunct = simpWorking.replace(/[。？！?!…]+$/g, '').trim();

  const tokens: MorphologicalToken[] = [];
  const notes: string[] = [];
  if (detectedLang === 'zh-TW') {
    notes.push('Đã nhận diện chữ Trung Phồn thể (繁體) và đối chiếu từ vựng khu vực.');
  }

  // Whole-phrase check
  for (const ph of ZH_PHRASES) {
    if (cleanSimpNoPunct === ph.zhSimp) {
      const segs = zhSegmenter.doSegment(working, { simple: true }) as string[];
      for (const seg of segs) {
        if (/^[，。？！、,.?!\s]+$/.test(seg)) continue;
        const segSimp = toSimp(seg);
        const py = pinyin(segSimp);
        const hv = computeHanVietSafe(seg);
        const lex = ZH_LEXICON[segSimp];
        tokens.push({
          surface: seg,
          reading: py,
          hanViet: hv,
          meaningVi: lex?.vi ?? ph.vi,
          pos: lex?.pos ?? 'Cụm giao tiếp',
          grammarNote: ph.note ?? lex?.regionalNote,
        });
      }
      const chosen =
        req.styleMode === 'literal' && ph.literalVi
          ? ph.literalVi
          : req.styleMode === 'entertainment' && ph.entertainmentVi
          ? ph.entertainmentVi
          : ph.vi;
      return {
        translatedText: applyStylePolish(
          chosen,
          req.styleMode,
          req.naturalnessLevel,
          'polite',
          isQuestion,
          isExclamation
        ),
        tokens,
        confidence: 0.96,
        explanationVi: ph.note ?? notes[0],
      };
    }
  }

  // Segment Simplified projection so Traditional Chinese segments with identical accuracy, then map slices back to original script!
  const origChars = Array.from(working);
  const simpSegments = zhSegmenter.doSegment(simpWorking, { simple: true }) as string[];
  const rawSegments: string[] = [];
  let charCursor = 0;
  for (const sSeg of simpSegments) {
    const len = Array.from(sSeg).length;
    const origSlice = origChars.slice(charCursor, charCursor + len).join('');
    rawSegments.push(origSlice || sSeg);
    charCursor += len;
  }

  // Merge glossary / multi-char lexicon spans that segmenter might split (e.g. 点赞 / 按讚 / 直播间 / 這支)
  const mergedSegments: string[] = [];
  for (let i = 0; i < rawSegments.length; i++) {
    const two = i + 1 < rawSegments.length ? rawSegments[i] + rawSegments[i + 1] : '';
    const three = i + 2 < rawSegments.length ? two + rawSegments[i + 2] : '';
    if (three && (glossaryMap.has(three) || glossaryMap.has(toSimp(three)) || ZH_LEXICON[toSimp(three)])) {
      mergedSegments.push(three);
      i += 2;
    } else if (two && (glossaryMap.has(two) || glossaryMap.has(toSimp(two)) || ZH_LEXICON[toSimp(two)])) {
      mergedSegments.push(two);
      i += 1;
    } else {
      mergedSegments.push(rawSegments[i]);
    }
  }

  // Translate segment list with Chinese `A 的 B` -> Vietnamese `B [của] A` inversion!
  interface ResolvedUnit {
    vi: string;
    isPronoun?: boolean;
    isDeParticle?: boolean;
    isPunct?: boolean;
  }

  const units: ResolvedUnit[] = [];
  let matched = 0;
  let contentCount = 0;

  for (let i = 0; i < mergedSegments.length; i++) {
    const seg = mergedSegments[i];
    if (/^\s+$/.test(seg)) continue;
    if (/^[，、,]$/.test(seg)) {
      units.push({ vi: ',', isPunct: true });
      continue;
    }
    if (/^[。？！?!…]+$/.test(seg)) {
      continue;
    }

    const segSimp = toSimp(seg);
    const py = pinyin(segSimp);
    const hv = computeHanVietSafe(seg);

    // Structural particles
    if (segSimp === '的') {
      units.push({ vi: 'của', isDeParticle: true });
      tokens.push({
        surface: seg,
        reading: py,
        hanViet: 'đích',
        meaningVi: 'của / trợ từ định ngữ',
        pos: 'Trợ từ kết cấu',
      });
      continue;
    }
    if (segSimp === '得') {
      tokens.push({
        surface: seg,
        reading: py,
        hanViet: 'đắc',
        meaningVi: 'trợ từ bổ ngữ mức độ',
        pos: 'Trợ từ kết cấu',
      });
      continue;
    }
    if (segSimp === '了') {
      // Sentence-final or aspect `了`
      const isEnd = i >= mergedSegments.length - 2;
      units.push({ vi: isEnd ? 'rồi' : 'đã' });
      tokens.push({
        surface: seg,
        reading: py,
        hanViet: 'liễu',
        meaningVi: isEnd ? 'rồi' : 'đã',
        pos: 'Trợ từ ngữ khí/thể',
      });
      continue;
    }
    if (segSimp === '吗') {
      units.push({ vi: 'không' });
      tokens.push({
        surface: seg,
        reading: py,
        hanViet: 'ma',
        meaningVi: 'không? (trợ từ nghi vấn)',
        pos: 'Trợ từ nghi vấn',
      });
      continue;
    }
    if (segSimp === '吧' || segSimp === '呢' || segSimp === '啊' || segSimp === '呀') {
      const particleVi = segSimp === '吧' ? 'nhé' : segSimp === '呢' ? 'nhỉ' : 'nha';
      units.push({ vi: particleVi });
      tokens.push({
        surface: seg,
        reading: py,
        meaningVi: particleVi,
        pos: 'Trợ từ ngữ khí',
      });
      continue;
    }

    contentCount++;

    // 1. Glossary / Proper noun
    const gloss = glossaryMap.get(seg) ?? glossaryMap.get(segSimp);
    if (gloss) {
      matched++;
      units.push({ vi: gloss.vi });
      tokens.push({
        surface: seg,
        reading: py,
        hanViet: hv,
        meaningVi: gloss.vi,
        pos: gloss.isGlossary ? 'Từ điển cá nhân' : 'Tên riêng',
        isGlossaryMatch: gloss.isGlossary,
        isProperNoun: gloss.isProper,
      });
      continue;
    }

    // 2. Lexicon match
    const lex = ZH_LEXICON[segSimp];
    if (lex) {
      matched++;
      units.push({
        vi: primaryGloss(lex.vi),
        isPronoun: lex.pos.includes('Đại từ'),
      });
      tokens.push({
        surface: seg,
        reading: py,
        hanViet: hv,
        meaningVi: lex.vi,
        pos: lex.pos,
        grammarNote: lex.regionalNote,
      });
      if (lex.regionalNote) notes.push(lex.regionalNote);
      continue;
    }

    // 3. Check 2-char breakdown or Sino-Vietnamese fallback (never fabricate random text!)
    if (hv) {
      units.push({ vi: hv });
      tokens.push({
        surface: seg,
        reading: py,
        hanViet: hv,
        meaningVi: `${hv} (Hán-Việt)`,
        pos: 'Từ Hán-Việt',
      });
    } else {
      units.push({ vi: seg });
      tokens.push({
        surface: seg,
        reading: py,
        meaningVi: seg,
        pos: 'Ký hiệu / Tên riêng',
      });
    }
  }

  // Apply `Modifier + 的 + HeadNoun` -> `HeadNoun [của] Modifier` inversion!
  const reorderedVi: string[] = [];
  let idx = 0;
  while (idx < units.length) {
    if (
      idx + 2 < units.length &&
      units[idx + 1].isDeParticle &&
      !units[idx].isPunct &&
      !units[idx + 2].isPunct
    ) {
      const mod = units[idx];
      const head = units[idx + 2];
      if (mod.isPronoun) {
        reorderedVi.push(`${head.vi} của ${mod.vi}`);
      } else {
        reorderedVi.push(`${head.vi} ${mod.vi}`);
      }
      idx += 3;
      continue;
    }
    if (!units[idx].isDeParticle) {
      reorderedVi.push(units[idx].vi);
    }
    idx++;
  }

  // Natural cleanup for `quá X rồi` -> `X quá trời luôn` / `rất X`
  let combined = reorderedVi.join(' ').replace(/\s+,/g, ',');
  combined = combined.replace(/\bquá \/ cực kỳ (\S+) rồi\b/gi, '$1 quá luôn');

  const ratio = contentCount > 0 ? matched / contentCount : 0.65;
  const confidence = Math.max(0.5, Math.min(0.95, 0.55 + ratio * 0.4));

  return {
    translatedText: applyStylePolish(
      combined,
      req.styleMode,
      req.naturalnessLevel,
      'polite',
      isQuestion,
      isExclamation
    ),
    tokens,
    confidence,
    explanationVi: notes[0],
  };
}

// ============================================================================
// PUBLIC ENGINE ENTRYPOINTS
// ============================================================================

export async function translateWithLocalCJKEngine(
  req: TranslationRequestPayload
): Promise<TranslationResponsePayload> {
  const started = performance.now();
  const raw = (req.text ?? '').trim();

  if (!raw) {
    return {
      translatedText: '',
      detectedLanguage: req.previousDetectedLanguage ?? 'ko',
      confidence: 1,
      providerUsed: 'local-cjk-morphological',
      latencyMs: 1,
      tokens: [],
    };
  }

  // Resolve input language (manual or auto-detect with loanword hysteresis)
  const detection =
    req.sourceLanguage === 'auto'
      ? detectCJKLanguage(raw, req.previousDetectedLanguage)
      : {
          language: req.sourceLanguage as ConcreteLanguageCode,
          confidence: 0.99,
          switched: false,
        };

  const lang = detection.language;

  // Build combined glossary + proper noun protection map (User Glossary takes highest priority!)
  const glossaryMap = new Map<string, { vi: string; isGlossary: boolean; isProper: boolean }>();

  for (const p of PROTECTED_PROPER_NOUNS) {
    if (
      p.lang === 'any' ||
      p.lang === lang ||
      (p.lang === 'zh' && (lang === 'zh-CN' || lang === 'zh-TW'))
    ) {
      glossaryMap.set(p.source, {
        vi: req.properNounMode === 'keep-original' ? p.viKeep : p.transliteratedVi,
        isGlossary: false,
        isProper: true,
      });
    }
  }

  if (req.glossary) {
    for (const entry of req.glossary) {
      if (entry.originalTerm.trim()) {
        glossaryMap.set(entry.originalTerm.trim(), {
          vi: entry.keepOriginal ? entry.originalTerm.trim() : entry.preferredTranslation.trim(),
          isGlossary: true,
          isProper: Boolean(entry.keepOriginal),
        });
      }
    }
  }

  // Split multi-sentence utterances cleanly on sentence boundaries so greetings + follow-up clauses each translate naturally
  const sentences = raw
    .split(/(?<=[.?!。？！])\s*/)
    .map((s) => s.trim())
    .filter(Boolean);

  const sentencePieces = sentences.length > 0 ? sentences : [raw];
  const translatedSentences: string[] = [];
  const allTokens: MorphologicalToken[] = [];
  let minConf = 1;
  let firstExplanation: string | undefined;
  const rollingContext = [...(req.contextTurns ?? [])];

  for (const sent of sentencePieces) {
    const sentLang =
      req.sourceLanguage === 'auto'
        ? detectCJKLanguage(sent, lang).language
        : lang;
    const subReq: TranslationRequestPayload = {
      ...req,
      text: sent,
      contextTurns: rollingContext.slice(-6),
    };

    let subRes: {
      translatedText: string;
      tokens: MorphologicalToken[];
      confidence: number;
      explanationVi?: string;
    };

    if (sentLang === 'ko') {
      subRes = translateKoreanSentence(sent, subReq, glossaryMap);
    } else if (sentLang === 'ja') {
      subRes = await translateJapaneseSentence(sent, subReq, glossaryMap);
    } else {
      subRes = translateChineseSentence(sent, sentLang, subReq, glossaryMap);
    }

    translatedSentences.push(subRes.translatedText);
    allTokens.push(...subRes.tokens);
    minConf = Math.min(minConf, subRes.confidence);
    if (!firstExplanation && subRes.explanationVi) {
      firstExplanation = subRes.explanationVi;
    }
    rollingContext.push({
      sourceText: sent,
      translatedText: subRes.translatedText,
    });
  }

  const finalConfidence = Number(
    Math.min(minConf, detection.confidence).toFixed(2)
  );
  const latencyMs = Math.max(1, Math.round(performance.now() - started));

  return {
    translatedText: translatedSentences.join(' '),
    detectedLanguage: lang,
    languageSwitchSuggested: detection.switched,
    confidence: finalConfidence,
    providerUsed: 'local-cjk-morphological',
    latencyMs,
    tokens: allTokens,
    explanationVi: firstExplanation,
    uncertainReasonVi:
      finalConfidence < 0.66
        ? 'Một số từ ghép hoặc tiếng lóng chưa có độ tin cậy cao — chạm để đối chiếu câu gốc.'
        : undefined,
  };
}

/**
 * Quick Word Lookup (Section 23.1):
 * Never fabricates readings. Returns verified morphological reading, Hán-Việt, and meaning.
 */
export async function lookupCJKWord(
  term: string,
  sourceLanguage: SourceLanguageCode,
  contextSentence?: string
): Promise<{
  term: string;
  detectedLanguage: ConcreteLanguageCode;
  reading: string | null;
  hanViet: string | null;
  meaningVi: string | null;
  pos: string;
  grammarNote?: string;
  contextSentence?: string;
  hasVerifiedMeaning: boolean;
}> {
  const cleaned = term.trim().replace(/^[.,?!~…"']+|[.,?!~…"']+$/g, '');
  const lang =
    sourceLanguage === 'auto'
      ? detectCJKLanguage(cleaned || contextSentence || '').language
      : (sourceLanguage as ConcreteLanguageCode);

  if (!cleaned) {
    return {
      term,
      detectedLanguage: lang,
      reading: null,
      hanViet: null,
      meaningVi: null,
      pos: 'Không xác định',
      hasVerifiedMeaning: false,
    };
  }

  // Check protected proper nouns first
  const proper = PROTECTED_PROPER_NOUNS.find((p) => p.source === cleaned);
  if (proper) {
    return {
      term: cleaned,
      detectedLanguage: lang,
      reading:
        lang === 'ko'
          ? romanizeHangul(cleaned)
          : lang === 'ja'
          ? null
          : pinyin(toSimp(cleaned)),
      hanViet: lang === 'ko' ? null : computeHanVietSafe(cleaned) ?? null,
      meaningVi: `${proper.viKeep} (${proper.category})`,
      pos: 'Tên riêng',
      contextSentence,
      hasVerifiedMeaning: true,
    };
  }

  if (lang === 'ko') {
    const romaja = romanizeHangul(cleaned);
    const direct = KO_LEXICON[cleaned];
    if (direct) {
      return {
        term: cleaned,
        detectedLanguage: 'ko',
        reading: romaja,
        hanViet: null,
        meaningVi: direct.vi,
        pos: direct.pos,
        grammarNote: direct.note,
        contextSentence,
        hasVerifiedMeaning: true,
      };
    }
    const phrase = KO_PHRASES.find((p) => p.ko === cleaned);
    if (phrase) {
      return {
        term: cleaned,
        detectedLanguage: 'ko',
        reading: romaja,
        hanViet: null,
        meaningVi: phrase.vi,
        pos: 'Cụm từ / Khẩu ngữ',
        grammarNote: phrase.note,
        contextSentence,
        hasVerifiedMeaning: true,
      };
    }
    // Try stripping particle
    for (const part of KO_PARTICLES) {
      if (cleaned.length > part.p.length && cleaned.endsWith(part.p)) {
        const stem = cleaned.slice(0, cleaned.length - part.p.length);
        if (KO_LEXICON[stem]) {
          return {
            term: cleaned,
            detectedLanguage: 'ko',
            reading: romaja,
            hanViet: null,
            meaningVi: `${KO_LEXICON[stem].vi} (+ trợ từ ${part.p})`,
            pos: KO_LEXICON[stem].pos,
            grammarNote: KO_LEXICON[stem].note,
            contextSentence,
            hasVerifiedMeaning: true,
          };
        }
      }
    }
    return {
      term: cleaned,
      detectedLanguage: 'ko',
      reading: romaja,
      hanViet: null,
      meaningVi: null,
      pos: 'Chưa có trong từ điển cục bộ',
      grammarNote: 'Bạn có thể thêm từ này vào Từ điển cá nhân để ưu tiên cho các phiên sau.',
      contextSentence,
      hasVerifiedMeaning: false,
    };
  }

  if (lang === 'ja') {
    const tokenizer = await getKuromojiTokenizer();
    const toks = tokenizer.tokenize(cleaned);
    const first = toks[0];
    const hira = toks
      .map((t) => (t.reading ? katakanaToHiragana(t.reading) : t.surface_form))
      .join('');
    const romaji = hiraganaToRomaji(hira);
    const base = first?.basic_form && first.basic_form !== '*' ? first.basic_form : cleaned;
    const lex = JA_LEXICON[base] ?? JA_LEXICON[cleaned];
    const hv = computeHanVietSafe(cleaned) ?? null;

    return {
      term: cleaned,
      detectedLanguage: 'ja',
      reading: hira ? `${hira} · ${romaji}` : null,
      hanViet: hv,
      meaningVi: lex?.vi ?? (hv ? `Âm Hán-Việt: ${hv}` : null),
      pos: lex?.pos ?? first?.pos ?? 'Từ vựng tiếng Nhật',
      grammarNote: lex?.note ?? (base !== cleaned ? `Dạng nguyên thể: ${base}` : undefined),
      contextSentence,
      hasVerifiedMeaning: Boolean(lex),
    };
  }

  // Chinese (zh-CN / zh-TW)
  const simp = toSimp(cleaned);
  const py = pinyin(simp);
  const hv = computeHanVietSafe(cleaned) ?? null;
  const lex = ZH_LEXICON[simp];
  const phrase = ZH_PHRASES.find((p) => p.zhSimp === simp);

  return {
    term: cleaned,
    detectedLanguage: lang,
    reading: py || null,
    hanViet: hv,
    meaningVi: lex?.vi ?? phrase?.vi ?? (hv ? `Âm Hán-Việt: ${hv}` : null),
    pos: lex?.pos ?? (phrase ? 'Cụm giao tiếp' : 'Từ Hán-Việt'),
    grammarNote: lex?.regionalNote ?? phrase?.note,
    contextSentence,
    hasVerifiedMeaning: Boolean(lex || phrase),
  };
}
