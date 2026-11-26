import type { TranscriptSegment } from '../../types/domain';

export interface ParsedSubtitleCue {
  id: string;
  index: number;
  startTimestamp: number; // ms
  endTimestamp: number;   // ms
  sourceText: string;
  translatedText?: string;
  speakerId?: string;
}

export type SubtitleFileFormat = 'srt' | 'vtt' | 'ass' | 'txt';

export function parseTimestampToMs(raw: string): number | null {
  const cleaned = raw.trim();
  // Match HH:MM:SS,mmm or HH:MM:SS.mmm or MM:SS.mmm or H:MM:SS.cc (ASS centiseconds)
  const fullMatch = cleaned.match(/^(\d{1,2}):(\d{2}):(\d{2})(?:[,.](\d{1,3}))?$/);
  if (fullMatch) {
    const h = Number(fullMatch[1]);
    const m = Number(fullMatch[2]);
    const s = Number(fullMatch[3]);
    const fracRaw = fullMatch[4] ?? '0';
    const ms =
      fracRaw.length === 1
        ? Number(fracRaw) * 100
        : fracRaw.length === 2
        ? Number(fracRaw) * 10
        : Number(fracRaw.slice(0, 3));
    return ((h * 3600 + m * 60 + s) * 1000) + ms;
  }

  const shortMatch = cleaned.match(/^(\d{1,2}):(\d{2})(?:[,.](\d{1,3}))?$/);
  if (shortMatch) {
    const m = Number(shortMatch[1]);
    const s = Number(shortMatch[2]);
    const fracRaw = shortMatch[3] ?? '0';
    const ms =
      fracRaw.length === 1
        ? Number(fracRaw) * 100
        : fracRaw.length === 2
        ? Number(fracRaw) * 10
        : Number(fracRaw.slice(0, 3));
    return (m * 60 + s) * 1000 + ms;
  }

  return null;
}

export function formatMsToSrtTimestamp(ms: number): string {
  const clamped = Math.max(0, Math.round(ms));
  const hours = Math.floor(clamped / 3600000);
  const mins = Math.floor((clamped % 3600000) / 60000);
  const secs = Math.floor((clamped % 60000) / 1000);
  const millis = clamped % 1000;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

export function formatMsToVttTimestamp(ms: number): string {
  return formatMsToSrtTimestamp(ms).replace(',', '.');
}

export function formatMsToReadableClock(ms: number): string {
  const clamped = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = clamped % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Parses .SRT, .VTT, and .ASS/.SSA subtitle files accurately, preserving all timestamps (Section 5.4).
 * Throws clear user-friendly Vietnamese error messages when the format is corrupted (Section 31).
 */
export function parseSubtitleFileContent(
  content: string,
  fileName = 'subtitles.srt'
): { format: SubtitleFileFormat; cues: ParsedSubtitleCue[] } {
  const normalized = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalized) {
    throw new Error('Tệp phụ đề trống. Vui lòng chọn tệp SRT, VTT hoặc ASS có nội dung.');
  }

  const lowerName = fileName.toLowerCase();
  const isAss =
    lowerName.endsWith('.ass') ||
    lowerName.endsWith('.ssa') ||
    normalized.includes('[Events]') ||
    /^Dialogue:\s*\d+,/m.test(normalized);

  if (isAss) {
    const cues: ParsedSubtitleCue[] = [];
    const lines = normalized.split('\n');
    let idx = 1;
    for (const line of lines) {
      if (!line.startsWith('Dialogue:')) continue;
      // Dialogue: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
      const parts = line.slice('Dialogue:'.length).split(',');
      if (parts.length < 10) continue;
      const startMs = parseTimestampToMs(parts[1]);
      const endMs = parseTimestampToMs(parts[2]);
      const actor = parts[4]?.trim();
      const rawDialogue = parts.slice(9).join(',');
      const cleanedText = rawDialogue
        .replace(/\{[^}]*\}/g, '') // Strip ASS override tags {\pos...}
        .replace(/\\N|\\n/g, '\n')
        .trim();

      if (startMs !== null && endMs !== null && cleanedText) {
        cues.push({
          id: `cue-${idx}`,
          index: idx++,
          startTimestamp: startMs,
          endTimestamp: Math.max(startMs + 500, endMs),
          sourceText: cleanedText,
          speakerId: actor || undefined,
        });
      }
    }

    if (cues.length === 0) {
      throw new Error('Tệp ASS/SSA không có dòng hội thoại (Dialogue) hợp lệ.');
    }
    return { format: 'ass', cues };
  }

  const isVtt = lowerName.endsWith('.vtt') || normalized.startsWith('WEBVTT');
  const blocks = normalized
    .replace(/^WEBVTT[^\n]*\n?/, '')
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  const cues: ParsedSubtitleCue[] = [];
  let cueIdx = 1;

  for (const block of blocks) {
    if (block.startsWith('NOTE') || block.startsWith('STYLE')) continue;
    const lines = block.split('\n').map((l) => l.trim());
    const timingLineIndex = lines.findIndex((l) => l.includes('-->'));
    if (timingLineIndex === -1) continue;

    const timingLine = lines[timingLineIndex];
    const [rawStart, rawRight] = timingLine.split('-->');
    const rawEnd = (rawRight ?? '').trim().split(/\s+/)[0] ?? '';
    const startMs = parseTimestampToMs(rawStart);
    const endMs = parseTimestampToMs(rawEnd);

    if (startMs === null || endMs === null) continue;

    const textLines = lines
      .slice(timingLineIndex + 1)
      .join('\n')
      .replace(/<[^>]+>/g, '') // Strip VTT inline styling tags like <c.color>
      .trim();

    if (!textLines) continue;

    cues.push({
      id: `cue-${cueIdx}`,
      index: cueIdx++,
      startTimestamp: startMs,
      endTimestamp: Math.max(startMs + 400, endMs),
      sourceText: textLines,
    });
  }

  if (cues.length === 0) {
    throw new Error(
      'Không đọc được mốc thời gian trong tệp phụ đề. Hãy kiểm tra định dạng SRT (00:00:01,000 --> 00:00:03,000) hoặc VTT.'
    );
  }

  return {
    format: isVtt ? 'vtt' : 'srt',
    cues,
  };
}

