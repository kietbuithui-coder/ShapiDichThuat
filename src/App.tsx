import React, { useState } from 'react';
import {
  BookMarked,
  Film,
  Home,
  Radio,
  Settings,
  Sliders,
  MoreHorizontal,
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
import { BrandLogo } from './components/ui/BrandLogo';
import { ToastViewport } from './components/ui/DesignSystem';

const AppShell: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    liveRunningIndicator,
    toasts,
    haptic,
  } = useLinguaFlow();

  const [advancedOpen, setAdvancedOpen] = useState(false);
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
    <div className="app-background min-h-screen text-[var(--text-primary)]">
      <ToastViewport toasts={toasts} />
      <OnboardingModal />
      <QuickTranslateModal />
      <SubtitleFileModal />
      <WordLookupSheet />
      <FloatingBubbleOverlay />

      <div className="app-frame">
      <aside className="desktop-sidebar" aria-label="Điều hướng chính">
        <BrandLogo size={36} />
        <div className="sidebar-label">KHÁM PHÁ</div>
        {navItems.slice(0, 3).map(item => <button key={item.id} className={`sidebar-item ${activeTab === item.id ? 'selected' : ''}`} onClick={() => setActiveTab(item.id)} aria-current={activeTab === item.id ? 'page' : undefined}>{item.icon}<span>{item.label}</span>{item.badge && <span className="nav-live-dot" />}</button>)}
        <div className="sidebar-label">NÂNG CAO</div>
        {navItems.slice(3).map(item => <button key={item.id} className={`sidebar-item ${activeTab === item.id ? 'selected' : ''}`} onClick={() => setActiveTab(item.id)} aria-current={activeTab === item.id ? 'page' : undefined}>{item.icon}<span>{item.label}</span></button>)}
        <p className="sidebar-note">Phụ đề cho những điều bạn yêu thích.</p>
      </aside>
      <main className="app-content w-full px-4 pt-safe pt-3 pb-24">
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

      </div>
      <nav aria-label="Điều hướng trên điện thoại" className="mobile-nav">
        {advancedOpen && <div className="advanced-menu" id="advanced-menu"><div className="advanced-title">Nâng cao</div>{navItems.slice(3).map(item => <button key={item.id} onClick={() => { setActiveTab(item.id); setAdvancedOpen(false); }} aria-current={activeTab === item.id ? 'page' : undefined}>{item.icon}<span>{item.label}</span></button>)}</div>}
        <div className="mobile-nav-items">
          {navItems.slice(0, 3).map(item => <button key={item.id} onClick={() => { haptic(6); setActiveTab(item.id); setAdvancedOpen(false); }} aria-current={activeTab === item.id ? 'page' : undefined} className={activeTab === item.id ? 'selected' : ''}><span className="relative">{item.icon}{item.badge && <span className="nav-live-dot" />}</span><span>{item.label}</span></button>)}
          <button onClick={() => setAdvancedOpen(v => !v)} aria-expanded={advancedOpen} aria-controls="advanced-menu" className={advancedOpen || ['studio', 'library', 'settings'].includes(activeTab) ? 'selected' : ''}><MoreHorizontal className="w-5 h-5"/><span>Nâng cao</span></button>
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
