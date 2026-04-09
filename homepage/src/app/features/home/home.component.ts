import { CommonModule, DOCUMENT, isPlatformBrowser, TitleCasePipe } from '@angular/common';
import {
  Component,
  computed,
  ElementRef,
  HostListener,
  inject,
  PLATFORM_ID,
  signal,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { afterNextRender } from '@angular/core';
import {
  CustomWidget,
  type LinkGroup,
  type GridItemLayout,
  QuickLink,
  SEARCH_ENGINES,
  THEMES,
  ThemeId,
  WALL_PRESETS,
  SearchEngine,
} from '../../core/models/homepage.models';
import { AuthService } from '../../core/services/auth.service';
import { HomepageStateService } from '../../core/services/homepage-state.service';

const GRAD_STYLES: Record<string, string> = {
  'gradient-aurora':
    'background:linear-gradient(135deg,#0a0618 0%,#1e1b4b 28%,#4c1d95 52%,#7c3aed 72%,#c4b5fd 100%)',
  'gradient-deep':
    'background:linear-gradient(160deg,#020617 0%,#0f172a 38%,#1e3a8a 68%,#1d4ed8 100%)',
  'gradient-dusk':
    'background:linear-gradient(175deg,#431407 0%,#9f1239 38%,#ea580c 72%,#fcd34d 100%)',
  'gradient-moss':
    'background:linear-gradient(145deg,#022c22 0%,#064e3b 42%,#0d9488 78%,#6ee7b7 100%)',
  'gradient-sand':
    'background:linear-gradient(155deg,#1c1917 0%,#57534e 40%,#a8a29e 75%,#f5f5f4 100%)',
};

type DashboardItemView =
  | { key: string; type: 'link'; link: QuickLink }
  | { key: string; type: 'collection'; group: LinkGroup }
  | { key: string; type: 'widget'; widget: CustomWidget };

type MoveDirection = 'up' | 'down' | 'left' | 'right';
type DashboardToken = `q:${string}` | `g:${string}` | `w:${string}`;

interface DragPreviewState {
  key: DashboardToken;
  x: number;
  y: number;
  w: number;
  h: number;
  valid: boolean;
}

interface DragPointerOffset {
  x: number;
  y: number;
}

interface WidgetBridgeMessage {
  type: 'homepage:widget-storage';
  requestId: string;
  action: 'getState' | 'setState';
  payload?: unknown;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TitleCasePipe],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
})
export class HomeComponent {
  private static readonly MAX_WIDGET_HTML = 50_000;
  private static readonly MAX_WIDGET_CSS = 25_000;
  private static readonly MAX_WIDGET_JS = 50_000;
  private static readonly MAX_WIDGET_TOTAL = 100_000;
  private static readonly MAX_WIDGET_STATE_BYTES = 25_000;

  private readonly doc = inject(DOCUMENT);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly platformId = inject(PLATFORM_ID);
  protected readonly state = inject(HomepageStateService);
  protected readonly auth = inject(AuthService);

  protected readonly toast = signal<string | null>(null);
  private toastClear: ReturnType<typeof setTimeout> | null = null;
  protected readonly scrollFabVisible = signal(false);
  protected readonly searchKbd = signal('Ctrl+K');
  private readonly widgetSrcCache = new Map<string, { key: string; url: SafeResourceUrl }>();
  private dragPointerOffset: DragPointerOffset | null = null;

  protected readonly THEMES = THEMES;
  protected readonly WALL_PRESETS = WALL_PRESETS;
  protected readonly engines: SearchEngine[] = ['google', 'duckduckgo', 'bing'];
  protected readonly dragPreview = signal<DragPreviewState | null>(null);
  @ViewChild('itemsGrid') private readonly itemsGridRef?: ElementRef<HTMLElement>;

  protected settingsOpen = signal(false);
  protected tabEditOpen = signal(false);
  protected addItemOpen = signal(false);
  protected quickOpen = signal(false);
  protected groupOpen = signal(false);
  protected editingTabId = signal<string | null>(null);
  protected itemsEditMode = signal(false);
  protected tabNameDraft = '';
  protected quickTitle = '';
  protected quickUrl = '';
  protected quickEmoji = '🔗';
  protected groupTitle = '';
  protected groupEmoji = '📁';
  protected groupLinkOpen = signal(false);
  protected groupLinkTargetId = signal<string | null>(null);
  protected groupLinkEditIndex = signal<number | null>(null);
  protected groupLinkTitle = '';
  protected groupLinkUrl = '';
  protected groupLinkEmoji = '🔗';

  protected groupEditOpen = signal(false);
  protected groupEditTargetId = signal<string | null>(null);
  protected groupEditTitle = '';
  protected groupEditEmoji = '📁';
  protected newWorkspaceOpen = signal(false);
  protected newWorkspaceName = '';
  protected widgetOpen = signal(false);
  protected sizeOpen = signal(false);
  protected sizeTarget = signal<{ type: 'link' | 'collection' | 'widget'; id: string } | null>(null);
  protected sizeWidth = 1;
  protected sizeHeight = 1;
  protected editingWidgetId = signal<string | null>(null);
  protected widgetTitle = '';
  protected widgetHtml = '';
  protected widgetCss = '';
  protected widgetJs = '';
  protected widgetWidth = 4;
  protected widgetHeight = 2;
  protected widgetExample = 'blank';
  protected readonly widgetAiPrompt = `Create a custom homepage widget using plain HTML, CSS and JavaScript.

Constraints:
- The widget runs inside a sandboxed iframe.
- Do not use form submission.
- Do not use localStorage.
- Use window.homepageWidget.getState() and window.homepageWidget.setState(value) for persistence.
- State must be JSON-serializable.
- Keep the UI self-contained inside the widget.

Return output in three sections:
1. HTML
2. CSS
3. JavaScript`;
  protected readonly widgetBridgeExample = `const saved = await window.homepageWidget.getState();
await window.homepageWidget.setState({ todos: [] });`;

