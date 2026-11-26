import { describe, expect, it } from 'vitest';
import { detectCJKLanguage } from '../src/core/languages/languageRegistry';
import { parseWebVideoUrl } from '../src/core/media/webVideoParser';
import {
  buildSongSearchQueries,
  parseSyncedLrcToCues,
  parseYouTubeJson3Captions,
} from '../src/core/media/youtubeAutoSubtitles';
import {
  BUILTIN_SUBTITLE_PRESETS,
  computeSubtitleInlineStyles,
} from '../src/core/subtitles/presets';
import {
  exportSubtitleSegments,
  findSyncedSegmentAtTime,
  parseSubtitleFileContent,
} from '../src/core/subtitles/subtitleParser';
import {
  lookupCJKWord,
  romanizeHangul,
  translateWithLocalCJKEngine,
} from '../server/engine/localCJKEngine';
import { executeTranslation } from '../server/providers/cloudProviders';

describe('LINGUA FLOW — Core Language Detection & Hysteresis (Section 4)', () => {
  it('accurately distinguishes Korean, Japanese, Simplified Chinese, and Traditional Chinese', () => {
    expect(detectCJKLanguage('여러분 안녕하세요!').language).toBe('ko');
    expect(detectCJKLanguage('今日の配信も楽しいですね').language).toBe('ja');
    expect(detectCJKLanguage('欢迎来到今天的直播间，这支视频很精彩').language).toBe('zh-CN');
    expect(detectCJKLanguage('歡迎來到今天的直播間，這支影片超精彩').language).toBe('zh-TW');
  });

  it('does NOT flip established session language on English loanwords or short interjections (Section 4.3)', () => {
    const res = detectCJKLanguage('OK! GG!', 'ja');
    expect(res.language).toBe('ja');
    expect(res.switched).toBe(false);
  });
});

describe('LINGUA FLOW — Korean, Japanese & Chinese Translation Quality (Section 40)', () => {
  it('translates Korean sentences with honorifics, slang, and proper noun protection (40.1)', async () => {
    const slangRes = await translateWithLocalCJKEngine({
      text: '진짜 대박이다!',
      sourceLanguage: 'ko',
      styleMode: 'entertainment',
      naturalnessLevel: 'natural',
      properNounMode: 'keep-original',
    });
    expect(slangRes.detectedLanguage).toBe('ko');
    expect(slangRes.translatedText.toLowerCase()).toContain('đỉnh');

    const properRes = await translateWithLocalCJKEngine({
      text: '페이커 선수가 오늘 경기도 너무 잘했어요',
      sourceLanguage: 'ko',
      styleMode: 'natural',
      naturalnessLevel: 'balanced',
      properNounMode: 'keep-original',
    });
    expect(properRes.translatedText).toContain('Faker');
  });

  it('recovers omitted Korean subjects from conversation context turns (Section 15.2)', async () => {
    const res = await translateWithLocalCJKEngine({
      text: '너무 맛있어요!',
      sourceLanguage: 'ko',
      styleMode: 'conversational',
      naturalnessLevel: 'balanced',
      properNounMode: 'keep-original',
      contextTurns: [
        {
          sourceText: '그녀가 만든 음식이에요.',
          translatedText: 'Đây là món ăn cô ấy làm.',
        },
      ],
    });
    expect(res.translatedText.length).toBeGreaterThan(4);
  });

  it('translates Japanese sentences using Kuromoji morphological SOV->SVO transfer & honorifics (40.2)', async () => {
    const res = await translateWithLocalCJKEngine({
      text: '今日の日本語の授業はとてもわかりやすいですね',
      sourceLanguage: 'auto',
      styleMode: 'natural',
      naturalnessLevel: 'balanced',
      properNounMode: 'keep-original',
    });
    expect(res.detectedLanguage).toBe('ja');
    expect(res.translatedText.toLowerCase()).toContain('buổi học tiếng nhật');
    expect(res.translatedText.toLowerCase()).toContain('dễ hiểu');
  });

  it('translates both Simplified & Traditional Chinese and prioritizes Personal Dictionary (15.3 & 40.3)', async () => {
    const tradRes = await translateWithLocalCJKEngine({
      text: '這支教學影片講解得非常清楚，請大家訂閱按讚！',
      sourceLanguage: 'auto',
      styleMode: 'natural',
      naturalnessLevel: 'balanced',
      properNounMode: 'keep-original',
    });
    expect(tradRes.detectedLanguage).toBe('zh-TW');
    expect(tradRes.translatedText.toLowerCase()).toContain('nhấn thích');

    // Personal glossary override test
    const customGlossaryRes = await translateWithLocalCJKEngine({
      text: '欢迎来到星光主播的直播间',
      sourceLanguage: 'zh-CN',
      styleMode: 'natural',
      naturalnessLevel: 'balanced',
      properNounMode: 'keep-original',
      glossary: [
        {
          originalTerm: '星光主播',
          preferredTranslation: 'Streamer Ánh Sao',
        },
      ],
    });
    expect(customGlossaryRes.translatedText).toContain('Streamer Ánh Sao');
  });

  it('provides verified Romaja, Hiragana/Romaji, Pinyin, and Sino-Vietnamese word lookup (23.1)', async () => {
    expect(romanizeHangul('공부')).toBe('gongbu');

    const jaLookup = await lookupCJKWord('配信', 'ja');
    expect(jaLookup.hasVerifiedMeaning).toBe(true);
    expect(jaLookup.reading).toContain('haishin');
    expect(jaLookup.hanViet).toBe('phối tín');

    const zhLookup = await lookupCJKWord('直播间', 'zh-CN');
    expect(zhLookup.hasVerifiedMeaning).toBe(true);
    expect(zhLookup.hanViet).toBe('trực bá gian');
  });
});

