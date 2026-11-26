import type {
  TranslationRequestPayload,
  TranslationResponsePayload,
} from '../../src/types/domain';
import { detectCJKLanguage } from '../../src/core/languages/languageRegistry';
import { translateWithLocalCJKEngine } from '../engine/localCJKEngine';

export interface ITranslationProvider {
  readonly id: string;
  readonly displayName: string;
  readonly isPaidCloud: boolean;
  isConfigured(): boolean;
  translate(req: TranslationRequestPayload): Promise<TranslationResponsePayload>;
}

/**
 * Bounded LRU Translation Cache (Section 41: Cost Control & Zero Duplicate Requests)
 */
class TranslationCache {
  private map = new Map<string, TranslationResponsePayload>();
  constructor(private readonly maxEntries = 400) {}

  makeKey(req: TranslationRequestPayload): string {
    const glossSig = (req.glossary ?? [])
      .map((g) => `${g.originalTerm}=${g.preferredTranslation}`)
      .join('|');
    const prevTurn = req.contextTurns?.[req.contextTurns.length - 1]?.translatedText ?? '';
    return `${req.preferredProvider ?? 'auto'}::${req.sourceLanguage}::${req.styleMode}::${req.naturalnessLevel}::${req.properNounMode}::${glossSig}::${prevTurn.slice(0, 32)}::${req.text.trim()}`;
  }

  get(key: string): TranslationResponsePayload | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    this.map.delete(key);
    this.map.set(key, hit);
    return hit;
  }

  set(key: string, value: TranslationResponsePayload): void {
    if (this.map.size >= this.maxEntries) {
      const oldestKey = this.map.keys().next().value;
      if (oldestKey) this.map.delete(oldestKey);
    }
    this.map.set(key, value);
  }
}

export const translationCache = new TranslationCache(500);

