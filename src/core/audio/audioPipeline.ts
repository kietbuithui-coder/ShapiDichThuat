import type {
  AudioSourceType,
  SourceLanguageCode,
} from '../../types/domain';
import { LANGUAGE_REGISTRY } from '../languages/languageRegistry';
import { BUILTIN_QA_STREAMS, type QATestStreamDefinition } from '../media/sampleMedia';

export interface AudioPipelineCallbacks {
  onStatusChange: (
    status: 'connecting' | 'listening' | 'recognizing' | 'paused' | 'source_lost' | 'completed'
  ) => void;
  onWaveformUpdate: (rms: number, bands: number[]) => void;
  onInterimTranscript: (text: string, speakerId?: string) => void;
  onFinalTranscript: (
    text: string,
    startMs: number,
    endMs: number,
    speakerId?: string
  ) => void;
  onWarning: (messageVi: string | null) => void;
  onError: (messageVi: string, suggestedFallback?: AudioSourceType) => void;
}

interface WebSpeechRecognitionEvent {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [altIndex: number]: { transcript: string; confidence: number };
    };
  };
}

interface WebSpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(audioTrack?: MediaStreamTrack): void;
  stop(): void;
  abort(): void;
  onresult: ((ev: WebSpeechRecognitionEvent) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
}

let sharedWhisperWorker: Worker | null = null;

function getOrCreateWhisperWorker(): Worker | null {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') return null;
  if (!sharedWhisperWorker) {
    try {
      sharedWhisperWorker = new Worker('/whisper-worker.mjs', { type: 'module' });
    } catch {
      return null;
    }
  }
  return sharedWhisperWorker;
}

function downsampleTo16kHz(buffer: Float32Array, inputSampleRate: number): Float32Array {
  if (inputSampleRate === 16000) return buffer;
  const ratio = inputSampleRate / 16000;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}

/**
 * Real-Time Audio Capture, VAD, Waveform & Dual Speech Recognition Engine
 * Supports:
 * 1. Tab / YouTube / Web Video Digital Audio ('display-audio') via getDisplayMedia + Whisper AI Worker + MediaStreamTrack SpeechRecognition
 * 2. Direct HTML5 / HLS Video Element Stream ('video-element') via captureStream() + Whisper AI Worker
 * 3. Direct Hardware Microphone ('microphone') via Web Speech API + Whisper AI Worker fallback
 * 4. Built-in QA Multilingual Stream ('qa-test-stream')
 */
export class LiveAudioPipeline {
  private mediaStream: MediaStream | null = null;
  private ownsMediaStream = true;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private pcmNode: ScriptProcessorNode | null = null;
  private silentSink: GainNode | null = null;
  private workerListener: ((ev: MessageEvent) => void) | null = null;
  private rafId: number | null = null;
  private recognition: WebSpeechRecognitionInstance | null = null;
  private recognitionAudioTrack: MediaStreamTrack | undefined = undefined;
  private currentSourceLang: SourceLanguageCode = 'auto';
  private qaTimer: ReturnType<typeof setInterval> | null = null;
  private sessionStartMs = 0;
  private paused = false;
  private active = false;
  private lowVolumeTicks = 0;
  private zeroSignalTicks = 0;
  private lastEmittedQaStep = '';