  protected clock = signal('');
  protected dateLine = signal('');
  protected notesSaved = signal(false);
  private notesTimer: ReturnType<typeof setTimeout> | null = null;

  /** Background image for wallpaper layer; gradients use CSS classes instead. */
  wallpaperBgImage(): string {
    const s = this.state.data().settings;
    if (s.wallpaper === 'custom' && s.customWallUrl) {
      return `url("${s.customWallUrl.replace(/"/g, '\\"')}")`;
    }
    const p = WALL_PRESETS.find((w) => w.id === s.wallpaper);
    if (p?.url) {
      return `url("${p.url}")`;
    }
    return 'none';
  }

  /**
   * Inline background-image must not be set for gradients — `none` beats `.gradient-*` in CSS.
   * Only attach cover image styles for photo / custom URL wallpapers.
   */
  protected wallpaperPhotoStyles(): Record<string, string> {
    if (this.wallpaperUseGradient()) {
      return {};
    }
    return {
      'background-image': this.wallpaperBgImage(),
      'background-size': 'cover',
      'background-position': 'center',
    };
  }

  wallpaperUseGradient(): boolean {
    return this.wallpaperBgImage() === 'none';
  }

  wallpaperGradientClass(): string {
    const id = this.state.data().settings.wallpaper;
    const p = WALL_PRESETS.find((w) => w.id === id);
    if (p?.class) {
      return p.class;
    }
    return 'gradient-deep';
  }

  /** Photo / custom URL wallpapers need a lighter dim so the image actually shows. */
  private wallpaperIsPhoto(): boolean {
    const s = this.state.data().settings;
    if (s.wallpaper === 'custom' && s.customWallUrl?.trim()) {
      return true;
    }
    const p = WALL_PRESETS.find((w) => w.id === s.wallpaper);
    return !!p?.url;
  }

  /**
   * Dim wash — extra-transparent mid range; max slider still gives a strong wash.
   */
  protected readonly overlayBg = computed(() => {
    const s = this.state.data().settings;
    const raw = Math.max(0.3, Math.min(0.92, s.overlay));
    const t = (raw - 0.3) / 0.62;
    const light = s.theme === 'light';
    const photo = this.wallpaperIsPhoto();
    let o: number;
    if (photo) {
      o = light ? 0.04 + t * 0.42 : 0.05 + t * 0.38;
      o = light ? Math.max(0.03, Math.min(0.72, o)) : Math.max(0.04, Math.min(0.56, o));
    } else if (light) {
      o = 0.02 + t * 0.58;
      o = Math.max(0.02, Math.min(0.82, o));
    } else {
      o = 0.07 + t * 0.46;
      o = Math.max(0.06, Math.min(0.62, o));
    }
    return light
      ? `rgba(248, 250, 252, ${o})`
      : `rgba(2, 6, 15, ${o})`;
  });

  /** Softer frost — wallpaper stays crisp; raise Blur in settings if you want more privacy. */
  protected readonly blurPx = computed(() => {
    let b = this.state.data().settings.blur;
    const light = this.state.data().settings.theme === 'light';
    if (this.wallpaperIsPhoto()) {
      const k = light ? 0.52 : 0.36;
      b = Math.round(b * k);
      b = Math.min(12, Math.max(0, b));
    } else {
      b = Math.round(b * 0.36);
      b = Math.min(7, Math.max(0, b));
    }
    return `${b}px`;
  });

  protected readonly greetingLine = computed(() => {
    const s = this.state.data().settings;
    if (!s.showClock) {
      return '';
    }
    const h = new Date().getHours();
    let g = 'Good evening';
    if (h < 12) {
      g = 'Good morning';
    } else if (h < 17) {
      g = 'Good afternoon';
    }
    const n = (s.userName || '').trim();
    return n ? `${g}, ${n}` : g;
  });

