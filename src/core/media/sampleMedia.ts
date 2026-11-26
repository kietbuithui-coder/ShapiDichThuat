import type { ConcreteLanguageCode } from '../../types/domain';

export interface QATestUtterance {
  startMs: number;
  endMs: number;
  speakerId: string;
  interimSteps: string[];
  finalText: string;
}

export interface QATestStreamDefinition {
  id: string;
  title: string;
  badgeLabel: string;
  language: ConcreteLanguageCode;
  durationMs: number;
  hasEmbeddedSubtitles: boolean;
  accentColor: string;
  speakerNames: Record<string, string>;
  utterances: QATestUtterance[];
  sampleSrtContent: string;
}

/**
 * Built-in QA Test Media & Streams (Explicitly labeled as Built-in QA Test Media per Rule 10!)
 * Exercises real incremental recognition -> real backend morphological/AI translation -> subtitle sync -> seeking!
 */
export const BUILTIN_QA_STREAMS: QATestStreamDefinition[] = [
  {
    id: 'qa-ko-live',
    title: '[Kiểm thử QA] Livestream Giao lưu & Esports Hàn Quốc',
    badgeLabel: 'Hàn · Luồng kiểm thử QA',
    language: 'ko',
    durationMs: 26000,
    hasEmbeddedSubtitles: true,
    accentColor: '#2E5BFF',
    speakerNames: {
      'speaker-1': 'Streamer',
      'speaker-2': 'Khách mời',
    },
    utterances: [
      {
        startMs: 800,
        endMs: 4600,
        speakerId: 'speaker-1',
        interimSteps: ['여러분 안녕', '여러분 안녕하세요! 오늘'],
        finalText: '여러분 안녕하세요! 방송 시작할게요.',
      },
      {
        startMs: 5200,
        endMs: 9200,
        speakerId: 'speaker-1',
        interimSteps: ['잘 들리'],
        finalText: '잘 들리나요?',
      },
      {
        startMs: 9800,
        endMs: 14800,
        speakerId: 'speaker-2',
        interimSteps: ['페이커 선수가', '페이커 선수가 오늘 경기도'],
        finalText: '페이커 선수가 오늘 경기도 너무 잘했어요!',
      },
      {
        startMs: 15400,
        endMs: 20200,
        speakerId: 'speaker-1',
        interimSteps: ['진짜 대박'],
        finalText: '진짜 대박이다!',
      },
      {
        startMs: 20800,
        endMs: 25200,
        speakerId: 'speaker-1',
        interimSteps: ['오늘 한국어 공부가'],
        finalText: '오늘 한국어 공부가 정말 재미있어요!',
      },
    ],
    sampleSrtContent: `1
00:00:00,800 --> 00:00:04,600
여러분 안녕하세요! 방송 시작할게요.

2
00:00:05,200 --> 00:00:09,200
잘 들리나요?

3
00:00:09,800 --> 00:00:14,800
페이커 선수가 오늘 경기도 너무 잘했어요!

4
00:00:15,400 --> 00:00:20,200
진짜 대박이다!

5
00:00:20,800 --> 00:00:25,200
오늘 한국어 공부가 정말 재미있어요!
`,
  },
  {
    id: 'qa-ja-talk',
    title: '[Kiểm thử QA] Talkshow & Lớp học Tiếng Nhật (Không phụ đề sẵn)',
    badgeLabel: 'Nhật · Tạo phụ đề từ luồng nói',
    language: 'ja',
    durationMs: 25000,
    hasEmbeddedSubtitles: false, // Tests Scenario 12: Video without pre-existing subtitles!
    accentColor: '#0D9488',
    speakerNames: {
      'speaker-1': 'Người dẫn (MC)',
      'speaker-2': 'Giảng viên',
    },
    utterances: [
      {
        startMs: 700,
        endMs: 5000,
        speakerId: 'speaker-1',
        interimSteps: ['皆さんこんばん', '皆さんこんばんは'],
        finalText: '皆さんこんばんは！',
      },
      {
        startMs: 5600,
        endMs: 10800,
        speakerId: 'speaker-1',
        interimSteps: ['よろしくお願い'],
        finalText: 'よろしくお願いします。',
      },
      {
        startMs: 11400,
        endMs: 17400,
        speakerId: 'speaker-2',
        interimSteps: ['今日の日本語の授業は', '今日の日本語の授業はとても'],
        finalText: '今日の日本語の授業はとてもわかりやすいですね。',
      },
      {
        startMs: 18000,
        endMs: 24200,
        speakerId: 'speaker-2',
        interimSteps: ['新しい動画をアップロード'],
        finalText: '新しい動画をアップロードしましたので見てください。',
      },
    ],
    sampleSrtContent: `WEBVTT

1
00:00:00.700 --> 00:00:05.000
皆さんこんばんは！

2
00:00:05.600 --> 00:00:10.800
よろしくお願いします。

3
00:00:11.400 --> 00:00:17.400
今日の日本語の授業はとてもわかりやすいですね。

4
00:00:18.000 --> 00:00:24.200
新しい動画をアップロードしましたので見てください。
`,
  },
  {
    id: 'qa-zh-stream',
    title: '[Kiểm thử QA] Livestream Công nghệ & Vlog Tiếng Trung (Giản & Phồn)',
    badgeLabel: 'Trung · Giản thể & Phồn thể',
    language: 'zh-CN',
    durationMs: 25000,
    hasEmbeddedSubtitles: true,
    accentColor: '#6366F1',
    speakerNames: {
      'speaker-1': 'Chủ phòng (Đại lục)',
      'speaker-2': 'Khách mời (Đài Bắc)',
    },
    utterances: [
      {
        startMs: 700,
        endMs: 5400,
        speakerId: 'speaker-1',
        interimSteps: ['欢迎来到', '欢迎来到今天的'],
        finalText: '欢迎来到今天的直播间！',
      },
      {
        startMs: 6000,
        endMs: 12200,
        speakerId: 'speaker-1',
        interimSteps: ['今天直播间的朋友们', '今天直播间的朋友们太热情了'],
        finalText: '今天直播间的朋友们太热情了，非常感谢大家的支持！',
      },
      {
        startMs: 12900,
        endMs: 18800,
        speakerId: 'speaker-2',
        interimSteps: ['這支教學影片', '這支教學影片講解得'],
        finalText: '這支教學影片講解得非常清楚，請大家訂閱按讚！',
      },
      {
        startMs: 19400,
        endMs: 24400,
        speakerId: 'speaker-1',
        interimSteps: ['原神今天的比赛'],
        finalText: '原神今天的比赛太精彩了！',
      },
    ],
    sampleSrtContent: `[Script Info]
Title: Chinese Stream ASS Sample
ScriptType: v4.00+

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.70,0:00:05.40,Default,Host,0,0,0,,欢迎来到今天的直播间！
Dialogue: 0,0:00:06.00,0:00:12.20,Default,Host,0,0,0,,{\\an2}今天直播间的朋友们太热情了，非常感谢大家的支持！
Dialogue: 0,0:00:12.90,0:00:18.80,Default,GuestTW,0,0,0,,這支教學影片講解得非常清楚，請大家訂閱按讚！
Dialogue: 0,0:00:19.40,0:00:24.40,Default,Host,0,0,0,,原神今天的比赛太精彩了！
`,
  },
];