  async start(opts: {
    audioSource: AudioSourceType;
    sourceLanguage: SourceLanguageCode;
    noiseSuppression: boolean;
    autoGainControl: boolean;
    micSensitivity: number;
    qaStreamId?: string;
    simulateLowVolume?: boolean;
    preferCurrentTab?: boolean;
    externalMediaStream?: MediaStream;
    callbacks: AudioPipelineCallbacks;
  }): Promise<void> {
    this.stop(); // Release any previous resources cleanly
    this.active = true;
    this.paused = false;
    this.currentSourceLang = opts.sourceLanguage;
    this.sessionStartMs = Date.now();
    this.lowVolumeTicks = 0;
    this.zeroSignalTicks = 0;
    this.lastEmittedQaStep = '';

    const { callbacks, audioSource } = opts;
    callbacks.onStatusChange('connecting');
    callbacks.onWarning(null);

    if (audioSource === 'qa-test-stream') {
      const qaStream =
        BUILTIN_QA_STREAMS.find((s) => s.id === opts.qaStreamId) ??
        this.pickQaStreamForLang(opts.sourceLanguage);
      this.startQaStreamLoop(qaStream, Boolean(opts.simulateLowVolume), callbacks);
      return;
    }

    // Direct HTML5 / HLS <video> element audio stream (zero screen-share popup!)
    if (audioSource === 'video-element' && opts.externalMediaStream) {
      const tracks = opts.externalMediaStream.getAudioTracks();
      if (tracks.length === 0) {
        callbacks.onError(
          'Video này không có luồng âm thanh hoặc máy chủ nguồn chặn quyền đọc âm thanh trực tiếp (CORS). Hãy nhấn "Bắt tiếng Tab" hoặc "Nghe qua Micro".',
          'display-audio'
        );
        this.stop();
        return;
      }

      this.mediaStream = opts.externalMediaStream;
      this.ownsMediaStream = false;
      await this.attachAudioAnalyser(opts.externalMediaStream, opts.micSensitivity, callbacks);
      const trackSupported = this.tryStartTrackSpeechRecognition(
        tracks[0],
        opts.sourceLanguage,
        callbacks
      );
      if (!trackSupported) {
        this.attachWhisperPcmTranscriber(callbacks);
      }
      callbacks.onStatusChange('listening');
      return;
    }

    // Tab / YouTube / Web Video Audio Capture ('display-audio')
    if (audioSource === 'display-audio') {
      try {
        if (!navigator.mediaDevices || !('getDisplayMedia' in navigator.mediaDevices)) {
          callbacks.onError(
            'Trình duyệt trên thiết bị này không hỗ trợ bắt âm thanh tab trực tiếp. Bạn có thể chuyển sang "Nghe qua Micro" để dịch âm thanh phát ra từ video.',
            'microphone'
          );
          this.stop();
          return;
        }

        // Modern Chrome/Edge options to make selecting the current YouTube/Web tab effortless
        const displayConstraints: DisplayMediaStreamOptions & Record<string, unknown> = {
          video: true,
          audio: {
            noiseSuppression: opts.noiseSuppression,
            autoGainControl: opts.autoGainControl,
            echoCancellation: false,
          },
          systemAudio: 'include',
          selfBrowserSurface: 'include',
        };
        if (opts.preferCurrentTab) {
          displayConstraints.preferCurrentTab = true;
        }

        const stream = await navigator.mediaDevices.getDisplayMedia(displayConstraints);

        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length === 0) {
          stream.getTracks().forEach((t) => t.stop());
          callbacks.onError(
            'Bạn chưa tích chọn "Chia sẻ âm thanh của tab" (Share tab audio) ở góc dưới hộp thoại. Hãy thử lại và bật công tắc chia sẻ âm thanh, hoặc dùng Micro.',
            'microphone'
          );
          this.stop();
          return;
        }

        // Stop unneeded video track notifications while keeping audio track alive if browser allows,
        // and monitor audio track ending
        audioTracks[0].onended = () => {
          if (this.active) {
            callbacks.onStatusChange('source_lost');
            callbacks.onError(
              'Đã dừng chia sẻ âm thanh tab video. Bạn có thể bấm bắt lại hoặc chuyển sang Micro.',
              'microphone'
            );
          }
        };

        this.mediaStream = stream;
        this.ownsMediaStream = true;
        await this.attachAudioAnalyser(stream, opts.micSensitivity, callbacks);

        // Try Chromium native MediaStreamTrack SpeechRecognition first; otherwise attach Whisper AI PCM Worker!
        const nativeTrackAsr = this.tryStartTrackSpeechRecognition(
          audioTracks[0],
          opts.sourceLanguage,
          callbacks
        );
        if (!nativeTrackAsr) {
          this.attachWhisperPcmTranscriber(callbacks);
        }

        callbacks.onStatusChange('listening');
        return;
      } catch {
        callbacks.onError(
          'Đã hủy chọn tab chia sẻ âm thanh. Hãy nhấn lại và chọn tab chứa video YouTube/Web (nhớ bật "Chia sẻ âm thanh tab"), hoặc chuyển sang Micro.',
          'microphone'
        );
        this.stop();
        return;
      }
    }