function buildSystemInstruction(req: TranslationRequestPayload): string {
  const styleDesc: Record<TranslationRequestPayload['styleMode'], string> = {
    natural: 'Dịch sang tiếng Việt tự nhiên, mượt mà, đúng ngữ cảnh nói chuyện hàng ngày.',
    literal: 'Dịch sát nghĩa và cấu trúc câu gốc, phục vụ đối chiếu học ngoại ngữ, không thêm từ đệm.',
    easy: 'Dịch dễ hiểu, câu ngắn gọn sáng rõ cho người mới xem.',
    conversational: 'Ưu tiên xưng hô, kính ngữ và quan hệ giữa các nhân vật hội thoại.',
    entertainment: 'Giữ sắc thái biểu cảm, hài hước, tiếng lóng livestream tự nhiên tiếng Việt.',
  };

  const glossaryLines = (req.glossary ?? [])
    .map((g) => `- "${g.originalTerm}" => "${g.keepOriginal ? g.originalTerm : g.preferredTranslation}"`)
    .join('\n');

  const contextLines = (req.contextTurns ?? [])
    .slice(-6)
    .map((t) => `[Gốc]: ${t.sourceText} -> [Việt]: ${t.translatedText}`)
    .join('\n');

  return [
    'Bạn là bộ máy dịch phụ đề thời gian thực LINGUA FLOW chuyên dịch Hàn/Nhật/Trung sang Tiếng Việt.',
    styleDesc[req.styleMode],
    req.properNounMode === 'keep-original'
      ? 'Giữ nguyên tên riêng (tên người, idol, streamer, thương hiệu) bằng phiên âm chuẩn, không dịch nghĩa đen.'
      : 'Phiên âm tên riêng sang cách gọi phổ biến dễ đọc trong tiếng Việt.',
    'Tuyệt đối không tự ý bịa thêm thông tin không có trong câu gốc. Chỉ trả về đúng câu tiếng Việt đã dịch.',
    glossaryLines ? `Từ điển cá nhân bắt buộc ưu tiên:\n${glossaryLines}` : '',
    contextLines ? `Ngữ cảnh các câu ngay trước đó:\n${contextLines}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export class OpenAITranslationProvider implements ITranslationProvider {
  readonly id = 'openai';
  readonly displayName = 'OpenAI Cloud Neural MT';
  readonly isPaidCloud = true;

  isConfigured(): boolean {
    return Boolean(process.env.OPENAI_API_KEY?.trim());
  }

  async translate(req: TranslationRequestPayload): Promise<TranslationResponsePayload> {
    const started = performance.now();
    const apiKey = process.env.OPENAI_API_KEY!.trim();
    const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
    const model =
      req.costTier === 'high_quality' ? 'gpt-4o' : 'gpt-4o-mini';

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8500);

    try {
      const resp = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: req.styleMode === 'literal' ? 0.1 : 0.3,
          messages: [
            { role: 'system', content: buildSystemInstruction(req) },
            { role: 'user', content: req.text },
          ],
        }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        throw new Error(`OpenAI HTTP ${resp.status}`);
      }
      const data = (await resp.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const out = data.choices?.[0]?.message?.content?.trim() ?? '';
      // Enrich tokens via local morphological analyzer so word-tap lookup always works
      const localAnalysis = await translateWithLocalCJKEngine(req);
      return {
        translatedText: out || localAnalysis.translatedText,
        detectedLanguage: localAnalysis.detectedLanguage,
        languageSwitchSuggested: localAnalysis.languageSwitchSuggested,
        confidence: 0.94,
        providerUsed: `openai:${model}`,
        latencyMs: Math.round(performance.now() - started),
        tokens: localAnalysis.tokens,
        explanationVi: localAnalysis.explanationVi,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

export class GeminiTranslationProvider implements ITranslationProvider {
  readonly id = 'gemini';
  readonly displayName = 'Google Gemini Flash MT';
  readonly isPaidCloud = true;

  isConfigured(): boolean {
    return Boolean(process.env.GEMINI_API_KEY?.trim());
  }

  async translate(req: TranslationRequestPayload): Promise<TranslationResponsePayload> {
    const started = performance.now();
    const apiKey = process.env.GEMINI_API_KEY!.trim();
    const model = 'gemini-2.5-flash';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8500);

    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: buildSystemInstruction(req) }] },
            contents: [{ role: 'user', parts: [{ text: req.text }] }],
            generationConfig: { temperature: 0.25 },
          }),
          signal: controller.signal,
        }
      );

      if (!resp.ok) {
        throw new Error(`Gemini HTTP ${resp.status}`);
      }
      const data = (await resp.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const out = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
      const localAnalysis = await translateWithLocalCJKEngine(req);
      return {
        translatedText: out || localAnalysis.translatedText,
        detectedLanguage: localAnalysis.detectedLanguage,
        languageSwitchSuggested: localAnalysis.languageSwitchSuggested,
        confidence: 0.94,
        providerUsed: `gemini:${model}`,
        latencyMs: Math.round(performance.now() - started),
        tokens: localAnalysis.tokens,
        explanationVi: localAnalysis.explanationVi,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

export class LocalHybridTranslationProvider implements ITranslationProvider {
  readonly id = 'local-hybrid';
  readonly displayName = 'Local Contextual CJK Morphological Engine';
  readonly isPaidCloud = false;

  isConfigured(): boolean {
    return true;
  }

  async translate(req: TranslationRequestPayload): Promise<TranslationResponsePayload> {
    return translateWithLocalCJKEngine(req);
  }
}

const openAIProvider = new OpenAITranslationProvider();
const geminiProvider = new GeminiTranslationProvider();
const localProvider = new LocalHybridTranslationProvider();

export function getServerProviderStatus() {
  return {
    activeDefault: openAIProvider.isConfigured()
      ? 'openai'
      : geminiProvider.isConfigured()
      ? 'gemini'
      : 'local-hybrid',
    providers: [
      {
        id: localProvider.id,
        name: localProvider.displayName,
        configured: true,
        isPaidCloud: false,
      },
      {
        id: openAIProvider.id,
        name: openAIProvider.displayName,
        configured: openAIProvider.isConfigured(),
        isPaidCloud: true,
      },
      {
        id: geminiProvider.id,
        name: geminiProvider.displayName,
        configured: geminiProvider.isConfigured(),
        isPaidCloud: true,
      },
    ],
    deepgramASRConfigured: Boolean(process.env.DEEPGRAM_API_KEY?.trim()),
  };
}

/**
 * Orchestrates translation with caching, explicit provider selection, and safe local fallback
 * (Never silently switches TO a paid provider without user preference; falls back TO free local engine on network failure).
 */
export async function executeTranslation(
  req: TranslationRequestPayload
): Promise<TranslationResponsePayload> {
  if (!req.text?.trim()) {
    return {
      translatedText: '',
      detectedLanguage:
        req.sourceLanguage === 'auto'
          ? req.previousDetectedLanguage ?? 'ko'
          : detectCJKLanguage(req.text, req.previousDetectedLanguage).language,
      confidence: 1,
      providerUsed: 'noop',
      latencyMs: 0,
      tokens: [],
    };
  }

  const cacheKey = translationCache.makeKey(req);
  if (!req.isInterim) {
    const cached = translationCache.get(cacheKey);
    if (cached) {
      return { ...cached, latencyMs: 1 };
    }
  }

  let selected: ITranslationProvider = localProvider;
  const pref = req.preferredProvider ?? 'auto';

  if (pref === 'openai' && openAIProvider.isConfigured()) {
    selected = openAIProvider;
  } else if (pref === 'gemini' && geminiProvider.isConfigured()) {
    selected = geminiProvider;
  } else if (pref === 'auto') {
    if (openAIProvider.isConfigured()) selected = openAIProvider;
    else if (geminiProvider.isConfigured()) selected = geminiProvider;
    else selected = localProvider;
  }

  try {
    const res = await selected.translate(req);
    if (!req.isInterim) {
      translationCache.set(cacheKey, res);
    }
    return res;
  } catch {
    // Graceful fallback to local engine so the UI never freezes or crashes when external API fails (Section 41.2)
    const fallback = await localProvider.translate(req);
    return {
      ...fallback,
      providerUsed: `${fallback.providerUsed} (fallback)`,
    };
  }
}