  constructor() {
    afterNextRender(() => {
      this.tickClock();
      setInterval(() => this.tickClock(), 1000);
      if (typeof navigator !== 'undefined') {
        this.searchKbd.set(
          /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent) ? '⌘K' : 'Ctrl+K',
        );
      }
    });
  }

  protected showToast(message: string): void {
    if (this.toastClear) {
      clearTimeout(this.toastClear);
    }
    this.toast.set(message);
    this.toastClear = setTimeout(() => {
      this.toast.set(null);
      this.toastClear = null;
    }, 2600);
  }

  @HostListener('document:keydown', ['$event'])
  protected onGlobalKeydown(e: KeyboardEvent): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    const t = e.target as HTMLElement | null;
    if (
      t &&
      (t.tagName === 'INPUT' ||
        t.tagName === 'TEXTAREA' ||
        t.tagName === 'SELECT' ||
        t.isContentEditable)
    ) {
      if (e.key === '/' || (e.key === 'k' && (e.metaKey || e.ctrlKey))) {
        return;
      }
      if (e.key === 'Escape' && this.anyModalOpen()) {
        e.preventDefault();
        this.closeTopModal();
      }
      return;
    }
    if (e.key === 'Escape' && this.anyModalOpen()) {
      e.preventDefault();
      this.closeTopModal();
      return;
    }
    if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      this.focusSearch();
      return;
    }
    if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      this.focusSearch();
    }
  }

  private anyModalOpen(): boolean {
    return (
      this.settingsOpen() ||
      this.tabEditOpen() ||
      this.addItemOpen() ||
      this.quickOpen() ||
      this.groupOpen() ||
      this.groupEditOpen() ||
      this.groupLinkOpen() ||
      this.newWorkspaceOpen() ||
      this.widgetOpen() ||
      this.sizeOpen()
    );
  }

  private closeTopModal(): void {
    if (this.widgetOpen()) {
      this.widgetOpen.set(false);
    } else if (this.sizeOpen()) {
      this.sizeOpen.set(false);
    } else if (this.addItemOpen()) {
      this.addItemOpen.set(false);
    } else if (this.groupLinkOpen()) {
      this.groupLinkOpen.set(false);
    } else if (this.groupEditOpen()) {
      this.groupEditOpen.set(false);
    } else if (this.groupOpen()) {
      this.groupOpen.set(false);
    } else if (this.quickOpen()) {
      this.quickOpen.set(false);
    } else if (this.tabEditOpen()) {
      this.tabEditOpen.set(false);
    } else if (this.settingsOpen()) {
      this.closeSettings();
    }
  }

  private focusSearch(): void {
    const el = this.doc.getElementById('app-search-input') as HTMLInputElement | null;
    el?.focus();
    el?.select();
  }

  @HostListener('window:scroll')
  protected onWindowScroll(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    this.scrollFabVisible.set(window.scrollY > 380);
  }

  @HostListener('window:message', ['$event'])
  protected onWidgetMessage(event: MessageEvent): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    const widgetId = this.widgetIdForSource(event.source);
    if (!widgetId) {
      return;
    }
    const data = event.data as WidgetBridgeMessage | null;
    if (
      !data ||
      data.type !== 'homepage:widget-storage' ||
      typeof data.requestId !== 'string' ||
      (data.action !== 'getState' && data.action !== 'setState')
    ) {
      return;
    }

    if (data.action === 'getState') {
      this.respondToWidget(event.source as Window, data.requestId, true, this.widgetStateValue(widgetId));
      return;
    }

    const encoded = this.encodeWidgetState(data.payload);
    if (encoded === null) {
      this.respondToWidget(
        event.source as Window,
        data.requestId,
        false,
        null,
        'That widget data is too large or invalid to save.',
      );
      return;
    }
    this.state.updateCustomWidgetState(widgetId, encoded);
    this.respondToWidget(event.source as Window, data.requestId, true, data.payload ?? null);
  }

  protected scrollToTop(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    const reduce =
      typeof matchMedia !== 'undefined' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  }

  protected suppressItemActivation(event: Event): void {
    if (!this.itemsEditMode()) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  }

  private itemLayout(item: DashboardItemView): GridItemLayout {
    if (item.type === 'link') {
      return item.link;
    }
    if (item.type === 'collection') {
      return item.group;
    }
    return item.widget;
  }

  protected cardShellStyle(item: DashboardItemView): Record<string, string> {
    const layout = this.itemLayout(item);
    return {
      'grid-column': `${layout.x + 1} / span ${layout.w}`,
      'grid-row': `${layout.y + 1} / span ${layout.h}`,
    };
  }

  protected dragPreviewStyle(): Record<string, string> | null {
    const preview = this.dragPreview();
    if (!preview) {
      return null;
    }
    return {
      'grid-column': `${preview.x + 1} / span ${preview.w}`,
      'grid-row': `${preview.y + 1} / span ${preview.h}`,
    };
  }

  protected itemsGridStyle(): Record<string, string> {
    const items = this.dashboardItems();
    const maxBottom = items.reduce((max, item) => {
      const layout = this.itemLayout(item);
      return Math.max(max, layout.y + layout.h);
    }, 0);
    const previewBottom = this.dragPreview()
      ? this.dragPreview()!.y + this.dragPreview()!.h
      : 0;
    const rows = Math.max(maxBottom, previewBottom) + (this.itemsEditMode() ? 3 : 0);
    return {
      'min-height': `calc(${rows} * var(--dashboard-row) + ${Math.max(0, rows - 1)} * var(--dashboard-gap))`,
    };
  }

  private isTokenOccupied(candidate: GridItemLayout, key: DashboardToken): boolean {
    return this.dashboardItems().some((item) => {
      if (item.key === key) {
        return false;
      }
      const layout = this.itemLayout(item);
      return candidate.x < layout.x + layout.w &&
        candidate.x + candidate.w > layout.x &&
        candidate.y < layout.y + layout.h &&
        candidate.y + candidate.h > layout.y;
    });
  }

  private gridMetrics(grid: HTMLElement): { columns: number; gap: number; row: number; columnWidth: number } {
    const styles = getComputedStyle(grid);
    const columns = Math.max(1, Number.parseInt(styles.getPropertyValue('--dashboard-columns').trim(), 10) || 12);
    const gap = Number.parseFloat(styles.getPropertyValue('--dashboard-gap').trim()) || 12;
    const row = Number.parseFloat(styles.getPropertyValue('--dashboard-row').trim()) || 140;
    const columnWidth = (grid.clientWidth - gap * (columns - 1)) / columns;
    return { columns, gap, row, columnWidth };
  }

  private previewFromPointer(event: DragEvent, item: DashboardItemView, grid: HTMLElement): DragPreviewState | null {
    const rect = grid.getBoundingClientRect();
    const metrics = this.gridMetrics(grid);
    const layout = this.itemLayout(item);
    const pointerOffset = this.dragPointerOffset ?? { x: 0, y: 0 };
    const offsetX = Math.max(0, event.clientX - rect.left - pointerOffset.x);
    const offsetY = Math.max(0, event.clientY - rect.top - pointerOffset.y);
    const x = Math.max(
      0,
      Math.min(
        metrics.columns - layout.w,
        Math.floor(offsetX / Math.max(1, metrics.columnWidth + metrics.gap)),
      ),
    );
    const y = Math.max(0, Math.floor(offsetY / Math.max(1, metrics.row + metrics.gap)));
    const candidate = { x, y, w: layout.w, h: layout.h };
    return {
      key: item.key as DashboardToken,
      ...candidate,
      valid: !this.isTokenOccupied(candidate, item.key as DashboardToken),
    };
  }

  protected onItemDragStart(item: DashboardItemView, event: DragEvent): void {
    if (!this.itemsEditMode()) {
      event.preventDefault();
      return;
    }
    if (!event.dataTransfer) {
      return;
    }
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', item.key);
    const layout = this.itemLayout(item);
    const handleRect = (event.currentTarget as HTMLElement | null)?.getBoundingClientRect?.();
    const cardRect = (event.currentTarget as HTMLElement | null)?.closest('.item-cell')?.getBoundingClientRect?.();
    if (handleRect && cardRect) {
      this.dragPointerOffset = {
        x: Math.max(0, event.clientX - cardRect.left),
        y: Math.max(0, event.clientY - cardRect.top),
      };
    } else {
      this.dragPointerOffset = {
        x: Math.max(0, event.clientX - (handleRect?.left ?? event.clientX)),
        y: Math.max(0, event.clientY - (handleRect?.top ?? event.clientY)),
      };
    }
    this.dragPreview.set({
      key: item.key as DashboardToken,
      x: layout.x,
      y: layout.y,
      w: layout.w,
      h: layout.h,
      valid: true,
    });
  }

  protected onGridDragOver(event: DragEvent): void {
    const preview = this.dragPreview();
    const grid = this.itemsGridRef?.nativeElement;
    if (!preview || !grid || !this.itemsEditMode()) {
      return;
    }
    const item = this.dashboardItems().find((entry) => entry.key === preview.key);
    if (!item) {
      return;
    }
    event.preventDefault();
    const next = this.previewFromPointer(event, item, grid);
    if (next) {
      this.dragPreview.set(next);
    }
  }

  protected onGridDrop(event: DragEvent): void {
    const preview = this.dragPreview();
    const tab = this.state.activeTab();
    if (!preview || !tab) {
      return;
    }
    event.preventDefault();
    if (preview.valid) {
      const moved = this.state.placeTabItem(tab.id, preview.key, preview.x, preview.y);
      if (!moved) {
        this.showToast('That spot is already occupied');
      }
    } else {
      this.showToast('That spot is already occupied');
    }
    this.dragPreview.set(null);
    this.dragPointerOffset = null;
  }

  protected onItemDragEnd(): void {
    this.dragPreview.set(null);
    this.dragPointerOffset = null;
  }

  private tickClock(): void {
    const n = new Date();
    this.clock.set(
      n.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }),
    );
    this.dateLine.set(
      n.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      }),
    );
  }

  wallOptStyle(id: string): string {
    const p = WALL_PRESETS.find((w) => w.id === id);
    if (p?.url) {
      return `background-image:url(${p.url});background-size:cover;background-position:center;`;
    }
    return GRAD_STYLES[id] ?? 'background:#1e293b;';
  }

  openSettings(): void {
    this.settingsOpen.set(true);
  }
  closeSettings(): void {
    this.settingsOpen.set(false);
  }

  setTheme(id: ThemeId): void {
    this.state.setTheme(id);
  }

  setWallpaper(id: string): void {
    this.state.patchSettings({ wallpaper: id });
  }

  applyCustomWall(url: string): void {
    const u = url.trim();
    this.state.patchSettings({
      customWallUrl: u,
      wallpaper: 'custom',
    });
    if (u) {
      this.showToast('Wallpaper updated');
    }
  }

  setEngine(e: SearchEngine): void {
    this.state.patchSettings({ searchEngine: e });
  }

  onOverlayInput(v: number): void {
    this.state.patchSettings({ overlay: v });
  }

  onBlurInput(v: number): void {
    this.state.patchSettings({ blur: v });
  }

  toggleShowClock(checked: boolean): void {
    this.state.patchSettings({ showClock: checked });
  }

  setUserName(name: string): void {
    this.state.patchSettings({ userName: name });
  }

  onSearchEnter(query: string): void {
    const q = query.trim();
    if (!q) {
      return;
    }
    const eng = this.state.data().settings.searchEngine;
    window.location.href = SEARCH_ENGINES[eng](q);
  }

  selectTab(id: string): void {
    this.state.selectTab(id);
  }

  openTabEdit(id: string, name: string): void {
    this.editingTabId.set(id);
    this.tabNameDraft = name;
    this.tabEditOpen.set(true);
  }

  saveTabName(): void {
    const id = this.editingTabId();
    if (id) {
      this.state.renameTab(id, this.tabNameDraft);
      this.showToast('Workspace updated');
    }
    this.tabEditOpen.set(false);
  }

  deleteCurrentTab(): void {
    const id = this.editingTabId();
    if (id) {
      this.state.deleteTab(id);
    }
    this.tabEditOpen.set(false);
  }

  addTab(): void {
    this.newWorkspaceName = 'Work';
    this.newWorkspaceOpen.set(true);
  }

  protected openAddItem(): void {
    if (!this.itemsEditMode()) {
      return;
    }
    this.addItemOpen.set(true);
  }

  protected chooseAddItem(type: 'link' | 'collection' | 'widget'): void {
    if (!this.itemsEditMode()) {
      return;
    }
    this.addItemOpen.set(false);
    if (type === 'link') {
      this.openQuick();
      return;
    }
    if (type === 'collection') {
      this.openGroup();
      return;
    }
    this.openWidgetEditor();
  }

  saveNewWorkspace(): void {
    const name = this.newWorkspaceName.trim();
    if (!name) {
      return;
    }
    this.state.addTab(name);
    this.newWorkspaceOpen.set(false);
    this.showToast('Workspace added');
  }

  removeQuick(i: number): void {
    this.state.removeQuickLink(i);
  }

  openQuick(): void {
    this.quickTitle = '';
    this.quickUrl = '';
    this.quickEmoji = '🔗';
    this.quickOpen.set(true);
  }
  saveQuick(): void {
    let url = this.quickUrl.trim();
    if (!this.quickTitle.trim() || !url) {
      return;
    }
    if (!url.startsWith('http')) {
      url = 'https://' + url;
    }
    this.state.addQuickLink({
      title: this.quickTitle.trim(),
      url,
      emoji: this.quickEmoji.trim() || '🔗',
      w: 1,
      h: 1,
    });
    this.quickOpen.set(false);
    this.showToast('Shortcut added');
  }

  openGroup(): void {
    this.groupTitle = '';
    this.groupEmoji = '📁';
    this.groupOpen.set(true);
  }
  saveGroup(): void {
    const title = this.groupTitle.trim();
    if (!title) {
      return;
    }
    this.state.addGroup(title, this.groupEmoji);
    this.groupOpen.set(false);
    this.showToast('Collection created');
  }

  /** True when quick-link modal has enough data to submit. */
  protected quickFormValid(): boolean {
    return !!(this.quickTitle.trim() && this.quickUrl.trim());
  }

  /** Emoji or symbol shown in add-link / new-collection previews. */
  protected emojiPreview(raw: string, fallback: string): string {
    const t = raw?.trim();
    return t && t.length > 0 ? t : fallback;
  }

  protected faviconUrl(rawUrl: string): string {
    const host = this.faviconHost(rawUrl);
    if (!host) {
      return '';
    }
    // DuckDuckGo has broader coverage for SaaS subdomains (e.g. Atlassian).
    return `https://icons.duckduckgo.com/ip3/${encodeURIComponent(host)}.ico`;
  }

  protected faviconFallbackUrl(rawUrl: string): string {
    const host = this.faviconHost(rawUrl);
    if (!host) {
      return '';
    }
    return `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(host)}`;
  }

  private faviconHost(rawUrl: string): string {
    const u = (rawUrl ?? '').trim();
    if (!u) {
      return '';
    }
    try {
      return new URL(u).hostname;
    } catch {
      return '';
    }
  }

  protected onFaviconError(ev: Event): void {
    const img = ev.target as HTMLImageElement | null;
    if (!img) {
      return;
    }
    const fallback = img.dataset['fallback'] ?? '';
    const retried = img.dataset['retry'] === '1';
    if (!retried && fallback) {
      img.dataset['retry'] = '1';
      img.src = fallback;
      return;
    }
    img.style.display = 'none';
  }

  addGroupLink(gid: string): void {
    this.groupLinkTargetId.set(gid);
    this.groupLinkEditIndex.set(null);
    this.groupLinkTitle = '';
    this.groupLinkUrl = '';
    this.groupLinkEmoji = '🔗';
    this.groupLinkOpen.set(true);
  }

  editGroupLink(gid: string, index: number): void {
    const tab = this.state.activeTab();
    const group = tab?.groups.find((entry) => entry.id === gid);
    const link = group?.links[index];
    if (!group || !link) {
      return;
    }
    this.groupLinkTargetId.set(gid);
    this.groupLinkEditIndex.set(index);
    this.groupLinkTitle = link.title;
    this.groupLinkUrl = link.url;
    this.groupLinkEmoji = link.emoji || '🔗';
    this.groupLinkOpen.set(true);
  }

  protected groupLinkFormValid(): boolean {
    return !!(this.groupLinkTitle.trim() && this.groupLinkUrl.trim());
  }

  saveGroupLink(): void {
    const gid = this.groupLinkTargetId();
    const editIndex = this.groupLinkEditIndex();
    if (!gid) {
      return;
    }
    const title = this.groupLinkTitle.trim();
    let url = this.groupLinkUrl.trim();
    if (!title || !url) {
      return;
    }
    if (!url.startsWith('http')) {
      url = 'https://' + url;
    }
    const payload = {
      title,
      url,
      emoji: this.groupLinkEmoji.trim() || '🔗',
    };
    if (editIndex === null) {
      this.state.addGroupLink(gid, payload);
    } else {
      this.state.updateGroupLink(gid, editIndex, payload);
    }
    this.groupLinkOpen.set(false);
    this.groupLinkTargetId.set(null);
    this.groupLinkEditIndex.set(null);
    this.showToast(editIndex === null ? 'Link added to collection' : 'Collection link updated');
  }

  editGroup(gid: string): void {
    const tab = this.state.activeTab();
    const g = tab?.groups.find((x) => x.id === gid);
    if (!g) {
      return;
    }
    this.groupEditTargetId.set(gid);
    this.groupEditTitle = g.title;
    this.groupEditEmoji = g.emoji || '📁';
    this.groupEditOpen.set(true);
  }

  saveGroupEdit(): void {
    const gid = this.groupEditTargetId();
    if (!gid) {
      return;
    }
    const title = this.groupEditTitle.trim();
    if (!title) {
      return;
    }
    this.state.updateGroup(gid, title, this.groupEditEmoji.trim() || '📁');
    this.groupEditOpen.set(false);
    this.groupEditTargetId.set(null);
    this.showToast('Collection updated');
  }

  protected openSizeEditor(item: DashboardItemView): void {
    if (item.type === 'link') {
      this.sizeTarget.set({ type: 'link', id: item.link.id });
      this.sizeWidth = item.link.w;
      this.sizeHeight = item.link.h;
    } else if (item.type === 'collection') {
      this.sizeTarget.set({ type: 'collection', id: item.group.id });
      this.sizeWidth = item.group.w;
      this.sizeHeight = item.group.h;
    } else {
      this.sizeTarget.set({ type: 'widget', id: item.widget.id });
      this.sizeWidth = item.widget.w;
      this.sizeHeight = item.widget.h;
    }
    this.sizeOpen.set(true);
  }

  protected sizeTitle(): string {
    const target = this.sizeTarget();
    if (!target) {
      return 'Card size';
    }
    if (target.type === 'link') {
      return 'Link size';
    }
    if (target.type === 'collection') {
      return 'Collection size';
    }
    return 'Widget size';
  }

  protected saveItemSize(): void {
    const target = this.sizeTarget();
    if (!target) {
      return;
    }
    let updated = false;
    if (target.type === 'link') {
      updated = this.state.updateQuickLinkSize(target.id, this.sizeWidth, this.sizeHeight);
    } else if (target.type === 'collection') {
      updated = this.state.updateGroupSize(target.id, this.sizeWidth, this.sizeHeight);
    } else {
      updated = this.state.updateCustomWidget(target.id, {
        w: this.sizeWidth,
        h: this.sizeHeight,
      });
    }
    if (!updated) {
      this.showToast('That size would overlap another card');
      return;
    }
    this.sizeOpen.set(false);
    this.showToast('Card size updated');
  }

  removeGroupLink(gid: string, index: number): void {
    this.state.removeGroupLink(gid, index);
    this.showToast('Link removed');
  }

  moveGroupLink(gid: string, index: number, direction: 'up' | 'down'): void {
    if (this.state.moveGroupLink(gid, index, direction)) {
      this.showToast(direction === 'up' ? 'Link moved up' : 'Link moved down');
    }
  }

  protected groupLinkModalTitle(): string {
    return this.groupLinkEditIndex() === null ? 'Add link to collection' : 'Edit collection link';
  }

  protected groupLinkModalSubtitle(): string {
    return this.groupLinkEditIndex() === null
      ? 'This link will appear under the selected collection.'
      : 'Update the label, URL, or icon for this collection link.';
  }

  protected groupLinkModalAction(): string {
    return this.groupLinkEditIndex() === null ? 'Add to collection' : 'Save changes';
  }

  deleteGroup(gid: string): void {
    if (window.confirm('Delete this group?')) {
      this.state.deleteGroup(gid);
    }
  }

  openAll(gid: string): void {
    const tab = this.state.activeTab();
    const g = tab?.groups.find((x) => x.id === gid);
    const links = g?.links ?? [];
    if (links.length === 0) {
      return;
    }
    let opened = 0;
    for (const l of links) {
      const w = window.open(l.url, '_blank');
      if (w) {
        opened++;
      }
    }
    if (opened === links.length) {
      this.showToast(`Opened ${opened} tabs`);
      return;
    }
    const blocked = links.length - opened;
    this.showToast(
      blocked === links.length
        ? 'Pop-ups blocked — allow pop-ups for this site to open all links'
        : `Opened ${opened}; ${blocked} blocked — allow pop-ups for this site to open the rest`,
    );
  }

  onTodoSubmit(ev: Event): void {
    ev.preventDefault();
    const form = ev.target as HTMLFormElement;
    const input = form.querySelector('input') as HTMLInputElement;
    const v = input?.value?.trim();
    if (v) {
      this.state.addTodo(v);
      input.value = '';
    }
  }

  toggleTodo(i: number): void {
    this.state.toggleTodo(i);
  }
  removeTodo(i: number): void {
    this.state.removeTodo(i);
  }
  clearTodos(): void {
    if (window.confirm('Clear all todos?')) {
      this.state.clearTodos();
    }
  }

  onNotesInput(value: string): void {
    if (this.notesTimer) {
      clearTimeout(this.notesTimer);
    }
    this.notesTimer = setTimeout(() => {
      this.state.setNotes(value);
      this.notesSaved.set(true);
      setTimeout(() => this.notesSaved.set(false), 1500);
    }, 450);
  }

  exportData(): void {
    const blob = new Blob([this.state.exportJson()], {
      type: 'application/json',
    });
    const a = this.doc.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'homepage-backup.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  triggerImport(input: HTMLInputElement): void {
    input.click();
  }

  onImportFile(ev: Event): void {
    const f = (ev.target as HTMLInputElement).files?.[0];
    if (!f) {
      return;
    }
    const r = new FileReader();
    r.onload = () => {
      const ok = this.state.importJson(String(r.result));
      this.showToast(ok ? 'Data imported' : 'Could not read file');
      (ev.target as HTMLInputElement).value = '';
      if (ok) {
        this.closeSettings();
      }
    };
    r.readAsText(f);
  }

  resetAll(): void {
    if (window.confirm('Erase all data?')) {
      this.state.resetAll();
      this.closeSettings();
      this.showToast('Data reset');
    }
  }

  protected logout(): void {
    this.state.clearLocalState();
    this.auth.logout();
  }

  protected openWidgetEditor(): void {
    this.editingWidgetId.set(null);
    this.widgetTitle = 'Custom widget';
    this.widgetHtml = '';
    this.widgetCss = '';
    this.widgetJs = '';
    this.widgetWidth = 4;
    this.widgetHeight = 2;
    this.widgetExample = 'blank';
    this.widgetOpen.set(true);
  }

  protected editWidget(widgetId: string): void {
    const widget = this.state.activeTab().widgets.find((w) => w.id === widgetId);
    if (!widget) {
      return;
    }
    this.editingWidgetId.set(widget.id);
    this.widgetTitle = widget.title;
    this.widgetHtml = widget.html;
    this.widgetCss = widget.css;
    this.widgetJs = widget.js;
    this.widgetWidth = widget.w;
    this.widgetHeight = widget.h;
    this.widgetExample = 'blank';
    this.widgetOpen.set(true);
  }

  protected removeWidget(widgetId: string): void {
    if (!window.confirm('Remove this custom widget?')) {
      return;
    }
    this.state.removeCustomWidget(widgetId);
    this.showToast('Widget removed');
  }

  protected dashboardItems(): DashboardItemView[] {
    const tab = this.state.activeTab();
    if (!tab) {
      return [];
    }
    return [
      ...tab.quickLinks.map((link) => ({ key: `q:${link.id}`, type: 'link' as const, link })),
      ...tab.groups.map((group) => ({ key: `g:${group.id}`, type: 'collection' as const, group })),
      ...tab.widgets.map((widget) => ({ key: `w:${widget.id}`, type: 'widget' as const, widget })),
    ].sort((a, b) => {
      const aLayout = this.itemLayout(a);
      const bLayout = this.itemLayout(b);
      if (aLayout.y !== bLayout.y) {
        return aLayout.y - bLayout.y;
      }
      if (aLayout.x !== bLayout.x) {
        return aLayout.x - bLayout.x;
      }
      return a.key.localeCompare(b.key);
    });
  }

  protected moveItem(itemKey: string, direction: MoveDirection): void {
    if (!this.itemsEditMode()) {
      return;
    }
    const tab = this.state.activeTab();
    if (!tab) {
      return;
    }
    if (!this.state.moveTabItem(tab.id, itemKey as `q:${string}` | `g:${string}` | `w:${string}`, direction)) {
      this.showToast('No open space in that direction');
    }
  }

  protected removeQuickById(id: string): void {
    const tab = this.state.activeTab();
    const idx = tab?.quickLinks.findIndex((x) => x.id === id) ?? -1;
    if (idx < 0) {
      return;
    }
    this.removeQuick(idx);
  }

  protected applyWidgetExample(exampleId: string): void {
    this.widgetExample = exampleId;
    if (exampleId === 'blank') {
      return;
    }
    const ex = this.widgetExamples().find((x) => x.id === exampleId);
    if (!ex) {
      return;
    }
    this.widgetTitle = ex.title;
    this.widgetHtml = ex.html;
    this.widgetCss = ex.css;
    this.widgetJs = ex.js;
    this.widgetWidth = ex.w;
    this.widgetHeight = ex.h;
  }

  protected saveWidget(): void {
    const title = this.widgetTitle.trim() || 'Custom widget';
    const html = this.widgetHtml.trim();
    const css = this.widgetCss.trim();
    const js = this.widgetJs.trim();
    if (!html) {
      this.showToast('Widget HTML is required');
      return;
    }
    const htmlBytes = new Blob([html]).size;
    const cssBytes = new Blob([css]).size;
    const jsBytes = new Blob([js]).size;
    const totalBytes = htmlBytes + cssBytes + jsBytes;
    if (
      htmlBytes > HomeComponent.MAX_WIDGET_HTML ||
      cssBytes > HomeComponent.MAX_WIDGET_CSS ||
      jsBytes > HomeComponent.MAX_WIDGET_JS ||
      totalBytes > HomeComponent.MAX_WIDGET_TOTAL
    ) {
      this.showToast('Widget code is too large');
      return;
    }

    const editingId = this.editingWidgetId();
    if (editingId) {
      const updated = this.state.updateCustomWidget(editingId, {
        title,
        html,
        css,
        js,
        w: this.widgetWidth,
        h: this.widgetHeight,
      });
      if (!updated) {
        this.showToast('That size would overlap another card');
        return;
      }
      this.showToast('Widget updated');
    } else {
      this.state.addCustomWidget({ title, html, css, js, stateJson: '', w: this.widgetWidth, h: this.widgetHeight });
      this.showToast('Widget added');
    }
    this.widgetOpen.set(false);
  }

  protected widgetSrcDoc(widget: CustomWidget): string {
    const safeScript = widget.js.replace(/<\/script/gi, '<\\/script');
    const bridgeScript = this.widgetBridgeScript();
    const csp = [
      "default-src 'none'",
      "script-src 'unsafe-inline'",
      "style-src 'unsafe-inline'",
      'img-src https: data:',
      'font-src https: data:',
      'connect-src https:',
      "media-src 'none'",
      "object-src 'none'",
      "frame-src 'none'",
      "worker-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
    ].join('; ');
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <style>
    html,body{margin:0;padding:0;height:100%;background:transparent;}
    *{box-sizing:border-box;}
    ${widget.css}
  </style>
</head>
<body>
  ${widget.html}
  <script>${bridgeScript}</script>
  <script>${safeScript}</script>
</body>
</html>`;
  }

  protected widgetFrameSrc(widget: CustomWidget): SafeResourceUrl {
    const html = this.widgetSrcDoc(widget);
    const key = `${widget.id}:${html}`;
    const cached = this.widgetSrcCache.get(widget.id);
    if (cached && cached.key === key) {
      return cached.url;
    }
    const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
    const trusted = this.sanitizer.bypassSecurityTrustResourceUrl(dataUrl);
    this.widgetSrcCache.set(widget.id, { key, url: trusted });
    return trusted;
  }

  protected widgetExamples(): Array<{
    id: string;
    title: string;
    html: string;
    css: string;
    js: string;
    stateJson: string;
    w: number;
    h: number;
  }> {
    return [
      {
        id: 'blank',
        title: 'Blank',
        html: '',
        css: '',
        js: '',
        stateJson: '',
        w: 4,
        h: 2,
      },
      {
        id: 'clock',
        title: 'Live Clock',
        html:
          '<div class="clock-wrap"><div class="clock-label">Local time</div><div id="clock-value" class="clock-value">--:--:--</div></div>',
        css:
          '.clock-wrap{height:100%;display:grid;place-items:center;color:#e2e8f0;font-family:system-ui,sans-serif}.clock-label{font-size:12px;opacity:.75;letter-spacing:.08em;text-transform:uppercase}.clock-value{font-size:38px;font-weight:700;letter-spacing:.04em;margin-top:6px}',
        js:
          "const el=document.getElementById('clock-value');const tick=()=>{const n=new Date();el.textContent=n.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});};tick();setInterval(tick,1000);",
        stateJson: '',
        w: 4,
        h: 2,
      },
      {
        id: 'progress',
        title: 'Progress Ring',
        html:
          '<div class="ring-wrap"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="44" class="bg"/><circle cx="60" cy="60" r="44" class="fg" id="ring"/></svg><div id="pct" class="pct">0%</div><input id="slider" type="range" min="0" max="100" value="68"/></div>',
        css:
          ".ring-wrap{height:100%;display:grid;place-items:center;color:#e2e8f0;font-family:system-ui,sans-serif;gap:10px}svg{width:120px;height:120px}circle{fill:none;stroke-width:10}.bg{stroke:#334155}.fg{stroke:#22d3ee;stroke-linecap:round;transform:rotate(-90deg);transform-origin:60px 60px;stroke-dasharray:276.46;stroke-dashoffset:276.46;transition:stroke-dashoffset .2s}.pct{font-size:20px;font-weight:700}input{width:160px;accent-color:#22d3ee}",
        js:
          "const ring=document.getElementById('ring');const pct=document.getElementById('pct');const slider=document.getElementById('slider');const C=2*Math.PI*44;function draw(v){const p=Math.max(0,Math.min(100,Number(v)||0));ring.style.strokeDashoffset=String(C-(C*p/100));pct.textContent=`${p}%`;}draw(slider.value);slider.addEventListener('input',e=>draw(e.target.value));",
        stateJson: '',
        w: 4,
        h: 2,
      },
    ];
  }

  private widgetBridgeScript(): string {
    return `(() => {
  const pending = new Map();
  function nextId() {
    return 'req_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
  function request(action, payload) {
    return new Promise((resolve, reject) => {
      const requestId = nextId();
      const timeout = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error('Widget storage request timed out.'));
      }, 5000);
      pending.set(requestId, { resolve, reject, timeout });
      window.parent.postMessage({ type: 'homepage:widget-storage', requestId, action, payload }, '*');
    });
  }
  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || data.type !== 'homepage:widget-storage-response' || typeof data.requestId !== 'string') {
      return;
    }
    const entry = pending.get(data.requestId);
    if (!entry) {
      return;
    }
    clearTimeout(entry.timeout);
    pending.delete(data.requestId);
    if (data.ok) {
      entry.resolve(data.payload ?? null);
      return;
    }
    entry.reject(new Error(data.message || 'Widget storage request failed.'));
  });
  window.homepageWidget = {
    getState() {
      return request('getState');
    },
    setState(value) {
      return request('setState', value);
    },
  };
})();`;
  }

  private widgetIdForSource(source: MessageEventSource | null): string | null {
    if (!source) {
      return null;
    }
    const frames = Array.from(this.doc.querySelectorAll('iframe.widget-frame'));
    for (const frame of frames) {
      if (!(frame instanceof HTMLIFrameElement)) {
        continue;
      }
      if (frame.contentWindow === source) {
        return frame.dataset['widgetId'] ?? null;
      }
    }
    return null;
  }

  private widgetStateValue(widgetId: string): unknown {
    const widget = this.state.activeTab().widgets.find((entry) => entry.id === widgetId);
    if (!widget?.stateJson) {
      return null;
    }
    try {
      return JSON.parse(widget.stateJson);
    } catch {
      return null;
    }
  }

  private encodeWidgetState(payload: unknown): string | null {
    try {
      const encoded = JSON.stringify(payload ?? null);
      if (new Blob([encoded]).size > HomeComponent.MAX_WIDGET_STATE_BYTES) {
        return null;
      }
      return encoded;
    } catch {
      return null;
    }
  }

  private respondToWidget(target: Window, requestId: string, ok: boolean, payload: unknown, message?: string): void {
    target.postMessage({ type: 'homepage:widget-storage-response', requestId, ok, payload, message }, '*');
  }
}