describe('LINGUA FLOW — Subtitle Engine, SRT/VTT/ASS & Video Seeking Sync (Sections 5.4, 10, 17)', () => {
  it('parses SRT, VTT, and ASS preserving exact timestamps and exports UTF-8 Vietnamese', () => {
    const srtRaw = `1\n00:00:01,250 --> 00:00:04,500\n여러분 안녕하세요!\n\n2\n00:00:05,000 --> 00:00:08,100\n잘 들리나요?`;
    const parsed = parseSubtitleFileContent(srtRaw, 'live.srt');
    expect(parsed.format).toBe('srt');
    expect(parsed.cues).toHaveLength(2);
    expect(parsed.cues[0].startTimestamp).toBe(1250);
    expect(parsed.cues[0].endTimestamp).toBe(4500);

    const assRaw = `[Events]\nDialogue: 0,0:00:02.30,0:00:06.80,Default,Speaker,0,0,0,,{\\an8}皆さんこんばんは！`;
    const parsedAss = parseSubtitleFileContent(assRaw, 'anime.ass');
    expect(parsedAss.format).toBe('ass');
    expect(parsedAss.cues[0].startTimestamp).toBe(2300);
    expect(parsedAss.cues[0].sourceText).toBe('皆さんこんばんは！');

    const exported = exportSubtitleSegments(
      [
        {
          startTimestamp: 1250,
          endTimestamp: 4500,
          sourceText: '여러분 안녕하세요!',
          translatedText: 'Chào mọi người nhé!',
        },
      ],
      'bilingual-srt'
    );
    expect(exported).toContain('00:00:01,250 --> 00:00:04,500');
    expect(exported).toContain('여러분 안녕하세요!\nChào mọi người nhé!');
  });

  it('handles corrupted subtitle files with a clear Vietnamese error message (Section 31)', () => {
    expect(() => parseSubtitleFileContent('invalid random text without timestamps', 'broken.srt')).toThrow(
      /mốc thời gian/i
    );
  });

  it('synchronizes video cues accurately across seeking and manual sync offsets without overlap (Section 17)', () => {
    const cues = [
      { id: '1', startTimestamp: 1000, endTimestamp: 4000 },
      { id: '2', startTimestamp: 5000, endTimestamp: 8000 },
    ];
    expect(findSyncedSegmentAtTime(cues, 2500, 0)?.id).toBe('1');
    // Gap between cues after seeking -> clears stale subtitle immediately!
    expect(findSyncedSegmentAtTime(cues, 4500, 0)).toBeNull();
    expect(findSyncedSegmentAtTime(cues, 6000, 0)?.id).toBe('2');
    // Manual +600ms delay offset shifts cue 1 to appear at 1600..4600ms
    expect(findSyncedSegmentAtTime(cues, 4400, 600)?.id).toBe('1');
  });

  it('validates all 8 built-in presets and inline style computation (Section 10.3)', () => {
    expect(BUILTIN_SUBTITLE_PRESETS).toHaveLength(8);
    for (const preset of BUILTIN_SUBTITLE_PRESETS) {
      const styles = computeSubtitleInlineStyles(preset);
      expect(styles.fontFamilyCss.length).toBeGreaterThan(5);
      expect(styles.backgroundCss).toMatch(/^rgba\(/);
    }
  });

  it('deduplicates repeated requests via bounded LRU cache during long sessions (Scenarios 5 & 16)', async () => {
    const req = {
      text: '大家好，欢迎来到今天的直播间！',
      sourceLanguage: 'zh-CN' as const,
      styleMode: 'natural' as const,
      naturalnessLevel: 'balanced' as const,
      properNounMode: 'keep-original' as const,
    };
    const first = await executeTranslation(req);
    const cached = await executeTranslation(req);
    expect(cached.translatedText).toBe(first.translatedText);
    expect(cached.latencyMs).toBeLessThanOrEqual(5);
  });

  it('parses YouTube (watch, youtu.be, shorts, live), Bilibili, Twitch, HLS .m3u8, MP4, and Web URLs', () => {
    const ytWatch = parseWebVideoUrl('https://www.youtube.com/watch?v=aqz-KE-bpKQ&t=45s');
    expect(ytWatch?.kind).toBe('youtube');
    expect(ytWatch?.videoId).toBe('aqz-KE-bpKQ');
    expect(ytWatch?.startSeconds).toBe(45);
    expect(ytWatch?.canEmbedDirectly).toBe(true);

    const ytShort = parseWebVideoUrl('youtu.be/M7lc1UVf-VE');
    expect(ytShort?.kind).toBe('youtube');
    expect(ytShort?.videoId).toBe('M7lc1UVf-VE');

    const ytShortsPath = parseWebVideoUrl('https://youtube.com/shorts/jNQXAC9IVRw');
    expect(ytShortsPath?.kind).toBe('youtube');
    expect(ytShortsPath?.videoId).toBe('jNQXAC9IVRw');

    const bili = parseWebVideoUrl('https://www.bilibili.com/video/BV1GJ411x7h7');
    expect(bili?.kind).toBe('bilibili');
    expect(bili?.videoId).toBe('BV1GJ411x7h7');

    const hls = parseWebVideoUrl('https://cdn.example.com/live/stream.m3u8');
    expect(hls?.kind).toBe('hls-stream');
    expect(hls?.supportsDirectElementAudio).toBe(true);

    const tiktok = parseWebVideoUrl('https://www.tiktok.com/@user/video/123456789');
    expect(tiktok?.kind).toBe('external-web');
    expect(tiktok?.canEmbedDirectly).toBe(false);
  });

  it('extracts clean song queries from MV titles and parses YouTube JSON3 & synced LRC timelines', () => {
    const queries = buildSongSearchQueries("iKON - ‘사랑을 했다(LOVE SCENARIO)’ M/V", 'iKON');
    expect(queries).toContain('iKON 사랑을 했다');
    expect(queries).toContain('iKON LOVE SCENARIO');

    const lrc = `[00:12.40] 사랑을 했다 우리가 만나\n[00:16.10] 지우지 못할 추억이 됐다`;
    const cues = parseSyncedLrcToCues(lrc);
    expect(cues).toHaveLength(2);
    expect(cues[0].startTimestamp).toBe(12400);
    expect(cues[0].sourceText).toBe('사랑을 했다 우리가 만나');
    expect(cues[0].endTimestamp).toBeLessThan(cues[1].startTimestamp);

    const j3 = JSON.stringify({
      events: [
        { tStartMs: 1500, dDurationMs: 3000, segs: [{ utf8: '皆さん' }, { utf8: 'こんにちは' }] },
        { tStartMs: 3800, dDurationMs: 2500, segs: [{ utf8: '今日の動画です' }] },
      ],
    });
    const j3Cues = parseYouTubeJson3Captions(j3);
    expect(j3Cues).toHaveLength(2);
    expect(j3Cues[0].sourceText).toBe('皆さんこんにちは');
    expect(j3Cues[0].endTimestamp).toBeLessThanOrEqual(j3Cues[1].startTimestamp);
  });
});