    // Default: Direct Microphone Capture ('microphone')
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        callbacks.onError(
          'Trình duyệt không cho phép truy cập Micro trên kết nối này. Bạn có thể dùng chế độ Luồng kiểm thử QA.',
          'qa-test-stream'
        );
        this.stop();
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: opts.noiseSuppression,
          autoGainControl: opts.autoGainControl,
        },
        video: false,
      });

      stream.getAudioTracks().forEach((track) => {
        track.onended = () => {
          if (this.active) {
            callbacks.onStatusChange('source_lost');
            callbacks.onError('Micro đã ngắt kết nối hoặc quyền thu âm vừa bị thu hồi.');
          }
        };
      });

      this.mediaStream = stream;
      this.ownsMediaStream = true;
      await this.attachAudioAnalyser(stream, opts.micSensitivity, callbacks);
      const startedWebSpeech = this.startBrowserSpeechRecognition(opts.sourceLanguage, callbacks);
      if (!startedWebSpeech) {
        // Browser lacks WebSpeechAPI (e.g., Firefox / WebView) -> seamlessly activate Whisper AI Worker!
        this.attachWhisperPcmTranscriber(callbacks);
      }
      callbacks.onStatusChange('listening');
    } catch {
      callbacks.onError(
        'Chưa được cấp quyền Micro. Hãy cho phép quyền Micro trên trình duyệt/điện thoại hoặc thử Luồng kiểm thử QA / Nhập tệp phụ đề.',
        'qa-test-stream'
      );
      this.stop();
    }
  }

  private pickQaStreamForLang(lang: SourceLanguageCode): QATestStreamDefinition {
    if (lang === 'ja') return BUILTIN_QA_STREAMS[1];
    if (lang === 'zh-CN' || lang === 'zh-TW') return BUILTIN_QA_STREAMS[2];
    return BUILTIN_QA_STREAMS[0];
  }

  private async attachAudioAnalyser(
    stream: MediaStream,
    sensitivity: number,
    callbacks: AudioPipelineCallbacks
  ): Promise<void> {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      await ctx.resume().catch(() => {});
    }
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    analyser.smoothingTimeConstant = 0.75;
    source.connect(analyser);

    this.audioCtx = ctx;
    this.analyser = analyser;

    const freqData = new Uint8Array(analyser.frequencyBinCount);
    const timeData = new Uint8Array(analyser.fftSize);
    let lastSampleAt = 0;

    const loop = (now: number) => {
      if (!this.active || !this.analyser) return;
      if (this.paused) {
        callbacks.onWaveformUpdate(0, new Array(12).fill(0));
        this.rafId = requestAnimationFrame(loop);
        return;
      }

      if (now - lastSampleAt >= 50) {
        lastSampleAt = now;
        this.analyser.getByteTimeDomainData(timeData);
        this.analyser.getByteFrequencyData(freqData);

        let sumSq = 0;
        for (let i = 0; i < timeData.length; i++) {
          const norm = (timeData[i] - 128) / 128;
          sumSq += norm * norm;
        }
        const rawRms = Math.sqrt(sumSq / timeData.length);
        const scaledRms = Math.min(1, rawRms * (1.8 + sensitivity * 2.2));

        const bands: number[] = [];
        const step = Math.max(1, Math.floor(freqData.length / 12));
        for (let b = 0; b < 12; b++) {
          bands.push(Math.min(1, (freqData[b * step] ?? 0) / 220));
        }

        callbacks.onWaveformUpdate(scaledRms, bands);

        if (scaledRms < 0.015) {
          this.zeroSignalTicks++;
          if (this.zeroSignalTicks === 160) {
            callbacks.onWarning(
              'Chưa nhận được tín hiệu âm thanh rõ ràng. Hãy kiểm tra xem video đang bật tiếng chưa.'
            );
          }
        } else if (scaledRms < 0.05) {
          this.zeroSignalTicks = 0;
          this.lowVolumeTicks++;
          if (this.lowVolumeTicks === 90) {
            callbacks.onWarning('Âm lượng nguồn phát hơi nhỏ — hãy tăng âm lượng video để dịch chuẩn hơn.');
          }
        } else {
          this.zeroSignalTicks = 0;
          this.lowVolumeTicks = 0;
        }
      }

      this.rafId = requestAnimationFrame(loop);
    };

    this.rafId = requestAnimationFrame(loop);
  }

  /**
   * Attaches 16kHz PCM Voice Activity Detection + Browser Whisper Multilingual Worker
   * so Tab Audio (YouTube / Bilibili / Twitch / Web) and <video> elements transcribe directly!
   */
  private attachWhisperPcmTranscriber(callbacks: AudioPipelineCallbacks): void {
    if (!this.audioCtx || !this.mediaStream) return;

    const worker = getOrCreateWhisperWorker();
    if (!worker) {
      callbacks.onWarning(
        'Trình duyệt chặn Web Worker nhận diện âm thanh — hãy thử mở trên Chrome/Edge/Safari.'
      );
      return;
    }

    worker.postMessage({ type: 'preload' });

    const onWorkerMsg = (ev: MessageEvent) => {
      if (!this.active || this.paused) return;
      const msg = ev.data;
      if (!msg) return;

      if (msg.type === 'status' || msg.type === 'progress') {
        callbacks.onWarning(msg.message);
      } else if (msg.type === 'ready') {
        callbacks.onWarning(null);
      } else if (msg.type === 'transcript' && msg.text) {
        callbacks.onWarning(null);
        callbacks.onFinalTranscript(msg.text, msg.startMs, msg.endMs, 'speaker-1');
      } else if (msg.type === 'error' && msg.message) {
        callbacks.onWarning(`AI nhận diện âm thanh: ${msg.message}`);
      }
    };

    worker.addEventListener('message', onWorkerMsg);
    this.workerListener = onWorkerMsg;

    const sampleRate = this.audioCtx.sampleRate;
    const sourceNode = this.audioCtx.createMediaStreamSource(this.mediaStream);
    const processor = this.audioCtx.createScriptProcessor(4096, 1, 1);
    const silentGain = this.audioCtx.createGain();
    silentGain.gain.value = 0;

    sourceNode.connect(processor);
    processor.connect(silentGain);
    silentGain.connect(this.audioCtx.destination);

    this.pcmNode = processor;
    this.silentSink = silentGain;

    let speechChunks: Float32Array[] = [];
    let preRollChunk: Float32Array | null = null;
    let totalSamples16k = 0;
    let speaking = false;
    let silenceFrames = 0;
    let speechStartRelMs = 0;
    let chunkSeq = 0;

    processor.onaudioprocess = (audioEvent) => {
      if (!this.active || this.paused) return;
      const input = audioEvent.inputBuffer.getChannelData(0);
      let sum = 0;
      for (let i = 0; i < input.length; i++) {
        sum += input[i] * input[i];
      }
      const rms = Math.sqrt(sum / input.length);
      const pcm16k = downsampleTo16kHz(input, sampleRate);

      const isVoice = rms > 0.012;

      if (isVoice) {
        if (!speaking) {
          speaking = true;
          silenceFrames = 0;
          speechStartRelMs = Math.max(0, Date.now() - this.sessionStartMs - 200);
          if (preRollChunk) {
            speechChunks.push(preRollChunk);
            totalSamples16k += preRollChunk.length;
          }
          callbacks.onStatusChange('recognizing');
          callbacks.onInterimTranscript('Đang nghe & tách lời thoại từ video…', 'speaker-1');
        } else {
          silenceFrames = 0;
        }

        speechChunks.push(pcm16k);
        totalSamples16k += pcm16k.length;

        // Flush every ~3.4 seconds during continuous fast speech (livestream / news) so subtitles never lag!
        if (totalSamples16k >= 16000 * 3.4) {
          this.flushWhisperSegment(
            worker,
            speechChunks,
            totalSamples16k,
            speechStartRelMs,
            ++chunkSeq
          );
          // Keep tiny 0.2s tail for smooth word boundary continuity
          const tail = pcm16k.slice(Math.max(0, pcm16k.length - 3200));
          speechChunks = [tail];
          totalSamples16k = tail.length;
          speechStartRelMs = Date.now() - this.sessionStartMs;
        }
      } else {
        preRollChunk = pcm16k;
        if (speaking) {
          speechChunks.push(pcm16k);
          totalSamples16k += pcm16k.length;
          silenceFrames++;

          // ~0.45s pause in speech -> finalize phrase immediately!
          if (silenceFrames >= 5) {
            if (totalSamples16k >= 16000 * 0.65) {
              this.flushWhisperSegment(
                worker,
                speechChunks,
                totalSamples16k,
                speechStartRelMs,
                ++chunkSeq
              );
            }
            speechChunks = [];
            totalSamples16k = 0;
            speaking = false;
            silenceFrames = 0;
          }
        }
      }
    };
  }

  private flushWhisperSegment(
    worker: Worker,
    chunks: Float32Array[],
    totalLength: number,
    startMs: number,
    chunkId: number
  ): void {
    const merged = new Float32Array(totalLength);
    let offset = 0;
    for (const c of chunks) {
      merged.set(c, offset);
      offset += c.length;
    }
    const endMs = Math.max(startMs + 600, Date.now() - this.sessionStartMs);
    worker.postMessage(
      {
        type: 'transcribe',
        chunkId,
        audioFloat32: merged,
        sourceLanguage: this.currentSourceLang,
        startMs,
        endMs,
      },
      [merged.buffer]
    );
  }

  /**
   * Attempts Chromium 129+ `SpeechRecognition.start(mediaStreamTrack)` for tab/video audio.
   * Returns false if the browser's SpeechRecognition only accepts 0 arguments (mic-only),
   * preventing accidental hardware mic capture when the user requested Tab/Video audio.
   */
  private tryStartTrackSpeechRecognition(
    audioTrack: MediaStreamTrack,
    sourceLanguage: SourceLanguageCode,
    callbacks: AudioPipelineCallbacks
  ): boolean {
    const SpeechRecCtor =
      (window as unknown as { SpeechRecognition?: new () => WebSpeechRecognitionInstance })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => WebSpeechRecognitionInstance })
        .webkitSpeechRecognition;

    if (!SpeechRecCtor) return false;
    const rec = new SpeechRecCtor();
    // Only invoke if browser explicitly declares MediaStreamTrack parameter support (length >= 1)
    if (typeof rec.start !== 'function' || rec.start.length < 1) {
      return false;
    }

    try {
      this.recognitionAudioTrack = audioTrack;
      this.wireSpeechRecognitionHandlers(rec, sourceLanguage, callbacks);
      rec.start(audioTrack);
      this.recognition = rec;
      return true;
    } catch {
      this.recognitionAudioTrack = undefined;
      return false;
    }
  }

  private startBrowserSpeechRecognition(
    sourceLanguage: SourceLanguageCode,
    callbacks: AudioPipelineCallbacks
  ): boolean {
    const SpeechRecCtor =
      (window as unknown as { SpeechRecognition?: new () => WebSpeechRecognitionInstance })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => WebSpeechRecognitionInstance })
        .webkitSpeechRecognition;

    if (!SpeechRecCtor) {
      return false;
    }

    const rec = new SpeechRecCtor();
    this.recognitionAudioTrack = undefined;
    this.wireSpeechRecognitionHandlers(rec, sourceLanguage, callbacks);
    this.recognition = rec;
    try {
      rec.start();
      return true;
    } catch {
      this.recognition = null;
      return false;
    }
  }

  private wireSpeechRecognitionHandlers(
    rec: WebSpeechRecognitionInstance,
    sourceLanguage: SourceLanguageCode,
    callbacks: AudioPipelineCallbacks
  ): void {
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = LANGUAGE_REGISTRY[sourceLanguage]?.bcp47 ?? 'ko-KR';

    let utteranceStartMs = Date.now() - this.sessionStartMs;

    rec.onresult = (event: WebSpeechRecognitionEvent) => {
      if (!this.active || this.paused) return;
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const transcript = res[0]?.transcript?.trim() ?? '';
        if (!transcript) continue;

        if (res.isFinal) {
          const nowRel = Date.now() - this.sessionStartMs;
          callbacks.onFinalTranscript(
            transcript,
            Math.max(0, utteranceStartMs),
            Math.max(utteranceStartMs + 800, nowRel),
            'speaker-1'
          );
          utteranceStartMs = nowRel + 100;
        } else {
          interim += (interim ? ' ' : '') + transcript;
        }
      }

      if (interim) {
        callbacks.onStatusChange('recognizing');
        callbacks.onInterimTranscript(interim, 'speaker-1');
      }
    };

    rec.onerror = (ev) => {
      if (!this.active) return;
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
        callbacks.onError('Quyền nhận diện giọng nói đã bị từ chối.');
      } else if (ev.error === 'network') {
        callbacks.onWarning('Kết nối dịch vụ nhận diện giọng nói của trình duyệt không ổn định.');
      }
    };

    rec.onend = () => {
      if (this.active && !this.paused && this.recognition === rec) {
        try {
          if (this.recognitionAudioTrack) {
            rec.start(this.recognitionAudioTrack);
          } else {
            rec.start();
          }
        } catch {
          // Ignore rapid restart race
        }
      }
    };
  }

  private startQaStreamLoop(
    qaStream: QATestStreamDefinition,
    simulateLowVolume: boolean,
    callbacks: AudioPipelineCallbacks
  ): void {
    callbacks.onStatusChange('listening');
    let elapsedMs = 0;
    const completedIndexes = new Set<number>();

    if (simulateLowVolume) {
      callbacks.onWarning(
        'Phát hiện âm lượng nguồn phát nhỏ (Chế độ kiểm thử âm thanh nhỏ) — đã kích hoạt khuếch đại tự động (AGC).'
      );
    }

    this.qaTimer = setInterval(() => {
      if (!this.active || this.paused) {
        callbacks.onWaveformUpdate(0, new Array(12).fill(0));
        return;
      }

      elapsedMs += 200;
      const cycleTime = elapsedMs % (qaStream.durationMs + 1500);
      if (cycleTime < 200) {
        completedIndexes.clear();
        this.lastEmittedQaStep = '';
      }

      const activeUttIndex = qaStream.utterances.findIndex(
        (u) => cycleTime >= u.startMs && cycleTime <= u.endMs
      );

      if (activeUttIndex !== -1) {
        const utt = qaStream.utterances[activeUttIndex];
        const progress = (cycleTime - utt.startMs) / Math.max(1, utt.endMs - utt.startMs);

        const baseAmp = simulateLowVolume ? 0.08 : 0.58;
        const syllableWave = Math.abs(Math.sin(elapsedMs * 0.022)) * baseAmp;
        const bands = Array.from({ length: 12 }, (_, idx) =>
          Math.min(1, syllableWave * (1 - Math.abs(idx - 4) * 0.11))
        );
        callbacks.onWaveformUpdate(syllableWave, bands);

        if (progress < 0.72 && utt.interimSteps.length > 0) {
          const stepIdx = Math.min(
            utt.interimSteps.length - 1,
            Math.floor((progress / 0.72) * utt.interimSteps.length)
          );
          const interimTxt = utt.interimSteps[stepIdx];
          const stepKey = `${activeUttIndex}:i:${stepIdx}`;
          if (this.lastEmittedQaStep !== stepKey) {
            this.lastEmittedQaStep = stepKey;
            callbacks.onStatusChange('recognizing');
            callbacks.onInterimTranscript(interimTxt, utt.speakerId);
          }
        } else if (!completedIndexes.has(activeUttIndex)) {
          completedIndexes.add(activeUttIndex);
          this.lastEmittedQaStep = `${activeUttIndex}:final`;
          callbacks.onFinalTranscript(
            utt.finalText,
            elapsedMs - (utt.endMs - utt.startMs),
            elapsedMs,
            utt.speakerId
          );
        }
      } else {
        callbacks.onWaveformUpdate(0.01, new Array(12).fill(0.02));
      }
    }, 200);
  }

  pause(callbacks: AudioPipelineCallbacks): void {
    if (!this.active || this.paused) return;
    this.paused = true;
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        // Ignore
      }
    }
    callbacks.onWaveformUpdate(0, new Array(12).fill(0));
    callbacks.onStatusChange('paused');
  }

  resume(sourceLanguage: SourceLanguageCode, callbacks: AudioPipelineCallbacks): void {
    if (!this.active || !this.paused) return;
    this.paused = false;
    this.currentSourceLang = sourceLanguage;
    if (this.recognition) {
      this.recognition.lang = LANGUAGE_REGISTRY[sourceLanguage]?.bcp47 ?? 'ko-KR';
      try {
        if (this.recognitionAudioTrack) {
          this.recognition.start(this.recognitionAudioTrack);
        } else {
          this.recognition.start();
        }
      } catch {
        // Ignore
      }
    }
    callbacks.onStatusChange('listening');
  }

  updateRecognitionLanguage(sourceLanguage: SourceLanguageCode): void {
    this.currentSourceLang = sourceLanguage;
    if (this.recognition) {
      this.recognition.lang = LANGUAGE_REGISTRY[sourceLanguage]?.bcp47 ?? 'ko-KR';
      if (this.active && !this.paused) {
        try {
          this.recognition.stop();
        } catch {
          // Ignore
        }
      }
    }
  }

  /**
   * Immediately stops all owned tracks, disconnects PCM nodes, closes AudioContext (Rule 14).
   */
  stop(): void {
    this.active = false;
    this.paused = false;

    if (this.qaTimer) {
      clearInterval(this.qaTimer);
      this.qaTimer = null;
    }

    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    if (this.workerListener && sharedWhisperWorker) {
      sharedWhisperWorker.removeEventListener('message', this.workerListener);
      this.workerListener = null;
    }

    if (this.pcmNode) {
      this.pcmNode.onaudioprocess = null;
      try {
        this.pcmNode.disconnect();
      } catch {
        // Ignore
      }
      this.pcmNode = null;
    }

    if (this.silentSink) {
      try {
        this.silentSink.disconnect();
      } catch {
        // Ignore
      }
      this.silentSink = null;
    }

    if (this.recognition) {
      const r = this.recognition;
      this.recognition = null;
      this.recognitionAudioTrack = undefined;
      r.onresult = null;
      r.onend = null;
      r.onerror = null;
      try {
        r.abort();
      } catch {
        // Ignore
      }
    }

    if (this.mediaStream) {
      if (this.ownsMediaStream) {
        this.mediaStream.getTracks().forEach((track) => {
          track.onended = null;
          track.stop();
        });
      }
      this.mediaStream = null;
    }

    if (this.audioCtx) {
      const ctx = this.audioCtx;
      this.audioCtx = null;
      this.analyser = null;
      ctx.close().catch(() => {});
    }
  }

  isActive(): boolean {
    return this.active;
  }

  isPaused(): boolean {
    return this.paused;
  }
}
