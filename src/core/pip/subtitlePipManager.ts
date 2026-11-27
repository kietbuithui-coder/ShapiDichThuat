import type { SubtitlePreset } from '../../types/domain';

export interface FloatingPipSubtitlePayload {
  sourceText: string;
  translatedText: string;
  isPartial?: boolean;
  statusLabel: string;
  isRunning: boolean;
  preset: SubtitlePreset;
}

interface DocumentPictureInPictureApi {
  window: Window | null;
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
}

function wrapCanvasLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = words[0];

  for (let i = 1; i < words.length; i++) {
    const candidate = `${current} ${words[i]}`;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[i];
      if (lines.length >= maxLines - 1) {
        const rest = [current, ...words.slice(i + 1)].join(' ');
        current = rest;
        break;
      }
    }
  }
  lines.push(current);
  return lines.slice(0, maxLines);
}

/**
 * Manages a real Always-On-Top Floating Subtitle Window that hovers over YouTube,
 * Bilibili, TikTok, or any external browser tab/window using:
 * 1. Document Picture-in-Picture API (Chrome/Edge interactive floating window)
 * 2. Canvas Stream Video Picture-in-Picture fallback (Safari / iOS / Mobile)
 */
class SubtitlePipManager {
  private docPipWin: Window | null = null;
  private canvasEl: HTMLCanvasElement | null = null;
  private videoEl: HTMLVideoElement | null = null;
  private lastPayload: FloatingPipSubtitlePayload | null = null;
  private onStateChangeListener: ((active: boolean) => void) | null = null;
  private onActionListener: ((action: 'toggle-pause' | 'font-up' | 'font-down') => void) | null =
    null;

  setListeners(opts: {
    onStateChange?: (active: boolean) => void;
    onAction?: (action: 'toggle-pause' | 'font-up' | 'font-down') => void;
  }): void {
    this.onStateChangeListener = opts.onStateChange ?? null;
    this.onActionListener = opts.onAction ?? null;
  }

  isOpen(): boolean {
    if (this.docPipWin && !this.docPipWin.closed) return true;
    if (typeof document !== 'undefined' && this.videoEl && document.pictureInPictureElement === this.videoEl) {
      return true;
    }
    return false;
  }

  async open(initialPayload: FloatingPipSubtitlePayload): Promise<{ ok: boolean; mode?: string; error?: string }> {
    this.lastPayload = initialPayload;

    if (typeof window === 'undefined') {
      return { ok: false, error: 'Môi trường không hỗ trợ cửa sổ nổi.' };
    }

    // 1. Try Document Picture-in-Picture first (interactive Always-On-Top window!)
    const docPip = (window as unknown as { documentPictureInPicture?: DocumentPictureInPictureApi })
      .documentPictureInPicture;

    if (docPip && typeof docPip.requestWindow === 'function') {
      try {
        const pipWin = await docPip.requestWindow({ width: 480, height: 195 });
        this.docPipWin = pipWin;
        this.setupDocPipDom(pipWin, initialPayload);
        pipWin.addEventListener('pagehide', () => {
          this.docPipWin = null;
          this.onStateChangeListener?.(false);
        });
        this.onStateChangeListener?.(true);
        return { ok: true, mode: 'document-pip' };
      } catch {
        // Fall through to Canvas Video PiP
      }
    }

    // 2. Universal Fallback: Canvas -> MediaStream -> <video> Picture-in-Picture
    try {
      if (!document.pictureInPictureEnabled) {
        return {
          ok: false,
          error:
            'Trình duyệt hiện tại chặn cửa sổ nổi ngoài tab (hoặc đang chạy trong khung nhúng giới hạn quyền PiP). Bạn vẫn dùng được Bong bóng nổi ngay trong ứng dụng!',
        };
      }

      if (!this.canvasEl) {
        this.canvasEl = document.createElement('canvas');
        this.canvasEl.width = 840;
        this.canvasEl.height = 300;
      }

      this.drawCanvasSubtitle(initialPayload);

      if (!this.videoEl) {
        const v = document.createElement('video');
        v.muted = true;
        v.playsInline = true;
        v.style.position = 'fixed';
        v.style.width = '1px';
        v.style.height = '1px';
        v.style.opacity = '0';
        v.style.pointerEvents = 'none';
        v.style.bottom = '0';
        v.style.right = '0';
        document.body.appendChild(v);
        v.addEventListener('leavepictureinpicture', () => {
          this.onStateChangeListener?.(false);
        });
        this.videoEl = v;
      }

      const stream = this.canvasEl.captureStream(15);
      this.videoEl.srcObject = stream;
      await this.videoEl.play();
      await this.videoEl.requestPictureInPicture();
      this.onStateChangeListener?.(true);
      return { ok: true, mode: 'video-pip' };
    } catch {
      return {
        ok: false,
        error:
          'Không thể tách cửa sổ PiP ngoài trình duyệt trong khung xem trước hiện tại. Hãy mở ứng dụng ở tab riêng hoặc dùng Bong bóng nổi ngay trên màn hình!',
      };
    }
  }

  update(payload: FloatingPipSubtitlePayload): void {
    this.lastPayload = payload;
    if (this.docPipWin && !this.docPipWin.closed) {
      this.renderDocPipContent(this.docPipWin, payload);
    }
    if (this.canvasEl) {
      this.drawCanvasSubtitle(payload);
    }
  }

  async close(): Promise<void> {
    if (this.docPipWin && !this.docPipWin.closed) {
      this.docPipWin.close();
      this.docPipWin = null;
    }
    if (
      typeof document !== 'undefined' &&
      this.videoEl &&
      document.pictureInPictureElement === this.videoEl
    ) {
      await document.exitPictureInPicture().catch(() => {});
    }
    this.onStateChangeListener?.(false);
  }

