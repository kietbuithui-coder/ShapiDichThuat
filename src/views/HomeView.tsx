import React, { useState } from 'react';
import { ArrowRight, ClipboardPaste, Film, Mic, Radio, FileText, Languages, Sliders, Clock, Layers } from 'lucide-react';
import { useLinguaFlow } from '../context/LinguaFlowContext';
import { parseWebVideoUrl } from '../core/media/webVideoParser';
import { LANGUAGE_REGISTRY } from '../core/languages/languageRegistry';
import { LanguageSelectorPills } from '../components/ui/DesignSystem';
import { BrandLogo } from '../components/ui/BrandLogo';

export const HomeView: React.FC<{ onLaunchLiveMode: (mode: 'livestream' | 'microphone') => void }> = ({ onLaunchLiveMode }) => {
  const { settings, updateSettings, sessions, setActiveTab, openWebVideoLink, setQuickTranslateOpen,
    setSubtitleFileModalOpen, setInspectingSessionId, setFloatingBubbleVisible, setFloatingBubbleExpanded,
    liveRunningIndicator, showToast } = useLinguaFlow();
  const [url, setUrl] = useState('');
  const [chooseLanguage, setChooseLanguage] = useState(false);
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = parseWebVideoUrl(url);
    if (!parsed) { showToast('Hãy nhập đường dẫn video hợp lệ', 'warning'); return; }
    openWebVideoLink(parsed.normalizedUrl);
    setUrl('');
  };
  const paste = async () => {
    try { const value = await navigator.clipboard.readText(); if (value.trim()) setUrl(value.trim()); else showToast('Bộ nhớ tạm đang trống', 'info'); }
    catch { showToast('Hãy chạm giữ vào ô nhập để dán đường dẫn', 'info'); }
  };
  const lang = LANGUAGE_REGISTRY[settings.defaultSourceLanguage];
  return (
    <div className="home-layout">
      <header className="home-top"><BrandLogo size={36} /><button type="button" className="home-bubble" onClick={() => { setFloatingBubbleVisible(true); setFloatingBubbleExpanded(true); }}><Layers size={16} /> Bong bóng</button></header>
      <div className="home-heading"><div><span className="home-eyebrow">CHÀO MỪNG ĐẾN LINGUA FLOW</span><h1>Hiểu thêm một thế giới.</h1><p>Dịch video và cuộc trò chuyện sang tiếng Việt.</p></div>{liveRunningIndicator.isRunning && <button className="home-live" onClick={() => setActiveTab('live')}>● Đang dịch</button>}</div>
      <div className="home-columns"><div className="home-main">
        <section className="home-hero" aria-label="Mở video">
          <div className="hero-icon"><Film size={22} /></div><span className="hero-kicker">XEM & HIỂU</span>
          <h2>Video bạn thích,<br />bằng tiếng Việt.</h2><p>Dán link để mở video và bắt đầu dịch.</p>
          <form onSubmit={submit} className="home-url"><label className="sr-only" htmlFor="home-video-url">Đường dẫn video</label><input id="home-video-url" value={url} onChange={e => setUrl(e.target.value)} placeholder="Dán link YouTube hoặc video..." /><button type="button" onClick={paste} className="paste-button" aria-label="Dán đường dẫn"><ClipboardPaste size={17} /></button><button type="submit" className="open-button">Mở video <ArrowRight size={16} /></button></form>
          <div className="hero-language"><button type="button" onClick={() => setChooseLanguage(v => !v)} aria-expanded={chooseLanguage}>Ngôn ngữ: {lang.shortLabelVi} → Việt <span>⌄</span></button></div>
          {chooseLanguage && <div className="hero-picker"><LanguageSelectorPills value={settings.defaultSourceLanguage} onChange={(value) => { updateSettings({ defaultSourceLanguage: value }); setChooseLanguage(false); }} compact /></div>}
        </section>
        <section className="home-section"><div className="section-heading"><div><span className="home-eyebrow">BẮT ĐẦU NHANH</span><h2>Bạn muốn dịch gì?</h2></div></div>
          <div className="mode-grid">
            <button className="mode-card" onClick={() => setActiveTab('video')}><span className="mode-icon violet"><Film size={20}/></span><span><strong>Video</strong><small>Mở video hoặc tệp từ máy</small></span><ArrowRight size={17}/></button>
            <button className="mode-card" onClick={() => onLaunchLiveMode('livestream')}><span className="mode-icon pink"><Radio size={20}/></span><span><strong>Trực tiếp</strong><small>Dịch âm thanh từ tab</small></span><ArrowRight size={17}/></button>
            <button className="mode-card" onClick={() => onLaunchLiveMode('microphone')}><span className="mode-icon blue"><Mic size={20}/></span><span><strong>Micro</strong><small>Nghe và dịch giọng nói</small></span><ArrowRight size={17}/></button>
          </div>
        </section>
      </div><aside className="home-aside">
        <section className="aside-card"><span className="home-eyebrow">CÔNG CỤ</span><h2>Tiện ích của bạn</h2>
          <button onClick={() => setSubtitleFileModalOpen(true)}><span className="aside-icon"><FileText size={17}/></span><span><strong>Dịch tệp phụ đề</strong><small>SRT, VTT và nhiều hơn</small></span><ArrowRight size={15}/></button>
          <button onClick={() => setQuickTranslateOpen(true)}><span className="aside-icon"><Languages size={17}/></span><span><strong>Dịch nhanh</strong><small>Dịch một câu</small></span><ArrowRight size={15}/></button>
          <button onClick={() => setActiveTab('studio')}><span className="aside-icon"><Sliders size={17}/></span><span><strong>Kiểu phụ đề</strong><small>Tùy chỉnh hiển thị</small></span><ArrowRight size={15}/></button>
        </section>
        <section className="aside-card history-card"><div className="history-heading"><div><span className="home-eyebrow">TIẾP TỤC</span><h2>Gần đây</h2></div><button className="history-all" onClick={() => setActiveTab('library')}>Xem tất cả</button></div>
          {sessions.length === 0 ? <p className="empty-history"><Clock size={16}/> Phiên đã lưu sẽ xuất hiện ở đây.</p> : sessions.slice(0,3).map(s => <button key={s.id} onClick={() => {setInspectingSessionId(s.id); setActiveTab('library');}}><span className="aside-icon"><Clock size={17}/></span><span><strong>{s.title}</strong><small>{s.transcriptSegments.length} câu</small></span><ArrowRight size={15}/></button>)}
        </section>
      </aside></div>
    </div>
  );
};
