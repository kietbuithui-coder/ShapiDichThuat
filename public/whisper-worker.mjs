// LINGUA FLOW — Browser Multilingual Whisper Speech-to-Text Worker (WASM / WebGPU)
// Recognizes Korean, Japanese, and Chinese speech directly from 16kHz Float32Array PCM
// captured from YouTube Tabs (getDisplayMedia), HTML5/HLS <video> elements, or Microphone.

let transcriberPromise = null;

const HALLUCINATION_PATTERNS = [
  /^\[.*\]$/,
  /^\(.*\)$/,
  /^♪+$/,
  /^thank you\.?$/i,
  /^thanks for watching\.?$/i,
  /^subtitles by/i,
  /^ご視聴ありがとうございました。?$/,
  /^チャンネル登録/,
  /^시청해 주셔서 감사합니다\.?$/,
  /^字幕由/,
];

function isHallucination(text) {
  const t = (text || '').trim();
  if (!t || t.length < 2) return true;
  for (const pat of HALLUCINATION_PATTERNS) {
    if (pat.test(t)) return true;
  }
  return false;
}

async function getTranscriber() {
  if (transcriberPromise) return transcriberPromise;

  transcriberPromise = (async () => {
    self.postMessage({
      type: 'status',
      message: 'Đang khởi tạo mô hình nhận diện giọng nói AI đa ngữ (lần đầu ~10-20 giây, tự lưu bộ nhớ đệm)…',
    });

    let transformersMod;
    try {
      transformersMod = await import(
        'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.4.0/+esm'
      );
    } catch {
      transformersMod = await import('https://esm.sh/@xenova/transformers@2.17.2');
    }

    const { pipeline, env } = transformersMod;
    if (env) {
      env.allowLocalModels = false;
      env.useBrowserCache = true;
    }

    let lastPct = -1;
    const asr = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', {
      quantized: true,
      progress_callback: (prog) => {
        if (prog && typeof prog.progress === 'number') {
          const pct = Math.round(prog.progress);
          if (pct !== lastPct && pct % 10 === 0) {
            lastPct = pct;
            self.postMessage({
              type: 'progress',
              percent: pct,
              message: `Đang tải mô hình AI nhận diện âm thanh Video/Tab (${pct}%)…`,
            });
          }
        }
      },
    });

    self.postMessage({
      type: 'ready',
      message: 'Mô hình AI nhận diện âm thanh trực tiếp đã sẵn sàng!',
    });

    return asr;
  })();

  return transcriberPromise;
}

function mapLangToWhisper(langCode) {
  if (langCode === 'ko') return 'korean';
  if (langCode === 'ja') return 'japanese';
  if (langCode === 'zh-CN' || langCode === 'zh-TW') return 'chinese';
  return undefined; // 'auto' -> Whisper multilingual auto-detection
}

self.addEventListener('message', async (event) => {
  const data = event.data;
  if (!data) return;

  if (data.type === 'preload') {
    try {
      await getTranscriber();
    } catch (err) {
      self.postMessage({
        type: 'error',
        message: err instanceof Error ? err.message : 'Không thể tải mô hình Whisper trên trình duyệt.',
      });
    }
    return;
  }

  if (data.type === 'transcribe') {
    const { audioFloat32, sourceLanguage, startMs, endMs, chunkId } = data;
    if (!audioFloat32 || audioFloat32.length < 3200) return;

    try {
      const asr = await getTranscriber();
      const whisperLang = mapLangToWhisper(sourceLanguage);

      const options = {
        task: 'transcribe',
        chunk_length_s: 15,
        stride_length_s: 2,
      };
      if (whisperLang) {
        options.language = whisperLang;
      }

      const output = await asr(audioFloat32, options);
      const rawText = typeof output?.text === 'string' ? output.text.trim() : '';

      if (rawText && !isHallucination(rawText)) {
        self.postMessage({
          type: 'transcript',
          chunkId,
          text: rawText,
          startMs,
          endMs,
        });
      }
    } catch (err) {
      self.postMessage({
        type: 'error',
        message: err instanceof Error ? err.message : 'Lỗi nhận diện đoạn âm thanh.',
      });
    }
  }
});