  private setupDocPipDom(pipWin: Window, payload: FloatingPipSubtitlePayload): void {
    const doc = pipWin.document;
    doc.title = 'SHAPI FLOW — Phụ đề nổi';
    doc.body.innerHTML = `
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Noto Sans KR', 'Noto Sans JP', 'Noto Sans SC', sans-serif; }
        body {
          background: #0B1120;
          color: #F8FAFC;
          height: 100vh;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 12px 14px;
          overflow: hidden;
          user-select: none;
        }
        .topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .status {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          font-weight: 700;
          color: #94A3B8;
          background: rgba(255,255,255,0.06);
          padding: 4px 10px;
          border-radius: 999px;
        }
        .dot {
          width: 7px;
          height: 7px;
          border-radius: 999px;
          background: #10B981;
        }
        .dot.idle { background: #64748B; }
        .actions { display: inline-flex; gap: 5px; }
        button {
          background: rgba(255,255,255,0.1);
          color: #F8FAFC;
          border: 1px solid rgba(255,255,255,0.14);
          border-radius: 8px;
          padding: 4px 9px;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
        }
        button:hover { background: rgba(255,255,255,0.18); }
        .sub-box {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          text-align: center;
          gap: 5px;
          padding: 6px 8px;
        }
        .src {
          font-size: 13px;
          color: #CBD5E1;
          opacity: 0.88;
          line-height: 1.35;
        }
        .vi {
          font-size: 19px;
          font-weight: 700;
          color: #FFFFFF;
          line-height: 1.35;
          text-shadow: 0 2px 8px rgba(0,0,0,0.65);
        }
        .vi.partial {
          font-style: italic;
          opacity: 0.86;
        }
      </style>
      <div class="topbar">
        <div class="status">
          <span id="lf-dot" class="dot"></span>
          <span id="lf-status">SHAPI FLOW</span>
        </div>
        <div class="actions">
          <button id="btn-font-down" title="Giảm cỡ chữ">A-</button>
          <button id="btn-font-up" title="Tăng cỡ chữ">A+</button>
          <button id="btn-pause">Tạm dừng / Tiếp</button>
        </div>
      </div>
      <div class="sub-box">
        <div id="lf-src" class="src"></div>
        <div id="lf-vi" class="vi"></div>
      </div>
    `;

    doc.getElementById('btn-font-down')?.addEventListener('click', () => {
      this.onActionListener?.('font-down');
    });
    doc.getElementById('btn-font-up')?.addEventListener('click', () => {
      this.onActionListener?.('font-up');
    });
    doc.getElementById('btn-pause')?.addEventListener('click', () => {
      this.onActionListener?.('toggle-pause');
    });

    this.renderDocPipContent(pipWin, payload);
  }

  private renderDocPipContent(pipWin: Window, payload: FloatingPipSubtitlePayload): void {
    const doc = pipWin.document;
    const dot = doc.getElementById('lf-dot');
    const st = doc.getElementById('lf-status');
    const srcEl = doc.getElementById('lf-src');
    const viEl = doc.getElementById('lf-vi');

    if (dot) {
      dot.className = payload.isRunning ? 'dot' : 'dot idle';
    }
    if (st) {
      st.textContent = payload.statusLabel;
    }
    if (srcEl) {
      const showSrc = payload.preset.subtitleMode === 'bilingual';
      srcEl.textContent = showSrc ? payload.sourceText : '';
      srcEl.style.color = payload.preset.sourceTextColor || '#CBD5E1';
    }
    if (viEl) {
      viEl.textContent =
        payload.translatedText ||
        'Đang chờ âm thanh từ tab YouTube / Web video để hiển thị phụ đề tiếng Việt…';
      viEl.className = payload.isPartial ? 'vi partial' : 'vi';
      viEl.style.color = payload.preset.textColor || '#FFFFFF';
      viEl.style.fontSize = `${Math.max(15, Math.min(28, payload.preset.fontSize))}px`;
    }
  }

  private drawCanvasSubtitle(payload: FloatingPipSubtitlePayload): void {
    const canvas = this.canvasEl;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#0B1120';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Status pill
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.roundRect(24, 18, 320, 34, 17);
    ctx.fill();

    ctx.fillStyle = payload.isRunning ? '#10B981' : '#64748B';
    ctx.beginPath();
    ctx.arc(44, 35, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#CBD5E1';
    ctx.font = 'bold 17px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`SHAPI FLOW · ${payload.statusLabel}`, 60, 41);

    const centerX = canvas.width / 2;
    ctx.textAlign = 'center';

    let y = 115;
    const showSrc = payload.preset.subtitleMode === 'bilingual';
    if (showSrc && payload.sourceText) {
      ctx.fillStyle = payload.preset.sourceTextColor || '#CBD5E1';
      ctx.font = '500 22px sans-serif';
      const srcLines = wrapCanvasLines(ctx, payload.sourceText, canvas.width - 72, 1);
      for (const l of srcLines) {
        ctx.fillText(l, centerX, y);
        y += 34;
      }
      y += 8;
    } else {
      y = 140;
    }

    const mainTxt =
      payload.translatedText || 'Đang lắng nghe âm thanh từ YouTube / Web Video…';
    ctx.fillStyle = payload.preset.textColor || '#FFFFFF';
    ctx.font = `${payload.isPartial ? 'italic ' : ''}bold 31px sans-serif`;
    const mainLines = wrapCanvasLines(ctx, mainTxt, canvas.width - 72, 3);
    for (const line of mainLines) {
      ctx.fillText(line, centerX, y);
      y += 42;
    }
  }
}

export const subtitlePipManager = new SubtitlePipManager();
