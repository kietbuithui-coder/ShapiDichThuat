import React, { useState } from 'react';
import { ArrowRight, Check, Smartphone, Sparkles, Type } from 'lucide-react';
import { useLinguaFlow } from '../../context/LinguaFlowContext';
import { BrandLogo } from '../ui/BrandLogo';

/**
 * 3-Screen Concise Onboarding (Section 35):
 * - Screen 1: Core value ("Hiểu nội dung Hàn, Nhật, Trung ngay khi đang xem.")
 * - Screen 2: Live interactive subtitle customization preview
 * - Screen 3: Automatic OS capability summary — zero upfront permission popups, zero forced registration
 */
export const OnboardingModal: React.FC = () => {
  const {
    settings,
    updateSettings,
    activePreset,
    updateActivePresetLive,
    capabilities,
  } = useLinguaFlow();

  const [step, setStep] = useState<0 | 1 | 2>(0);

  if (settings.onboardingCompleted) return null;

  const finish = () => {
    updateSettings({ onboardingCompleted: true });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/55 backdrop-blur-xs">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Giới thiệu SHAPI FLOW"
        className="w-full max-w-md rounded-3xl lf-surface p-6 shadow-2xl space-y-5"
      >
        <div className="flex items-center justify-between">
          <BrandLogo size={32} />
          <button
            type="button"
            onClick={finish}
            className="text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-2 py-1 cursor-pointer"
          >
            Bỏ qua
          </button>
        </div>

        {step === 0 && (
          <div className="space-y-4 py-1">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--accent-primary-soft)] text-[var(--accent-primary)] text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Dịch trực tiếp Hàn · Nhật · Trung → Việt</span>
            </div>
            <h2 className="text-xl font-extrabold tracking-tight text-[var(--text-primary)] leading-snug">
              Hiểu nội dung Hàn, Nhật, Trung ngay khi đang xem.
            </h2>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              Xem livestream, video hoặc nghe hội thoại trực tiếp với phụ đề tiếng Việt tự nhiên, giữ ngữ cảnh và không cần chụp màn hình từng câu.
            </p>
            <div className="grid grid-cols-3 gap-2 pt-1">
              {[
                { badge: '한', title: 'Tiếng Hàn', sub: 'Kính ngữ & Idol' },
                { badge: 'あ', title: 'Tiếng Nhật', sub: 'Hội thoại & Anime' },
                { badge: '简/繁', title: 'Tiếng Trung', sub: 'Giản & Phồn thể' },
              ].map((item) => (
                <div key={item.title} className="rounded-2xl lf-elevated p-3 text-center space-y-1">
                  <div className="text-sm font-bold text-[var(--accent-primary)]">{item.badge}</div>
                  <div className="text-xs font-bold text-[var(--text-primary)]">{item.title}</div>
                  <div className="text-[10px] text-[var(--text-secondary)]">{item.sub}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4 py-1">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--accent-primary-soft)] text-[var(--accent-primary)] text-xs font-semibold">
              <Type className="w-3.5 h-3.5" />
              <span>Tùy chỉnh phụ đề tức thì</span>
            </div>
            <h2 className="text-lg font-extrabold text-[var(--text-primary)]">
              Phụ đề đẹp theo đúng mắt đọc của bạn
            </h2>

            {/* Live interactive preview box */}
            <div className="relative h-36 rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-950 to-teal-950 flex items-end justify-center p-4 overflow-hidden">
              <div
                style={{
                  fontSize: `${activePreset.fontSize}px`,
                  borderRadius: `${activePreset.cornerRadius}px`,
                }}
                className="px-4 py-2 bg-slate-950/80 text-white text-center shadow-lg border border-white/10 transition-all"
              >
                {activePreset.subtitleMode === 'bilingual' && (
                  <div className="text-xs text-sky-200 mb-0.5">
                    여러분 안녕하세요! 오늘 방송 시작할게요.
                  </div>
                )}
                <div className="font-semibold leading-snug">
                  Chào mọi người! Mình bắt đầu buổi phát sóng nhé.
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    updateActivePresetLive({ fontSize: Math.max(15, activePreset.fontSize - 2) })
                  }
                  className="min-h-[40px] px-3 rounded-xl lf-elevated text-xs font-bold cursor-pointer"
                >
                  A-
                </button>
                <button
                  type="button"
                  onClick={() =>
                    updateActivePresetLive({ fontSize: Math.min(28, activePreset.fontSize + 2) })
                  }
                  className="min-h-[40px] px-3 rounded-xl lf-elevated text-xs font-bold cursor-pointer"
                >
                  A+ ({activePreset.fontSize}px)
                </button>
              </div>
              <button
                type="button"
                onClick={() =>
                  updateActivePresetLive({
                    subtitleMode:
                      activePreset.subtitleMode === 'bilingual' ? 'vi-only' : 'bilingual',
                  })
                }
                className={`min-h-[40px] px-3.5 rounded-xl text-xs font-semibold cursor-pointer ${
                  activePreset.subtitleMode === 'bilingual'
                    ? 'bg-[var(--accent-primary)] text-white'
                    : 'lf-elevated text-[var(--text-primary)]'
                }`}
              >
                {activePreset.subtitleMode === 'bilingual' ? 'Đang bật Song ngữ' : 'Thử Song ngữ'}
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 py-1">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--accent-primary-soft)] text-[var(--accent-primary)] text-xs font-semibold">
              <Smartphone className="w-3.5 h-3.5" />
              <span>Tự động tối ưu theo thiết bị</span>
            </div>
            <h2 className="text-lg font-extrabold text-[var(--text-primary)]">
              Sẵn sàng bắt đầu ngay — không cần đăng ký
            </h2>
            <div className="rounded-2xl lf-elevated p-3.5 space-y-2 text-xs text-[var(--text-secondary)]">
              <div className="font-semibold text-[var(--text-primary)]">
                Nền tảng nhận diện:{' '}
                {capabilities.os === 'android'
                  ? 'Android Native'
                  : capabilities.os === 'ios'
                  ? 'iOS Native'
                  : capabilities.os === 'mobile-web'
                  ? 'Trình duyệt Di động'
                  : 'Trình duyệt Web'}
              </div>
              <p className="leading-relaxed">
                SHAPI FLOW chỉ xin quyền Micro hoặc Chia sẻ âm thanh đúng lúc bạn bật tính năng đó — không tự ý lưu bản ghi âm cuộc trò chuyện.
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-1.5">
            {[0, 1, 2].map((idx) => (
              <span
                key={idx}
                className={`h-1.5 rounded-full transition-all ${
                  step === idx
                    ? 'w-6 bg-[var(--accent-primary)]'
                    : 'w-2 bg-[var(--border-strong)]'
                }`}
              />
            ))}
          </div>

          {step < 2 ? (
            <button
              type="button"
              onClick={() => setStep((s) => (s + 1) as 0 | 1 | 2)}
              className="min-h-[44px] px-5 rounded-2xl bg-[var(--accent-primary)] text-white text-sm font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <span>Tiếp theo</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={finish}
              className="min-h-[44px] px-5 rounded-2xl lf-brand-gradient text-white text-sm font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Bắt đầu dịch ngay</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
