import { Capacitor, registerPlugin } from '@capacitor/core';
import type { PlatformCapabilities } from '../../types/domain';

export interface LinguaFlowNativePlugin {
  checkCapabilities(): Promise<{
    os: string;
    hasMicrophonePermission: boolean;
    hasOverlayPermission: boolean;
    supportsPlaybackCapture: boolean;
    supportsFloatingOverlay: boolean;
    supportsPictureInPicture?: boolean;
  }>;
  requestOverlayPermission?(): Promise<{ granted: boolean; openedSettings?: boolean }>;
  startFloatingOverlay?(opts: { fontSize: number; backgroundOpacity: number }): Promise<{ started: boolean }>;
  updateFloatingSubtitle?(opts: {
    translatedText: string;
    sourceText?: string;
    isInterim?: boolean;
  }): Promise<{ updated: boolean }>;
  stopFloatingOverlay?(): Promise<{ stopped: boolean }>;
  requestPlaybackCapture?(): Promise<{
    capturing: boolean;
    fallbackSuggested?: string;
    reasonVi?: string;
  }>;
}

export const LinguaFlowNative = registerPlugin<LinguaFlowNativePlugin>('LinguaFlowNative');

/**
 * Truthfully detects runtime OS & browser/native capabilities (Section 6 & Section 48.3).
 * Never presents unsupported system-level APIs as fake active buttons.
 */
export function detectPlatformCapabilities(): PlatformCapabilities {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      os: 'desktop-web',
      isNativeCapacitor: false,
      supportsMicrophone: false,
      supportsWebSpeechASR: false,
      supportsDisplayAudioCapture: false,
      supportsAndroidFloatingOverlay: false,
      supportsAndroidPlaybackCapture: false,
      supportsPictureInPicture: false,
      supportsSpeechSynthesis: false,
      limitationsSummaryVi: [],
    };
  }

  const ua = navigator.userAgent || '';
  const isNative = Capacitor.isNativePlatform();
  const nativePlatform = Capacitor.getPlatform(); // 'android' | 'ios' | 'web'

  const isIOS =
    nativePlatform === 'ios' ||
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = nativePlatform === 'android' || /Android/i.test(ua);
  const isMobileWeb = !isNative && (isIOS || isAndroid);

  const os: PlatformCapabilities['os'] = isNative
    ? isAndroid
      ? 'android'
      : 'ios'
    : isMobileWeb
    ? 'mobile-web'
    : 'desktop-web';

  const supportsMicrophone = Boolean(navigator.mediaDevices?.getUserMedia);
  const supportsWebSpeechASR = Boolean(
    'SpeechRecognition' in window || 'webkitSpeechRecognition' in window
  );
  const supportsDisplayAudioCapture = Boolean(
    !isIOS && !isAndroid && navigator.mediaDevices && 'getDisplayMedia' in navigator.mediaDevices
  );
  const supportsPictureInPicture = Boolean(
    typeof document !== 'undefined' && 'pictureInPictureEnabled' in document && document.pictureInPictureEnabled
  );
  const supportsSpeechSynthesis = Boolean('speechSynthesis' in window);

  const limitationsSummaryVi: string[] = [];

  if (isIOS) {
    limitationsSummaryVi.push(
      'iOS không cho phép vẽ cửa sổ phụ đề nổi đè lên ứng dụng bên thứ ba hoặc tự thu âm thanh nội bộ từ mọi ứng dụng khác.'
    );
    limitationsSummaryVi.push(
      'Phương án khả dụng trên iPhone/iPad: Dịch trong Trình phát tích hợp (hỗ trợ PiP), nhập tệp qua Share Sheet hoặc chế độ Nghe bằng Micro.'
    );
  } else if (isAndroid && !isNative) {
    limitationsSummaryVi.push(
      'Đang chạy bản Mobile Web trên Android: hỗ trợ Micro trực tiếp, Trình phát Video và nhập/xuất phụ đề. Tính năng Phụ đề nổi toàn hệ thống yêu cầu bản cài đặt APK Native.'
    );
  } else if (isAndroid && isNative) {
    limitationsSummaryVi.push(
      'Android AudioPlaybackCapture chỉ thu âm được từ ứng dụng cho phép chia sẻ âm thanh (không áp dụng cho nội dung khóa DRM).'
    );
  } else {
    limitationsSummaryVi.push(
      'Trình duyệt hỗ trợ thu âm Micro trực tiếp, chia sẻ âm thanh Tab (getDisplayMedia), Trình phát Video PiP và nhập/xuất SRT/VTT/ASS.'
    );
  }

  if (!supportsWebSpeechASR) {
    limitationsSummaryVi.push(
      'Trình duyệt hiện tại không tích sẵn Web Speech API: hãy dùng Chrome/Edge/Safari để nhận diện Micro trực tiếp, hoặc chạy với tệp phụ đề / luồng kiểm thử tích hợp.'
    );
  }

  return {
    os,
    isNativeCapacitor: isNative,
    supportsMicrophone,
    supportsWebSpeechASR,
    supportsDisplayAudioCapture,
    supportsAndroidFloatingOverlay: isNative && isAndroid,
    supportsAndroidPlaybackCapture: isNative && isAndroid,
    supportsPictureInPicture,
    supportsSpeechSynthesis,
    limitationsSummaryVi,
  };
}

/**
 * Light, purposeful haptic feedback (Section 38.3):
 * Never vibrates on every subtitle update — only on intentional user actions.
 */
export function triggerSubtleHaptic(enabled: boolean, durationMs = 10): void {
  if (!enabled || typeof navigator === 'undefined') return;
  try {
    if ('vibrate' in navigator) {
      navigator.vibrate(durationMs);
    }
  } catch {
    // Ignore on unsupported browsers
  }
}

export function prefersSystemReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
