import React, { useRef, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  Copy,
  Edit2,
  Eye,
  EyeOff,
  Grid,
  Layout,
  Plus,
  RotateCcw,
  Smartphone,
  Trash2,
  Type,
  Undo2,
} from 'lucide-react';
import { useLinguaFlow } from '../context/LinguaFlowContext';
import type {
  StudioWidgetId,
  SubtitleDisplayMode,
  SubtitlePreset,
  ToolbarActionId,
} from '../types/domain';
import { DraggableSubtitleBox } from '../components/subtitle/DraggableSubtitleBox';
import { PrecisionSlider, SwitchToggle } from '../components/ui/DesignSystem';

const TOOLBAR_ACTION_LABELS: Record<ToolbarActionId, string> = {
  'pause-resume': 'Tạm dừng / Tiếp tục',
  'subtitle-style': 'Chỉnh phụ đề nhanh',
  'bilingual-toggle': 'Chuyển Song ngữ',
  'hide-subtitle': 'Ẩn / Hiện phụ đề',
  'language-switch': 'Đổi ngôn ngữ',
  'mini-transcript': 'Mở Transcript mini',
  'minimal-mode': 'Chế độ tối giản',
  'end-session': 'Kết thúc phiên',
};

export const CustomizeStudioView: React.FC = () => {
  const {
    presets,
    activePreset,
    setActivePresetId,
    updateActivePresetLive,
    savePresetAsNew,
    duplicatePreset,
    renamePreset,
    deletePreset,
    resetActivePresetToDefault,
    undoPresetChange,
    canUndoPreset,
    layoutProfiles,
    activeLayout,
    setActiveLayoutId,
    updateActiveLayout,
    undoLayoutChange,
    canUndoLayout,
    resetLayoutToDefault,
    duplicateLayoutProfile,
    haptic,
  } = useLinguaFlow();

  const [studioMode, setStudioMode] = useState<'subtitle-editor' | 'layout-canvas'>('subtitle-editor');
  const [editorSubTab, setEditorSubTab] = useState<'presets' | 'typography' | 'box' | 'display'>('presets');
  const [previewAspect, setPreviewAspect] = useState<'portrait' | 'landscape'>('landscape');
  const [previewScene, setPreviewScene] = useState<'cinema-dark' | 'daylight' | 'livestream'>('livestream');
  const [newPresetName, setNewPresetName] = useState('');
  const [selectedWidgetId, setSelectedWidgetId] = useState<StudioWidgetId>('subtitle-box');
  const [snapGuideState, setSnapGuideState] = useState<{ centerX: boolean; centerY: boolean }>({
    centerX: false,
    centerY: false,
  });

  const canvasStageRef = useRef<HTMLDivElement | null>(null);

  // Dragging a HUD widget on the Snap-Grid Canvas (Section 11.1 & 11.2)
  const handleWidgetPointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    widgetId: StudioWidgetId,
    lockedSafeZone?: boolean
  ) => {
    setSelectedWidgetId(widgetId);
    if (lockedSafeZone) return;
    const stage = canvasStageRef.current;
    if (!stage) return;

    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);

    const rect = stage.getBoundingClientRect();
    const targetWidget = activeLayout.widgets.find((w) => w.id === widgetId);
    if (!targetWidget) return;

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const origX = targetWidget.x;
    const origY = targetWidget.y;

    const onMove = (ev: PointerEvent) => {
      const dxPct = ((ev.clientX - startClientX) / Math.max(1, rect.width)) * 100;
      const dyPct = ((ev.clientY - startClientY) / Math.max(1, rect.height)) * 100;

      // Safe zone clamping: prevent dragging into OS status/nav bar edges (8%..90%)
      let nx = Math.max(10, Math.min(90, origX + dxPct));
      let ny = Math.max(8, Math.min(88, origY + dyPct));

      if (activeLayout.snapToGrid) {
        const step = activeLayout.gridSizePct || 5;
        nx = Math.round(nx / step) * step;
        ny = Math.round(ny / step) * step;
      } else {
        nx = Math.round(nx);
        ny = Math.round(ny);
      }

      const cx = Math.abs(nx - 50) <= 3;
      const cy = Math.abs(ny - 50) <= 3;
      if (cx) nx = 50;
      if (cy) ny = 50;
      setSnapGuideState({ centerX: cx, centerY: cy });

      updateActiveLayout((prev) => ({
        ...prev,
        widgets: prev.widgets.map((w) =>
          w.id === widgetId ? { ...w, x: nx, y: ny } : w
        ),
      }));
    };

    const onUp = () => {
      setSnapGuideState({ centerX: false, centerY: false });
      haptic(8);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const moveToolbarAction = (actionId: ToolbarActionId, dir: -1 | 1) => {
    updateActiveLayout((prev) => {
      const list = [...prev.toolbar.orderedActions];
      const idx = list.indexOf(actionId);
      if (idx === -1) return prev;
      const targetIdx = idx + dir;
      if (targetIdx < 0 || targetIdx >= list.length) return prev;
      [list[idx], list[targetIdx]] = [list[targetIdx], list[idx]];
      return {
        ...prev,
        toolbar: { ...prev.toolbar, orderedActions: list },
      };
    });
  };

  const toggleToolbarActionHidden = (actionId: ToolbarActionId) => {
    if (actionId === 'pause-resume' || actionId === 'end-session') return; // Essential safety controls stay accessible!
    updateActiveLayout((prev) => {
      const hidden = prev.toolbar.hiddenActions.includes(actionId)
        ? prev.toolbar.hiddenActions.filter((a) => a !== actionId)
        : [...prev.toolbar.hiddenActions, actionId];
      return {
        ...prev,
        toolbar: { ...prev.toolbar, hiddenActions: hidden },
      };
    });
  };

  const sceneBgClass =
    previewScene === 'daylight'
      ? 'bg-gradient-to-br from-amber-100 via-sky-200 to-emerald-100'
      : previewScene === 'cinema-dark'
      ? 'bg-gradient-to-b from-zinc-900 via-neutral-950 to-black'
      : 'bg-gradient-to-br from-indigo-950 via-slate-900 to-teal-950';

  return (
    <div className="space-y-4 pb-8">
      {/* Studio Header & Top Mode Switcher */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="inline-flex rounded-2xl lf-elevated p-1">
          <button
            type="button"
            onClick={() => setStudioMode('subtitle-editor')}
            className={`min-h-[38px] px-3.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer ${
              studioMode === 'subtitle-editor'
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs'
                : 'text-[var(--text-secondary)]'
            }`}
          >
            <Type className="w-3.5 h-3.5" />
            <span>Phụ đề (22 thuộc tính)</span>
          </button>

          <button
            type="button"
            onClick={() => setStudioMode('layout-canvas')}
            className={`min-h-[38px] px-3.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer ${
              studioMode === 'layout-canvas'
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs'
                : 'text-[var(--text-secondary)]'
            }`}
          >
            <Layout className="w-3.5 h-3.5" />
            <span>Bố cục kéo thả</span>
          </button>
        </div>

        {/* Undo & Reset quick actions */}
        <div className="flex items-center gap-1.5">
          {studioMode === 'subtitle-editor' ? (
            <>
              <button
                type="button"
                disabled={!canUndoPreset}
                onClick={undoPresetChange}
                aria-label="Hoàn tác phụ đề"
                className="min-h-[38px] px-3 rounded-xl lf-surface text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-40 cursor-pointer"
              >
                <Undo2 className="w-3.5 h-3.5" />
                <span>Hoàn tác</span>
              </button>
              <button
                type="button"
                onClick={resetActivePresetToDefault}
                aria-label="Đặt lại mặc định"
                className="min-h-[38px] px-3 rounded-xl lf-surface text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Mặc định</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={!canUndoLayout}
                onClick={undoLayoutChange}
                className="min-h-[38px] px-3 rounded-xl lf-surface text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-40 cursor-pointer"
              >
                <Undo2 className="w-3.5 h-3.5" />
                <span>Hoàn tác</span>
              </button>
              <button
                type="button"
                onClick={resetLayoutToDefault}
                className="min-h-[38px] px-3 rounded-xl lf-surface text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Khôi phục</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* TAB 1: SUBTITLE CUSTOMIZATION EDITOR (Section 10 & 50.3)              */}
      {/* ===================================================================== */}
      {studioMode === 'subtitle-editor' && (
        <>
          {/* Real-Time Interactive Preview Stage (Portrait & Landscape + Direct Drag & Width Resize!) */}
          <section className="rounded-3xl lf-surface p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPreviewAspect('landscape')}
                  className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer ${
                    previewAspect === 'landscape'
                      ? 'bg-[var(--accent-primary)] text-white'
                      : 'lf-elevated text-[var(--text-secondary)]'
                  }`}
                >
                  Ngang 16:9
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewAspect('portrait')}
                  className={`px-2.5 py-1 rounded-lg font-semibold inline-flex items-center gap-1 cursor-pointer ${
                    previewAspect === 'portrait'
                      ? 'bg-[var(--accent-primary)] text-white'
                      : 'lf-elevated text-[var(--text-secondary)]'
                  }`}
                >
                  <Smartphone className="w-3 h-3" />
                  <span>Dọc 9:16</span>
                </button>
              </div>

              {/* Background contrast tester */}
              <div className="flex items-center gap-1">
                {(
                  [
                    ['livestream', 'Live'],
                    ['cinema-dark', 'Tối'],
                    ['daylight', 'Sáng'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPreviewScene(id)}
                    className={`px-2 py-1 rounded-lg text-[11px] font-semibold cursor-pointer ${
                      previewScene === id
                        ? 'bg-[var(--text-primary)] text-[var(--bg-surface)]'
                        : 'lf-elevated text-[var(--text-secondary)]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-center">
              <div
                className={`relative overflow-hidden rounded-2xl border border-[var(--border-strong)] shadow-inner transition-all ${sceneBgClass} ${
                  previewAspect === 'portrait'
                    ? 'w-[248px] h-[390px]'
                    : 'w-full h-[250px] sm:h-[290px]'
                }`}
              >
                {/* Safe zone visual frame */}
                <div
                  style={{ inset: `${activePreset.safeMargin}px` }}
                  className="pointer-events-none absolute border border-dashed border-white/20 rounded-xl"
                />

                <div className="pointer-events-none absolute top-2.5 left-3 text-[10px] font-medium text-white/75 bg-black/35 px-2 py-0.5 rounded-full">
                  Chạm & kéo phụ đề · Kéo 2 cạnh xanh để chỉnh độ rộng
                </div>

                <DraggableSubtitleBox
                  preset={activePreset}
                  sourceText="여러분 오늘 방송 정말 재미있어요!"
                  translatedText="Buổi phát sóng hôm nay thật sự rất thú vị!"
                  speakerLabel="Streamer"
                  draggable
                  showResizeHandles
                  onUpdatePosition={(patch) => updateActivePresetLive(patch)}
                  onTapTextEdit={() => setEditorSubTab('typography')}
                />
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)] px-1">
              <span>
                Vị trí: X {activePreset.positionX}% · Y {activePreset.positionY}%
              </span>
              <span>Khung rộng: {activePreset.maxWidth}%</span>
            </div>
          </section>

          {/* Categorized Property Tabs */}
          <div className="grid grid-cols-4 gap-1.5 rounded-2xl lf-elevated p-1">
            {(
              [
                ['presets', 'Mẫu Preset'],
                ['typography', 'Kiểu chữ'],
                ['box', 'Màu & Khung'],
                ['display', 'Hiển thị'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setEditorSubTab(id)}
                className={`min-h-[38px] rounded-xl text-xs font-bold cursor-pointer ${
                  editorSubTab === id
                    ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs'
                    : 'text-[var(--text-secondary)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* 1. PRESETS LIBRARY & SAVE/DUPLICATE/RENAME/DELETE (Section 10.3 & 10.5) */}
          {editorSubTab === 'presets' && (
            <section className="rounded-3xl lf-surface p-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {presets.map((p) => {
                  const selected = p.id === activePreset.id;
                  return (
                    <div
                      key={p.id}
                      className={`rounded-2xl p-3.5 border transition-all flex items-start justify-between gap-2 ${
                        selected
                          ? 'bg-[var(--accent-primary-soft)] border-[var(--accent-primary)]'
                          : 'lf-elevated border-transparent'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setActivePresetId(p.id)}
                        className="flex-1 text-left cursor-pointer"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-bold text-[var(--text-primary)]">
                            {p.name}
                          </span>
                          {!p.isBuiltIn && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-teal-500/15 text-[var(--accent-flow)]">
                              Cá nhân
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                          {p.description || `${p.fontSize}px · Rộng ${p.maxWidth}%`}
                        </p>
                      </button>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => duplicatePreset(p.id)}
                          title="Nhân bản mẫu"
                          aria-label={`Nhân bản mẫu ${p.name}`}
                          className="p-1.5 rounded-lg lf-surface text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        {!p.isBuiltIn && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                const next = window.prompt('Đổi tên mẫu phụ đề:', p.name);
                                if (next) renamePreset(p.id, next);
                              }}
                              aria-label={`Đổi tên mẫu ${p.name}`}
                              className="p-1.5 rounded-lg lf-surface text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => deletePreset(p.id)}
                              aria-label={`Xóa mẫu ${p.name}`}
                              className="p-1.5 rounded-lg lf-surface text-red-500 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Save current configuration as a new personal preset */}
              <div className="pt-3 border-t border-[var(--border-subtle)] flex gap-2">
                <input
                  type="text"
                  value={newPresetName}
                  onChange={(e) => setNewPresetName(e.target.value)}
                  placeholder="Tên mẫu mới (VD: Livestream Hàn ban đêm)…"
                  className="flex-1 min-h-[42px] px-3.5 rounded-xl lf-elevated text-xs outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    savePresetAsNew(newPresetName || `Mẫu cá nhân ${presets.length + 1}`);
                    setNewPresetName('');
                  }}
                  className="min-h-[42px] px-4 rounded-xl bg-[var(--accent-primary)] text-white text-xs font-bold inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Lưu mẫu mới</span>
                </button>
              </div>
            </section>
          )}

          {/* 2. TYPOGRAPHY CONTROLS */}
          {editorSubTab === 'typography' && (
            <section className="rounded-3xl lf-surface p-5 space-y-4">
              <PrecisionSlider
                label="Cỡ chữ"
                valueLabel={`${activePreset.fontSize}px`}
                min={13}
                max={42}
                value={activePreset.fontSize}
                onChange={(v) => updateActivePresetLive({ fontSize: v })}
              />

              <div className="space-y-1.5">
                <span className="text-xs font-medium text-[var(--text-primary)]">Kiểu chữ</span>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                  {(
                    [
                      ['sans', 'Hiện đại'],
                      ['cjk', 'Đa ngữ CJK'],
                      ['rounded', 'Bo tròn'],
                      ['serif', 'Điện ảnh'],
                      ['mono', 'Mono'],
                    ] as Array<[SubtitlePreset['fontFamily'], string]>
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => updateActivePresetLive({ fontFamily: id })}
                      className={`min-h-[38px] px-2.5 rounded-xl text-xs font-semibold cursor-pointer ${
                        activePreset.fontFamily === id
                          ? 'bg-[var(--accent-primary)] text-white'
                          : 'lf-elevated text-[var(--text-primary)]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-[var(--text-primary)]">Độ đậm</span>
                  <div className="grid grid-cols-4 gap-1">
                    {([400, 500, 600, 700] as const).map((w) => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => updateActivePresetLive({ fontWeight: w })}
                        className={`min-h-[36px] rounded-lg text-xs font-bold cursor-pointer ${
                          activePreset.fontWeight === w
                            ? 'bg-[var(--accent-primary)] text-white'
                            : 'lf-elevated text-[var(--text-primary)]'
                        }`}
                      >
                        {w}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-[var(--text-primary)]">Căn lề</span>
                  <div className="grid grid-cols-3 gap-1">
                    {(
                      [
                        ['left', <AlignLeft className="w-4 h-4" key="l" />, 'Căn trái'],
                        ['center', <AlignCenter className="w-4 h-4" key="c" />, 'Căn giữa'],
                        ['right', <AlignRight className="w-4 h-4" key="r" />, 'Căn phải'],
                      ] as const
                    ).map(([align, icon, aria]) => (
                      <button
                        key={align}
                        type="button"
                        aria-label={aria}
                        onClick={() => updateActivePresetLive({ alignment: align })}
                        className={`min-h-[36px] rounded-lg inline-flex items-center justify-center cursor-pointer ${
                          activePreset.alignment === align
                            ? 'bg-[var(--accent-primary)] text-white'
                            : 'lf-elevated text-[var(--text-primary)]'
                        }`}
                      >
                        {icon}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <PrecisionSlider
                label="Khoảng cách dòng"
                valueLabel={`${activePreset.lineSpacing.toFixed(2)}`}
                min={1.15}
                max={2.0}
                step={0.05}
                value={activePreset.lineSpacing}
                onChange={(v) => updateActivePresetLive({ lineSpacing: v })}
              />

              <PrecisionSlider
                label="Khoảng cách ký tự"
                valueLabel={`${activePreset.letterSpacing.toFixed(2)}em`}
                min={-0.02}
                max={0.08}
                step={0.01}
                value={activePreset.letterSpacing}
                onChange={(v) => updateActivePresetLive({ letterSpacing: v })}
              />

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-[var(--text-primary)]">Viền chữ</span>
                  <select
                    aria-label="Viền chữ"
                    value={activePreset.textOutline}
                    onChange={(e) =>
                      updateActivePresetLive({
                        textOutline: e.target.value as SubtitlePreset['textOutline'],
                      })
                    }
                    className="w-full min-h-[38px] px-3 rounded-xl lf-elevated text-xs font-semibold"
                  >
                    <option value="none">Không viền</option>
                    <option value="light">Viền nhẹ</option>
                    <option value="medium">Viền rõ</option>
                    <option value="strong">Viền đậm tương phản</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-[var(--text-primary)]">Bóng chữ</span>
                  <select
                    aria-label="Bóng chữ"
                    value={activePreset.textShadow}
                    onChange={(e) =>
                      updateActivePresetLive({
                        textShadow: e.target.value as SubtitlePreset['textShadow'],
                      })
                    }
                    className="w-full min-h-[38px] px-3 rounded-xl lf-elevated text-xs font-semibold"
                  >
                    <option value="none">Không bóng</option>
                    <option value="soft">Bóng dịu</option>
                    <option value="crisp">Bóng sắc nét</option>
                    <option value="cinema">Bóng điện ảnh</option>
                  </select>
                </div>
              </div>
            </section>
          )}

          {/* 3. COLORS, BACKGROUND & BOX GEOMETRY */}
          {editorSubTab === 'box' && (
            <section className="rounded-3xl lf-surface p-5 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <label className="space-y-1">
                  <span className="text-xs font-medium text-[var(--text-primary)] block">
                    Màu chữ Việt
                  </span>
                  <div className="flex items-center gap-2 lf-elevated rounded-xl px-2.5 py-1.5">
                    <input
                      type="color"
                      value={activePreset.textColor}
                      onChange={(e) => updateActivePresetLive({ textColor: e.target.value })}
                      className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent"
                    />
                    <span className="text-[11px] font-mono">{activePreset.textColor}</span>
                  </div>
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-medium text-[var(--text-primary)] block">
                    Màu chữ gốc
                  </span>
                  <div className="flex items-center gap-2 lf-elevated rounded-xl px-2.5 py-1.5">
                    <input
                      type="color"
                      value={activePreset.sourceTextColor}
                      onChange={(e) => updateActivePresetLive({ sourceTextColor: e.target.value })}
                      className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent"
                    />
                    <span className="text-[11px] font-mono">{activePreset.sourceTextColor}</span>
                  </div>
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-medium text-[var(--text-primary)] block">
                    Màu nền
                  </span>
                  <div className="flex items-center gap-2 lf-elevated rounded-xl px-2.5 py-1.5">
                    <input
                      type="color"
                      value={activePreset.backgroundColor}
                      onChange={(e) => updateActivePresetLive({ backgroundColor: e.target.value })}
                      className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent"
                    />
                    <span className="text-[11px] font-mono">{activePreset.backgroundColor}</span>
                  </div>
                </label>
              </div>

              <PrecisionSlider
                label="Độ trong suốt nền (Độ đậm nền)"
                valueLabel={`${Math.round(activePreset.backgroundOpacity * 100)}%`}
                min={0}
                max={1}
                step={0.05}
                value={activePreset.backgroundOpacity}
                onChange={(v) => updateActivePresetLive({ backgroundOpacity: v })}
              />

              <PrecisionSlider
                label="Hiệu ứng kính mờ (Blur)"
                valueLabel={`${activePreset.backdropBlur}px`}
                min={0}
                max={20}
                value={activePreset.backdropBlur}
                onChange={(v) => updateActivePresetLive({ backdropBlur: v })}
              />

              <PrecisionSlider
                label="Độ rộng khung tối đa"
                valueLabel={`${activePreset.maxWidth}%`}
                min={50}
                max={96}
                value={activePreset.maxWidth}
                onChange={(v) => updateActivePresetLive({ maxWidth: v })}
              />

              <div className="grid grid-cols-2 gap-4">
                <PrecisionSlider
                  label="Bo góc"
                  valueLabel={`${activePreset.cornerRadius}px`}
                  min={0}
                  max={28}
                  value={activePreset.cornerRadius}
                  onChange={(v) => updateActivePresetLive({ cornerRadius: v })}
                />

                <PrecisionSlider
                  label="Padding khung"
                  valueLabel={`${activePreset.paddingX}px`}
                  min={8}
                  max={28}
                  value={activePreset.paddingX}
                  onChange={(v) =>
                    updateActivePresetLive({
                      paddingX: v,
                      paddingY: Math.max(6, Math.round(v * 0.62)),
                    })
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <PrecisionSlider
                  label="Vị trí ngang (X)"
                  valueLabel={`${activePreset.positionX}%`}
                  min={12}
                  max={88}
                  value={activePreset.positionX}
                  onChange={(v) => updateActivePresetLive({ positionX: v })}
                />

                <PrecisionSlider
                  label="Vị trí dọc (Y)"
                  valueLabel={`${activePreset.positionY}%`}
                  min={12}
                  max={90}
                  value={activePreset.positionY}
                  onChange={(v) => updateActivePresetLive({ positionY: v })}
                />
              </div>

              <PrecisionSlider
                label="Khoảng cách an toàn tới mép màn hình"
                valueLabel={`${activePreset.safeMargin}px`}
                min={8}
                max={36}
                value={activePreset.safeMargin}
                onChange={(v) => updateActivePresetLive({ safeMargin: v })}
              />
            </section>
          )}

          {/* 4. DISPLAY MODES, LINES & TIMING */}
          {editorSubTab === 'display' && (
            <section className="rounded-3xl lf-surface p-5 space-y-4">
              <div className="space-y-1.5">
                <span className="text-xs font-medium text-[var(--text-primary)]">
                  Chế độ ngôn ngữ phụ đề
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ['vi-only', 'Chỉ tiếng Việt'],
                      ['bilingual', 'Song ngữ (Gốc + Việt)'],
                      ['source-only', 'Chỉ ngôn ngữ gốc'],
                      ['minimal', 'Tối giản (Không nền)'],
                    ] as Array<[SubtitleDisplayMode, string]>
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => updateActivePresetLive({ subtitleMode: id })}
                      className={`min-h-[40px] px-3 rounded-xl text-xs font-semibold cursor-pointer ${
                        activePreset.subtitleMode === id
                          ? 'bg-[var(--accent-primary)] text-white'
                          : 'lf-elevated text-[var(--text-primary)]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {activePreset.subtitleMode === 'bilingual' && (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => updateActivePresetLive({ bilingualOrder: 'source-top' })}
                    className={`min-h-[40px] rounded-xl text-xs font-semibold cursor-pointer ${
                      activePreset.bilingualOrder === 'source-top'
                        ? 'bg-[var(--accent-primary-soft)] text-[var(--accent-primary)] border border-[var(--accent-primary)]'
                        : 'lf-elevated text-[var(--text-primary)]'
                    }`}
                  >
                    Dòng trên: Ngôn ngữ gốc
                  </button>
                  <button
                    type="button"
                    onClick={() => updateActivePresetLive({ bilingualOrder: 'vi-top' })}
                    className={`min-h-[40px] rounded-xl text-xs font-semibold cursor-pointer ${
                      activePreset.bilingualOrder === 'vi-top'
                        ? 'bg-[var(--accent-primary-soft)] text-[var(--accent-primary)] border border-[var(--accent-primary)]'
                        : 'lf-elevated text-[var(--text-primary)]'
                    }`}
                  >
                    Dòng trên: Tiếng Việt
                  </button>
                </div>
              )}

              <PrecisionSlider
                label="Số dòng tối đa"
                valueLabel={`${activePreset.maxLines} dòng`}
                min={1}
                max={4}
                value={activePreset.maxLines}
                onChange={(v) => updateActivePresetLive({ maxLines: v })}
              />

              <PrecisionSlider
                label="Thời gian giữ phụ đề trên màn hình"
                valueLabel={`${(activePreset.holdDurationMs / 1000).toFixed(1)}s`}
                min={1500}
                max={8000}
                step={250}
                value={activePreset.holdDurationMs}
                onChange={(v) => updateActivePresetLive({ holdDurationMs: v })}
              />

              <div className="space-y-1.5">
                <span className="text-xs font-medium text-[var(--text-primary)]">
                  Kiểu cập nhật câu thoại
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      updateActivePresetLive({ segmentationMode: 'live-incremental' })
                    }
                    className={`min-h-[40px] px-3 rounded-xl text-xs font-semibold cursor-pointer ${
                      activePreset.segmentationMode === 'live-incremental'
                        ? 'bg-[var(--accent-primary)] text-white'
                        : 'lf-elevated text-[var(--text-primary)]'
                    }`}
                  >
                    Cập nhật trực tiếp từng phần
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      updateActivePresetLive({ segmentationMode: 'sentence-complete' })
                    }
                    className={`min-h-[40px] px-3 rounded-xl text-xs font-semibold cursor-pointer ${
                      activePreset.segmentationMode === 'sentence-complete'
                        ? 'bg-[var(--accent-primary)] text-white'
                        : 'lf-elevated text-[var(--text-primary)]'
                    }`}
                  >
                    Hiển thị theo câu hoàn chỉnh
                  </button>
                </div>
              </div>
            </section>
          )}
        </>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: CUSTOMIZE STUDIO — SNAP GRID CANVAS & FLEXIBLE TOOLBAR (Sec 11)*/}
      {/* ===================================================================== */}
      {studioMode === 'layout-canvas' && (
        <div className="space-y-4">
          {/* Context Layout Profile Selector */}
          <section className="rounded-3xl lf-surface p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[var(--text-secondary)]">
                Hồ sơ bố cục theo ngữ cảnh
              </span>
              <button
                type="button"
                onClick={() => duplicateLayoutProfile()}
                className="text-xs font-semibold text-[var(--accent-primary)] inline-flex items-center gap-1 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Nhân bản hồ sơ</span>
              </button>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {layoutProfiles.map((lp) => (
                <button
                  key={lp.id}
                  type="button"
                  onClick={() => setActiveLayoutId(lp.id)}
                  className={`shrink-0 min-h-[38px] px-3.5 rounded-xl text-xs font-semibold cursor-pointer ${
                    lp.id === activeLayout.id
                      ? 'bg-[var(--accent-primary)] text-white'
                      : 'lf-elevated text-[var(--text-primary)]'
                  }`}
                >
                  {lp.name}
                </button>
              ))}
            </div>
          </section>

          {/* 1. Interactive Snap-Grid Preview Area */}
          <section className="rounded-3xl lf-surface p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                <Grid className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                <span>Vùng xem trước kéo thả (Snap Grid)</span>
              </div>
              <SwitchToggle
                label="Bắt lưới"
                checked={activeLayout.snapToGrid}
                onChange={(val) =>
                  updateActiveLayout((prev) => ({ ...prev, snapToGrid: val }))
                }
              />
            </div>

            <div
              ref={canvasStageRef}
              className="relative w-full h-[300px] rounded-2xl bg-slate-950 overflow-hidden border border-[var(--border-strong)] select-none"
              style={{
                backgroundImage: activeLayout.snapToGrid
                  ? 'radial-gradient(rgba(148,163,184,0.22) 1px, transparent 1px)'
                  : undefined,
                backgroundSize: '20px 20px',
              }}
            >
              {/* Safe Area Boundary */}
              <div className="pointer-events-none absolute inset-3 rounded-xl border border-dashed border-teal-400/25" />

              {/* Magnetic Center Guides */}
              {snapGuideState.centerX && (
                <div className="pointer-events-none absolute inset-y-0 left-1/2 w-[1.5px] bg-sky-400/80 z-10" />
              )}
              {snapGuideState.centerY && (
                <div className="pointer-events-none absolute inset-x-0 top-1/2 h-[1.5px] bg-sky-400/80 z-10" />
              )}

              {activeLayout.widgets
                .filter((w) => w.visible)
                .map((w) => {
                  const selected = selectedWidgetId === w.id;
                  return (
                    <div
                      key={w.id}
                      onPointerDown={(e) =>
                        handleWidgetPointerDown(e, w.id, w.lockedSafeZone)
                      }
                      style={{
                        left: `${w.x}%`,
                        top: `${w.y}%`,
                        transform: 'translate(-50%, -50%)',
                      }}
                      className={`absolute z-20 touch-none px-3 py-1.5 rounded-xl text-[11px] font-bold transition-shadow ${
                        w.lockedSafeZone
                          ? 'bg-slate-800/90 text-slate-300 border border-slate-600/60 cursor-default'
                          : 'bg-slate-900/90 text-white border border-sky-400/50 cursor-grab active:cursor-grabbing'
                      } ${selected ? 'ring-2 ring-teal-400 shadow-lg' : ''}`}
                    >
                      {w.label}
                    </div>
                  );
                })}
            </div>
          </section>

          {/* 2. Component Visibility List */}
          <section className="rounded-3xl lf-surface p-4 space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Danh sách thành phần giao diện
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {activeLayout.widgets.map((w) => (
                <div
                  key={w.id}
                  className="rounded-2xl lf-elevated px-3.5 py-2.5 flex items-center justify-between gap-2"
                >
                  <div>
                    <div className="text-xs font-bold text-[var(--text-primary)]">{w.label}</div>
                    <div className="text-[10px] font-mono text-[var(--text-secondary)]">
                      X: {w.x}% · Y: {w.y}%
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={w.id === 'control-bar' || w.id === 'subtitle-box'}
                    onClick={() =>
                      updateActiveLayout((prev) => ({
                        ...prev,
                        widgets: prev.widgets.map((item) =>
                          item.id === w.id ? { ...item, visible: !item.visible } : item
                        ),
                      }))
                    }
                    aria-label={`Ẩn hoặc hiện ${w.label}`}
                    className="min-h-[34px] px-2.5 rounded-xl lf-surface text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-40 cursor-pointer"
                  >
                    {w.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    <span>{w.visible ? 'Đang hiện' : 'Đã ẩn'}</span>
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* 3. Flexible Toolbar Customizer (Section 11.3) */}
          <section className="rounded-3xl lf-surface p-4 space-y-3.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Tùy chỉnh thanh công cụ linh hoạt
            </h3>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() =>
                  updateActiveLayout((prev) => ({
                    ...prev,
                    toolbar: {
                      ...prev.toolbar,
                      buttonDisplay:
                        prev.toolbar.buttonDisplay === 'icon-label' ? 'icon-only' : 'icon-label',
                    },
                  }))
                }
                className="min-h-[40px] px-2.5 rounded-xl lf-elevated text-xs font-semibold cursor-pointer"
              >
                {activeLayout.toolbar.buttonDisplay === 'icon-label'
                  ? 'Icon kèm chữ'
                  : 'Chỉ Icon'}
              </button>

              <button
                type="button"
                onClick={() => {
                  const order: Array<'compact' | 'standard' | 'large'> = [
                    'compact',
                    'standard',
                    'large',
                  ];
                  const nxt =
                    order[(order.indexOf(activeLayout.toolbar.size) + 1) % order.length];
                  updateActiveLayout((prev) => ({
                    ...prev,
                    toolbar: { ...prev.toolbar, size: nxt },
                  }));
                }}
                className="min-h-[40px] px-2.5 rounded-xl lf-elevated text-xs font-semibold cursor-pointer"
              >
                Cỡ:{' '}
                {activeLayout.toolbar.size === 'compact'
                  ? 'Gọn'
                  : activeLayout.toolbar.size === 'standard'
                  ? 'Chuẩn'
                  : 'Lớn'}
              </button>

              <button
                type="button"
                onClick={() => {
                  const positions: Array<'bottom' | 'top' | 'floating-right'> = [
                    'bottom',
                    'top',
                    'floating-right',
                  ];
                  const nxt =
                    positions[
                      (positions.indexOf(activeLayout.toolbar.position) + 1) % positions.length
                    ];
                  updateActiveLayout((prev) => ({
                    ...prev,
                    toolbar: { ...prev.toolbar, position: nxt },
                  }));
                }}
                className="min-h-[40px] px-2.5 rounded-xl lf-elevated text-xs font-semibold cursor-pointer"
              >
                Vị trí:{' '}
                {activeLayout.toolbar.position === 'bottom'
                  ? 'Dưới'
                  : activeLayout.toolbar.position === 'top'
                  ? 'Trên'
                  : 'Nổi phải'}
              </button>
            </div>

            <div className="space-y-1.5">
              {activeLayout.toolbar.orderedActions.map((actId, index) => {
                const isHidden = activeLayout.toolbar.hiddenActions.includes(actId);
                const locked = actId === 'pause-resume' || actId === 'end-session';
                return (
                  <div
                    key={actId}
                    className={`rounded-2xl lf-elevated px-3.5 py-2 flex items-center justify-between gap-2 ${
                      isHidden ? 'opacity-55' : ''
                    }`}
                  >
                    <span className="text-xs font-semibold text-[var(--text-primary)]">
                      {index + 1}. {TOOLBAR_ACTION_LABELS[actId]}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => moveToolbarAction(actId, -1)}
                        aria-label="Đưa nút lên trước"
                        className="p-1.5 rounded-lg lf-surface disabled:opacity-35 cursor-pointer"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={index === activeLayout.toolbar.orderedActions.length - 1}
                        onClick={() => moveToolbarAction(actId, 1)}
                        aria-label="Đưa nút xuống sau"
                        className="p-1.5 rounded-lg lf-surface disabled:opacity-35 cursor-pointer"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={locked}
                        onClick={() => toggleToolbarActionHidden(actId)}
                        className="min-h-[30px] px-2 rounded-lg lf-surface text-[11px] font-semibold disabled:opacity-35 cursor-pointer"
                      >
                        {isHidden ? 'Hiện' : 'Ẩn'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
