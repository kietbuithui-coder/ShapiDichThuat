export type WebVideoKind =
  | 'youtube'
  | 'bilibili'
  | 'twitch'
  | 'vimeo'
  | 'dailymotion'
  | 'hls-stream'
  | 'direct-video'
  | 'external-web';

export interface ParsedWebVideoSource {
  kind: WebVideoKind;
  originalUrl: string;
  normalizedUrl: string;
  platformLabel: string;
  videoId?: string;
  embedUrl?: string;
  startSeconds?: number;
  canEmbedDirectly: boolean;
  supportsDirectElementAudio: boolean;
  suggestedTitle: string;
}

export interface SampleWebVideoLink {
  id: string;
  label: string;
  platform: string;
  langBadge: string;
  sourceLang: 'ko' | 'ja' | 'zh-CN' | 'zh-TW';
  url: string;
}

/**
 * Ready-to-try real YouTube & Web video links so users can test opening & translating immediately
 */
export const SAMPLE_WEB_VIDEO_LINKS: SampleWebVideoLink[] = [
  {
    id: 'yt-ko-ikon',
    label: "YouTube Hàn: iKON '사랑을 했다'",
    platform: 'YouTube',
    langBadge: 'KO',
    sourceLang: 'ko',
    url: 'https://www.youtube.com/watch?v=vecSVX1QYbQ',
  },
  {
    id: 'yt-ja-yoasobi',
    label: 'YouTube Nhật: YOASOBI「アイドル」',
    platform: 'YouTube',
    langBadge: 'JA',
    sourceLang: 'ja',
    url: 'https://www.youtube.com/watch?v=ZRtdQ81jPUQ',
  },
  {
    id: 'yt-zh-jay',
    label: 'YouTube Trung: 周杰倫 告白氣球',
    platform: 'YouTube',
    langBadge: 'ZH',
    sourceLang: 'zh-TW',
    url: 'https://www.youtube.com/watch?v=bu7nU9Mhpyo',
  },
  {
    id: 'bili-demo',
    label: 'Bilibili Video',
    platform: 'Bilibili',
    langBadge: 'ZH',
    sourceLang: 'zh-CN',
    url: 'https://www.bilibili.com/video/BV1GJ411x7h7',
  },
];

function parseTimeParamToSeconds(raw: string | null): number | undefined {
  if (!raw) return undefined;
  if (/^\d+$/.test(raw)) return Number(raw);
  const match = raw.match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?/i);
  if (!match) return undefined;
  const h = Number(match[1] ?? 0);
  const m = Number(match[2] ?? 0);
  const s = Number(match[3] ?? 0);
  const total = h * 3600 + m * 60 + s;
  return total > 0 ? total : undefined;
}