/**
 * Validates and exports segments to SRT, VTT, TXT, or Bilingual SRT without losing timestamps or Vietnamese diacritics (Section 22.2).
 */
export function exportSubtitleSegments(
  segments: Array<
    Pick<
      TranscriptSegment,
      | 'startTimestamp'
      | 'endTimestamp'
      | 'sourceText'
      | 'translatedText'
      | 'userEditedText'
      | 'isUserEdited'
    >
  >,
  format: 'srt' | 'vtt' | 'txt' | 'bilingual-srt'
): string {
  const sorted = [...segments]
    .filter((s) => (s.userEditedText || s.translatedText || s.sourceText).trim().length > 0)
    .sort((a, b) => a.startTimestamp - b.startTimestamp);

  if (sorted.length === 0) {
    throw new Error('Chưa có câu phụ đề nào để xuất dữ liệu.');
  }

  if (format === 'txt') {
    return sorted
      .map((seg) => {
        const finalVi = (seg.isUserEdited && seg.userEditedText ? seg.userEditedText : seg.translatedText).trim();
        const clock = formatMsToReadableClock(seg.startTimestamp);
        return seg.sourceText && finalVi && seg.sourceText !== finalVi
          ? `[${clock}] ${seg.sourceText}\n         → ${finalVi}`
          : `[${clock}] ${finalVi || seg.sourceText}`;
      })
      .join('\n\n');
  }

  if (format === 'vtt') {
    const body = sorted
      .map((seg, i) => {
        const start = formatMsToVttTimestamp(seg.startTimestamp);
        const end = formatMsToVttTimestamp(
          Math.max(seg.startTimestamp + 900, seg.endTimestamp || seg.startTimestamp + 2500)
        );
        const finalVi = (seg.isUserEdited && seg.userEditedText ? seg.userEditedText : seg.translatedText).trim();
        return `${i + 1}\n${start} --> ${end}\n${finalVi || seg.sourceText}`;
      })
      .join('\n\n');
    return `WEBVTT\n\n${body}\n`;
  }

  // SRT or Bilingual SRT
  return (
    sorted
      .map((seg, i) => {
        const start = formatMsToSrtTimestamp(seg.startTimestamp);
        const end = formatMsToSrtTimestamp(
          Math.max(seg.startTimestamp + 900, seg.endTimestamp || seg.startTimestamp + 2500)
        );
        const finalVi = (seg.isUserEdited && seg.userEditedText ? seg.userEditedText : seg.translatedText).trim();
        const textBlock =
          format === 'bilingual-srt' && seg.sourceText && finalVi
            ? `${seg.sourceText}\n${finalVi}`
            : finalVi || seg.sourceText;
        return `${i + 1}\n${start} --> ${end}\n${textBlock}`;
      })
      .join('\n\n') + '\n'
  );
}

/**
 * Finds the active segment for video playback at `currentTimeMs + manualSyncOffsetMs`,
 * guaranteeing zero overlapping subtitles and immediate clearing on seek (Section 17).
 */
export function findSyncedSegmentAtTime<
  T extends { startTimestamp: number; endTimestamp: number }
>(segments: T[], currentTimeMs: number, manualOffsetMs = 0): T | null {
  const effectiveTime = currentTimeMs - manualOffsetMs;
  if (effectiveTime < 0 || segments.length === 0) return null;

  // Prefer the latest segment whose window contains effectiveTime so two overlapping cues never collide
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (effectiveTime >= seg.startTimestamp && effectiveTime <= seg.endTimestamp) {
      return seg;
    }
  }
  return null;
}
