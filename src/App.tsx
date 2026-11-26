import React, { useState } from 'react';
import {
  BookMarked,
  Film,
  Home,
  Radio,
  Settings,
  Sliders,
} from 'lucide-react';
import {
  LinguaFlowProvider,
  useLinguaFlow,
  type MainTabId,
} from './context/LinguaFlowContext';
import { HomeView } from './views/HomeView';
import { LiveTranslationView } from './views/LiveTranslationView';
import { VideoPlayerView } from './views/VideoPlayerView';
import { CustomizeStudioView } from './views/CustomizeStudioView';
import { LibraryView } from './views/LibraryView';
import { SettingsView } from './views/SettingsView';
import { OnboardingModal } from './components/modals/OnboardingModal';
import { QuickTranslateModal } from './components/modals/QuickTranslateModal';
import { SubtitleFileModal } from './components/modals/SubtitleFileModal';
import { WordLookupSheet } from './components/modals/WordLookupSheet';
import { FloatingBubbleOverlay } from './components/floating/FloatingBubbleOverlay';
import { ToastViewport } from './components/ui/DesignSystem';

const AppShell: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    liveRunningIndicator,
    toasts,
    haptic,
  } = useLinguaFlow();

  const [requestedLiveMode, setRequestedLiveMode] = useState<'livestream' | 'microphone'>(
    'livestream'
  );

  const navItems: Array<{
    id: MainTabId;
    label: string;
    icon: React.ReactNode;
    badge?: boolean;
  }> = [
    { id: 'home', label: 'Trang chủ', icon: <Home className="w-5 h-5" /> },
    {
      id: 'live',
      label: 'Trực tiếp',
      icon: <Radio className="w-5 h-5" />,
      badge: liveRunningIndicator.isRunning,
    },
    { id: 'video', label: 'Video', icon: <Film className="w-5 h-5" /> },
    { id: 'studio', label: 'Studio', icon: <Sliders className="w-5 h-5" /> },
    { id: 'library', label: 'Thư viện', icon: <BookMarked className="w-5 h-5" /> },
    { id: 'settings', label: 'Cài đặt', icon: <Settings className="w-5 h-5" /> },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      <ToastViewport toasts={toasts} />
      <OnboardingModal />
      <QuickTranslateModal />
      <SubtitleFileModal />
      <WordLookupSheet />
      <FloatingBubbleOverlay />

      {/* Centered Mobile-First Responsive Container (Portrait & Landscape Safe) */}
      <main className="flex-1 w-full max-w-2xl mx-auto px-4 pt-safe pt-3 pb-24">
        {activeTab === 'home' && (
          <HomeView
            onLaunchLiveMode={(mode) => {
              setRequestedLiveMode(mode);
              setActiveTab('live');
            }}
          />
        )}

        {/* Keep LiveTranslationView & VideoPlayerView mounted so switching to Studio/Settings mid-session never interrupts playback or live translation! */}
        <div className={activeTab === 'live' ? 'block' : 'hidden'}>
          <LiveTranslationView initialMode={requestedLiveMode} />
        </div>

        <div className={activeTab === 'video' ? 'block' : 'hidden'}>
          <VideoPlayerView />
        </div>

        {activeTab === 'studio' && <CustomizeStudioView />}
        {activeTab === 'library' && <LibraryView />}
        {activeTab === 'settings' && <SettingsView />}
      </main>

      {/* One-Handed Ergonomic Bottom Navigation Bar */}
      <nav
        aria-label="Điều hướng chính"
        className="fixed bottom-0 inset-x-0 z-40 bg-[var(--bg-surface)]/92 backdrop-blur-xl border-t border-[var(--border-subtle)] pb-safe"
      >
        <div className="max-w-2xl mx-auto px-2 py-1.5 grid grid-cols-6 gap-1">
          {navItems.map((item) => {
            const selected = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  haptic(6);
                  setActiveTab(item.id);
                }}
                aria-current={selected ? 'page' : undefined}
                className={`relative min-h-[48px] rounded-2xl flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer ${
                  selected
                    ? 'text-[var(--accent-primary)] font-bold bg-[var(--accent-primary-soft)]'
                    : 'text-[var(--text-secondary)] font-medium hover:text-[var(--text-primary)]'
                }`}
              >
                <div className="relative">
                  {item.icon}
                  {item.badge && (
                    <span className="absolute -top-0.5 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-[var(--bg-surface)]" />
                  )}
                </div>
                <span className="text-[10.5px] leading-tight truncate max-w-full px-1">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <LinguaFlowProvider>
      <AppShell />
    </LinguaFlowProvider>
  );
};

export default App;