export function extractYouTubeId(inputUrl: string): { videoId: string; startSeconds?: number } | null {
  try {
    const u = new URL(inputUrl);
    const host = u.hostname.replace(/^www\./i, '').replace(/^m\./i, '').toLowerCase();

    if (host === 'youtu.be') {
      const id = u.pathname.split('/').filter(Boolean)[0];
      if (id && /^[a-zA-Z0-9_-]{6,15}$/.test(id)) {
        return {
          videoId: id,
          startSeconds: parseTimeParamToSeconds(u.searchParams.get('t') ?? u.searchParams.get('start')),
        };
      }
    }

    if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'music.youtube.com') {
      const vParam = u.searchParams.get('v');
      if (vParam && /^[a-zA-Z0-9_-]{6,15}$/.test(vParam)) {
        return {
          videoId: vParam,
          startSeconds: parseTimeParamToSeconds(u.searchParams.get('t') ?? u.searchParams.get('start')),
        };
      }

      const parts = u.pathname.split('/').filter(Boolean);
      if (
        parts.length >= 2 &&
        (parts[0] === 'shorts' || parts[0] === 'live' || parts[0] === 'embed' || parts[0] === 'v')
      ) {
        const id = parts[1];
        if (id && /^[a-zA-Z0-9_-]{6,15}$/.test(id)) {
          return {
            videoId: id,
            startSeconds: parseTimeParamToSeconds(u.searchParams.get('t') ?? u.searchParams.get('start')),
          };
        }
      }
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Classifies any pasted link (YouTube, Bilibili, Twitch, Vimeo, Dailymotion, HLS .m3u8, MP4, or general Web page)
 */
export function parseWebVideoUrl(rawInput: string): ParsedWebVideoSource | null {
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  // Automatically prepend https:// if user pasted "youtube.com/watch?v=..." or "youtu.be/..."
  const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(normalized);
  } catch {
    return null;
  }

  const host = parsedUrl.hostname.replace(/^www\./i, '').toLowerCase();
  const pathname = parsedUrl.pathname;

  // 1. YouTube (watch, shorts, live, youtu.be)
  const yt = extractYouTubeId(normalized);
  if (yt) {
    const originParam =
      typeof window !== 'undefined' && window.location?.origin
        ? `&origin=${encodeURIComponent(window.location.origin)}`
        : '';
    const startParam = yt.startSeconds ? `&start=${yt.startSeconds}` : '';
    return {
      kind: 'youtube',
      originalUrl: trimmed,
      normalizedUrl: normalized,
      platformLabel: 'YouTube',
      videoId: yt.videoId,
      startSeconds: yt.startSeconds,
      embedUrl: `https://www.youtube.com/embed/${yt.videoId}?enablejsapi=1&playsinline=1&rel=0${startParam}${originParam}`,
      canEmbedDirectly: true,
      supportsDirectElementAudio: false,
      suggestedTitle: `YouTube Video (${yt.videoId})`,
    };
  }

  // 2. Bilibili (BV... or av...)
  if (host.includes('bilibili.com')) {
    const bvMatch = pathname.match(/\/(BV[0-9A-Za-z]+)/);
    const avMatch = pathname.match(/\/av(\d+)/i);
    if (bvMatch) {
      const bvid = bvMatch[1];
      return {
        kind: 'bilibili',
        originalUrl: trimmed,
        normalizedUrl: normalized,
        platformLabel: 'Bilibili',
        videoId: bvid,
        embedUrl: `https://player.bilibili.com/player.html?bvid=${encodeURIComponent(bvid)}&high_quality=1&danmaku=0&autoplay=0`,
        canEmbedDirectly: true,
        supportsDirectElementAudio: false,
        suggestedTitle: `Bilibili (${bvid})`,
      };
    }
    if (avMatch) {
      const aid = avMatch[1];
      return {
        kind: 'bilibili',
        originalUrl: trimmed,
        normalizedUrl: normalized,
        platformLabel: 'Bilibili',
        videoId: `av${aid}`,
        embedUrl: `https://player.bilibili.com/player.html?aid=${encodeURIComponent(aid)}&high_quality=1&danmaku=0&autoplay=0`,
        canEmbedDirectly: true,
        supportsDirectElementAudio: false,
        suggestedTitle: `Bilibili (av${aid})`,
      };
    }
  }

  // 3. Twitch (live channel or VOD)
  if (host === 'twitch.tv' || host === 'm.twitch.tv') {
    const parentHost =
      typeof window !== 'undefined' && window.location?.hostname
        ? window.location.hostname
        : 'localhost';
    const parts = pathname.split('/').filter(Boolean);
    if (parts[0] === 'videos' && parts[1]) {
      return {
        kind: 'twitch',
        originalUrl: trimmed,
        normalizedUrl: normalized,
        platformLabel: 'Twitch VOD',
        videoId: parts[1],
        embedUrl: `https://player.twitch.tv/?video=${encodeURIComponent(parts[1])}&parent=${encodeURIComponent(parentHost)}&autoplay=false`,
        canEmbedDirectly: true,
        supportsDirectElementAudio: false,
        suggestedTitle: `Twitch Video #${parts[1]}`,
      };
    }
    if (parts[0]) {
      return {
        kind: 'twitch',
        originalUrl: trimmed,
        normalizedUrl: normalized,
        platformLabel: 'Twitch Live',
        videoId: parts[0],
        embedUrl: `https://player.twitch.tv/?channel=${encodeURIComponent(parts[0])}&parent=${encodeURIComponent(parentHost)}&autoplay=false`,
        canEmbedDirectly: true,
        supportsDirectElementAudio: false,
        suggestedTitle: `Twitch Live: ${parts[0]}`,
      };
    }
  }

  // 4. Vimeo
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const vimeoMatch = pathname.match(/\/(\d+)/);
    if (vimeoMatch) {
      return {
        kind: 'vimeo',
        originalUrl: trimmed,
        normalizedUrl: normalized,
        platformLabel: 'Vimeo',
        videoId: vimeoMatch[1],
        embedUrl: `https://player.vimeo.com/video/${vimeoMatch[1]}`,
        canEmbedDirectly: true,
        supportsDirectElementAudio: false,
        suggestedTitle: `Vimeo #${vimeoMatch[1]}`,
      };
    }
  }

  // 5. Dailymotion
  if (host.includes('dailymotion.com') || host === 'dai.ly') {
    const dmMatch =
      host === 'dai.ly'
        ? pathname.split('/').filter(Boolean)[0]
        : pathname.match(/\/video\/([a-zA-Z0-9]+)/)?.[1];
    if (dmMatch) {
      return {
        kind: 'dailymotion',
        originalUrl: trimmed,
        normalizedUrl: normalized,
        platformLabel: 'Dailymotion',
        videoId: dmMatch,
        embedUrl: `https://www.dailymotion.com/embed/video/${dmMatch}`,
        canEmbedDirectly: true,
        supportsDirectElementAudio: false,
        suggestedTitle: `Dailymotion (${dmMatch})`,
      };
    }
  }

  // 6. HLS Stream (.m3u8)
  if (/\.m3u8(\?.*)?$/i.test(normalized)) {
    return {
      kind: 'hls-stream',
      originalUrl: trimmed,
      normalizedUrl: normalized,
      platformLabel: 'Luồng HLS (.M3U8)',
      canEmbedDirectly: true,
      supportsDirectElementAudio: true,
      suggestedTitle: pathname.split('/').pop() || 'Luồng trực tuyến HLS',
    };
  }

  // 7. Direct HTML5 Video (.mp4, .webm, .mov, .m4v, .ogg)
  if (/\.(mp4|webm|mov|m4v|ogv|ogg)(\?.*)?$/i.test(normalized)) {
    return {
      kind: 'direct-video',
      originalUrl: trimmed,
      normalizedUrl: normalized,
      platformLabel: 'Tệp Video Trực Tiếp',
      canEmbedDirectly: true,
      supportsDirectElementAudio: true,
      suggestedTitle: decodeURIComponent(pathname.split('/').pop() || 'Video trực tuyến'),
    };
  }

  // 8. General Web Page (TikTok, Douyin, Facebook, Weverse, Naver Chzzk, SOOP, Web portal...)
  let platformLabel = host;
  if (host.includes('tiktok.com')) platformLabel = 'TikTok Web';
  else if (host.includes('douyin.com')) platformLabel = 'Douyin (抖音)';
  else if (host.includes('facebook.com') || host.includes('fb.watch')) platformLabel = 'Facebook Video';
  else if (host.includes('weverse.io')) platformLabel = 'Weverse Live';
  else if (host.includes('chzzk.naver.com')) platformLabel = 'Naver CHZZK';
  else if (host.includes('sooplive') || host.includes('afreecatv')) platformLabel = 'SOOP / AfreecaTV';
  else if (host.includes('weibo.com')) platformLabel = 'Weibo Video';

  // Sites known to block cross-origin iframes via X-Frame-Options / CSP frame-ancestors
  const blocksIframe =
    /tiktok\.com|douyin\.com|facebook\.com|fb\.watch|weverse\.io|netflix\.com|chzzk\.naver\.com|weibo\.com|x\.com|twitter\.com|instagram\.com/i.test(
      host
    );

  return {
    kind: 'external-web',
    originalUrl: trimmed,
    normalizedUrl: normalized,
    platformLabel,
    embedUrl: blocksIframe ? undefined : normalized,
    canEmbedDirectly: !blocksIframe,
    supportsDirectElementAudio: false,
    suggestedTitle: `Video trên ${platformLabel}`,
  };
}
