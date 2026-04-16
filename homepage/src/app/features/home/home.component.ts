import { CommonModule, isPlatformBrowser } from '@angular/common';
import {
  afterNextRender,
  Component,
  computed,
  DOCUMENT,
  HostListener,
  inject,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { SEARCH_ENGINES, WALL_PRESETS } from '../../core/models/homepage.models';
import { AuthService } from '../../core/services/auth.service';
import { HomepageStateService } from '../../core/services/homepage-state.service';
import type { DashboardAction } from './home.types';
import { ItemsBlockComponent } from './items-block/items-block.component';
import { ConfirmDialogComponent } from './modals/confirm-dialog/confirm-dialog.component';
import { SettingsModalComponent } from './modals/settings-modal/settings-modal.component';
import { WorkspaceModalComponent } from './modals/workspace-modal/workspace-modal.component';
import { AddItemModalComponent, type AddItemChoice } from './modals/add-item-modal/add-item-modal.component';
import { QuickLinkModalComponent, type QuickLinkResult } from './modals/quick-link-modal/quick-link-modal.component';
import { CollectionModalsComponent, type GroupData, type GroupLinkData } from './modals/collection-modals/collection-modals.component';
import { WidgetModalComponent, type WidgetData } from './modals/widget-modal/widget-modal.component';
import { SizeModalComponent, type SizeResult, type SizeTarget } from './modals/size-modal/size-modal.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule, RouterLink,
    ItemsBlockComponent,
    ConfirmDialogComponent, SettingsModalComponent, WorkspaceModalComponent,
    AddItemModalComponent, QuickLinkModalComponent, CollectionModalsComponent,
    WidgetModalComponent, SizeModalComponent,
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
})
export class HomeComponent {
  private static readonly MAX_WIDGET_STATE_BYTES = 25_000;

  private readonly doc = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);
  protected readonly state = inject(HomepageStateService);
  protected readonly auth = inject(AuthService);

  // ── Toast & scroll ───────────────────────────────────────────
  protected readonly toast = signal<string | null>(null);
  private toastClear: ReturnType<typeof setTimeout> | null = null;
  protected readonly scrollFabVisible = signal(false);
  protected readonly searchKbd = signal('Ctrl+K');

  // ── Clock & greeting ─────────────────────────────────────────
  protected clock = signal('');
  protected dateLine = signal('');

  protected readonly greetingLine = computed(() => {
    const s = this.state.data().settings;
    if (!s.showClock) return '';
    const h = new Date().getHours();
    let g = 'Good evening';
    if (h < 12) g = 'Good morning';
    else if (h < 17) g = 'Good afternoon';
    const n = (s.userName || '').trim();
    return n ? `${g}, ${n}` : g;
  });

  // ── Wallpaper ────────────────────────────────────────────────
  wallpaperBgImage(): string {
    const s = this.state.data().settings;
    if (s.wallpaper === 'custom' && s.customWallUrl) {
      return `url("${s.customWallUrl.replace(/"/g, '\\"')}")`;
    }
    const p = WALL_PRESETS.find(w => w.id === s.wallpaper);
    if (p?.url) return `url("${p.url}")`;
    return 'none';
  }

  wallpaperUseGradient(): boolean { return this.wallpaperBgImage() === 'none'; }

  wallpaperGradientClass(): string {
    const id = this.state.data().settings.wallpaper;
    const p = WALL_PRESETS.find(w => w.id === id);
    return p?.class ?? 'gradient-deep';
  }

  private wallpaperIsPhoto(): boolean {
    const s = this.state.data().settings;
    if (s.wallpaper === 'custom' && s.customWallUrl?.trim()) return true;
    return !!WALL_PRESETS.find(w => w.id === s.wallpaper)?.url;
  }

  protected wallpaperPhotoStyles(): Record<string, string> {
    if (this.wallpaperUseGradient()) return {};
    return {
      'background-image': this.wallpaperBgImage(),
      'background-size': 'cover',
      'background-position': 'center',
    };
  }

  protected readonly overlayBg = computed(() => {
    const s = this.state.data().settings;
    const glass = s.theme === 'glass';
    const photo = this.wallpaperIsPhoto();
    const glassMin = photo ? 0.62 : 0.48;
    const raw = Math.max(glass ? glassMin : 0.3, Math.min(0.92, s.overlay));
    const t = (raw - 0.3) / 0.62;
    const light = s.theme === 'light';
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
    return light ? `rgba(248, 250, 252, ${o})` : `rgba(2, 6, 15, ${o})`;
  });

  protected readonly blurPx = computed(() => {
    let b = this.state.data().settings.blur;
    const light = this.state.data().settings.theme === 'light';
    if (this.wallpaperIsPhoto()) {
      b = Math.round(b * (light ? 0.52 : 0.36));
      b = Math.min(12, Math.max(0, b));
    } else {
      b = Math.round(b * 0.36);
      b = Math.min(7, Math.max(0, b));
    }
    return `${b}px`;
  });

  // ── Modal signals ────────────────────────────────────────────
  protected settingsOpen = signal(false);
  protected confirmDialog = signal<{ message: string; action: () => void } | null>(null);
  protected tabEditOpen = signal(false);
  protected editingTabId = signal<string | null>(null);
  protected tabNameDraft = '';
  protected newWorkspaceOpen = signal(false);
  protected addItemOpen = signal(false);
  protected quickOpen = signal(false);
  protected groupOpen = signal(false);
  protected groupEditOpen = signal(false);
  protected groupEditTargetId = signal<string | null>(null);
  protected groupLinkOpen = signal(false);
  protected groupLinkTargetId = signal<string | null>(null);
  protected groupLinkEditIndex = signal<number | null>(null);
  protected widgetOpen = signal(false);
  protected editingWidgetId = signal<string | null>(null);
  protected sizeOpen = signal(false);
  protected sizeTarget = signal<SizeTarget | null>(null);
  protected sizeInitialWidth = 1;
  protected sizeInitialHeight = 1;

  // ── Constructor ──────────────────────────────────────────────
  constructor() {
    afterNextRender(() => {
      this.tickClock();
      setInterval(() => this.tickClock(), 1000);
      if (typeof navigator !== 'undefined') {
        this.searchKbd.set(/Mac|iPhone|iPad|iPod/i.test(navigator.userAgent) ? '⌘K' : 'Ctrl+K');
      }
    });
  }

  // ── Clock ────────────────────────────────────────────────────
  private tickClock(): void {
    const n = new Date();
    const use12HourClock = this.state.data().settings.clockFormat === '12h';
    this.clock.set(n.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: use12HourClock,
    }));
    this.dateLine.set(n.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }));
  }

  // ── Toast ────────────────────────────────────────────────────
  protected showToast(message: string): void {
    if (this.toastClear) clearTimeout(this.toastClear);
    this.toast.set(message);
    this.toastClear = setTimeout(() => { this.toast.set(null); this.toastClear = null; }, 2600);
  }

  // ── Confirm dialog ───────────────────────────────────────────
  protected openConfirm(message: string, action: () => void): void { this.confirmDialog.set({ message, action }); }
  protected closeConfirm(): void { this.confirmDialog.set(null); }
  protected runConfirm(): void { this.confirmDialog()?.action(); this.confirmDialog.set(null); }

  // ── Keyboard & scroll ────────────────────────────────────────
  @HostListener('document:keydown', ['$event'])
  protected onGlobalKeydown(e: KeyboardEvent): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) {
      if (e.key === '/' || (e.key === 'k' && (e.metaKey || e.ctrlKey))) return;
      if (e.key === 'Escape' && this.anyModalOpen()) { e.preventDefault(); this.closeTopModal(); }
      return;
    }
    if (e.key === 'Escape' && this.anyModalOpen()) { e.preventDefault(); this.closeTopModal(); return; }
    if (e.key === '/' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); this.focusSearch(); return; }
    if (e.key === 'k' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); this.focusSearch(); }
  }

  private anyModalOpen(): boolean {
    return this.settingsOpen() || this.tabEditOpen() || this.addItemOpen() || this.quickOpen() ||
      this.groupOpen() || this.groupEditOpen() || this.groupLinkOpen() || this.newWorkspaceOpen() ||
      this.widgetOpen() || this.sizeOpen() || !!this.confirmDialog();
  }

  private closeTopModal(): void {
    if (this.widgetOpen()) { this.widgetOpen.set(false); }
    else if (this.sizeOpen()) { this.sizeOpen.set(false); }
    else if (this.addItemOpen()) { this.addItemOpen.set(false); }
    else if (this.groupLinkOpen()) { this.groupLinkOpen.set(false); }
    else if (this.groupEditOpen()) { this.groupEditOpen.set(false); }
    else if (this.groupOpen()) { this.groupOpen.set(false); }
    else if (this.quickOpen()) { this.quickOpen.set(false); }
    else if (this.tabEditOpen()) { this.tabEditOpen.set(false); }
    else if (this.settingsOpen()) { this.settingsOpen.set(false); }
    else if (this.confirmDialog()) { this.closeConfirm(); }
  }

  private focusSearch(): void {
    const el = this.doc.getElementById('app-search-input') as HTMLInputElement | null;
    el?.focus();
    el?.select();
  }

  @HostListener('window:scroll')
  protected onWindowScroll(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.scrollFabVisible.set(window.scrollY > 380);
  }

  protected scrollToTop(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  }

  // ── Search ───────────────────────────────────────────────────
  protected onSearchEnter(query: string): void {
    const q = query.trim();
    if (!q) return;
    window.location.href = SEARCH_ENGINES[this.state.data().settings.searchEngine](q);
  }

  // ── Auth ─────────────────────────────────────────────────────
  protected logout(): void { this.state.clearLocalState(); this.auth.logout(); }

  // ── Tab management ───────────────────────────────────────────
  protected selectTab(id: string): void { this.state.selectTab(id); }

  protected openTabEdit(id: string, name: string): void {
    this.editingTabId.set(id);
    this.tabNameDraft = name;
    this.tabEditOpen.set(true);
  }

  protected onTabNameSaved(name: string): void {
    const id = this.editingTabId();
    if (id) { this.state.renameTab(id, name); this.showToast('Workspace updated'); }
    this.tabEditOpen.set(false);
  }

  protected onTabDeleted(): void {
    const id = this.editingTabId();
    if (id) this.state.deleteTab(id);
    this.tabEditOpen.set(false);
  }

  protected addTab(): void { this.newWorkspaceOpen.set(true); }

  protected onNewWorkspaceSaved(name: string): void {
    this.state.addTab(name);
    this.newWorkspaceOpen.set(false);
    this.showToast('Workspace added');
  }

  // ── DashboardAction handler ──────────────────────────────────
  protected onDashboardAction(act: DashboardAction): void {
    switch (act.type) {
      case 'openAddItem':
        this.addItemOpen.set(true);
        break;
      case 'openSizeEditor': {
        const item = act.item;
        if (item.type === 'link') {
          this.sizeTarget.set({ type: 'link', id: item.link.id });
          this.sizeInitialWidth = item.link.w; this.sizeInitialHeight = item.link.h;
        } else if (item.type === 'collection') {
          this.sizeTarget.set({ type: 'collection', id: item.group.id });
          this.sizeInitialWidth = item.group.w; this.sizeInitialHeight = item.group.h;
        } else if (item.type === 'calendar') {
          this.sizeTarget.set({ type: 'widget', id: item.calendarWidget.id });
          this.sizeInitialWidth = item.calendarWidget.w; this.sizeInitialHeight = item.calendarWidget.h;
        } else {
          this.sizeTarget.set({ type: 'widget', id: item.widget.id });
          this.sizeInitialWidth = item.widget.w; this.sizeInitialHeight = item.widget.h;
        }
        this.sizeOpen.set(true);
        break;
      }
      case 'removeWidget':
        this.openConfirm('Remove this widget?', () => { this.state.removeCustomWidget(act.id); this.showToast('Widget removed'); });
        break;
      case 'removeCalendar':
        this.openConfirm('Remove the meetings widget?', () => { this.state.removeCalendarWidget(act.id); this.showToast('Meetings widget removed'); });
        break;
      case 'editWidget':
        this.editingWidgetId.set(act.id);
        this.widgetOpen.set(true);
        break;
      case 'addGroupLink':
        this.groupLinkTargetId.set(act.gid);
        this.groupLinkEditIndex.set(null);
        this.groupLinkOpen.set(true);
        break;
      case 'editGroupLink':
        this.groupLinkTargetId.set(act.gid);
        this.groupLinkEditIndex.set(act.index);
        this.groupLinkOpen.set(true);
        break;
      case 'editGroup':
        this.groupEditTargetId.set(act.gid);
        this.groupEditOpen.set(true);
        break;
      case 'deleteGroup':
        this.openConfirm('Delete this collection?', () => { this.state.deleteGroup(act.gid); });
        break;
      case 'openAll': {
        const tab = this.state.activeTab();
        const g = tab?.groups.find(x => x.id === act.gid);
        const links = g?.links ?? [];
        if (links.length === 0) break;
        let opened = 0;
        for (const l of links) { if (window.open(l.url, '_blank')) opened++; }
        const blocked = links.length - opened;
        if (blocked === 0) this.showToast(`Opened ${opened} tabs`);
        else if (blocked === links.length) this.showToast('Pop-ups blocked — allow pop-ups for this site to open all links');
        else this.showToast(`Opened ${opened}; ${blocked} blocked — allow pop-ups for this site to open the rest`);
        break;
      }
      case 'moveGroupLink':
        if (this.state.moveGroupLink(act.gid, act.index, act.direction)) {
          this.showToast(act.direction === 'up' ? 'Link moved up' : 'Link moved down');
        }
        break;
      case 'removeGroupLink':
        this.state.removeGroupLink(act.gid, act.index);
        this.showToast('Link removed');
        break;
    }
  }

  // ── Add item choice ──────────────────────────────────────────
  protected onAddItemChose(choice: AddItemChoice): void {
    this.addItemOpen.set(false);
    if (choice === 'link') { this.quickOpen.set(true); return; }
    if (choice === 'collection') { this.groupOpen.set(true); return; }
    if (choice === 'widget') { this.editingWidgetId.set(null); this.widgetOpen.set(true); return; }
    if (choice === 'calendar') {
      this.state.addCalendarWidget();
      this.showToast('Meetings widget added');
    }
  }

  // ── Quick link ───────────────────────────────────────────────
  protected onQuickLinkSaved(result: QuickLinkResult): void {
    this.state.addQuickLink(result);
    this.quickOpen.set(false);
    this.showToast('Shortcut added');
  }

  // ── Collection ───────────────────────────────────────────────
  protected onGroupSaved(data: GroupData): void {
    this.state.addGroup(data.title, data.emoji);
    this.groupOpen.set(false);
    this.showToast('Collection created');
  }

  protected onGroupEditSaved(data: GroupData): void {
    const gid = this.groupEditTargetId();
    if (gid) { this.state.updateGroup(gid, data.title, data.emoji); this.showToast('Collection updated'); }
    this.groupEditOpen.set(false);
    this.groupEditTargetId.set(null);
  }

  protected onGroupLinkSaved(event: { data: GroupLinkData; editIndex: number | null }): void {
    const gid = this.groupLinkTargetId();
    if (!gid) return;
    if (event.editIndex === null) {
      this.state.addGroupLink(gid, event.data);
      this.showToast('Link added to collection');
    } else {
      this.state.updateGroupLink(gid, event.editIndex, event.data);
      this.showToast('Collection link updated');
    }
    this.groupLinkOpen.set(false);
    this.groupLinkTargetId.set(null);
    this.groupLinkEditIndex.set(null);
  }

  // ── Widget ───────────────────────────────────────────────────
  protected onWidgetSaved(event: { id: string | null; data: WidgetData }): void {
    if (event.id) {
      const updated = this.state.updateCustomWidget(event.id, event.data);
      if (!updated) { this.showToast('That size would overlap another card'); return; }
      this.showToast('Widget updated');
    } else {
      this.state.addCustomWidget({ ...event.data, stateJson: '' });
      this.showToast('Widget added');
    }
    this.widgetOpen.set(false);
  }

  // ── Size ─────────────────────────────────────────────────────
  protected onSizeSaved(result: SizeResult): void {
    let updated = false;
    if (result.target.type === 'link') {
      updated = this.state.updateQuickLinkSize(result.target.id, result.w, result.h);
    } else if (result.target.type === 'collection') {
      updated = this.state.updateGroupSize(result.target.id, result.w, result.h);
    } else {
      updated = this.state.updateCustomWidget(result.target.id, { w: result.w, h: result.h });
    }
    if (!updated) { this.showToast('That size would overlap another card'); return; }
    this.sizeOpen.set(false);
    this.showToast('Card size updated');
  }

  // ── Widget bridge ────────────────────────────────────────────
  @HostListener('window:message', ['$event'])
  protected onWidgetMessage(event: MessageEvent): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const widgetId = this.widgetIdForSource(event.source);
    if (!widgetId) return;
    const data = event.data as { type: string; requestId: string; action: string; payload?: unknown } | null;
    if (!data || data.type !== 'homepage:widget-storage' || typeof data.requestId !== 'string' ||
      (data.action !== 'getState' && data.action !== 'setState')) return;
    if (data.action === 'getState') {
      this.respondToWidget(event.source as Window, data.requestId, true, this.widgetStateValue(widgetId));
      return;
    }
    const encoded = this.encodeWidgetState(data.payload);
    if (encoded === null) {
      this.respondToWidget(event.source as Window, data.requestId, false, null, 'That widget data is too large or invalid to save.');
      return;
    }
    this.state.updateCustomWidgetState(widgetId, encoded);
    this.respondToWidget(event.source as Window, data.requestId, true, data.payload ?? null);
  }

  private widgetIdForSource(source: MessageEventSource | null): string | null {
    if (!source) return null;
    const frames = Array.from(this.doc.querySelectorAll('iframe.widget-frame'));
    for (const frame of frames) {
      if (frame instanceof HTMLIFrameElement && frame.contentWindow === source) {
        return frame.dataset['widgetId'] ?? null;
      }
    }
    return null;
  }

  private widgetStateValue(widgetId: string): unknown {
    const widget = this.state.activeTab().widgets.find(entry => entry.id === widgetId);
    if (!widget?.stateJson) return null;
    try { return JSON.parse(widget.stateJson); } catch { return null; }
  }

  private encodeWidgetState(payload: unknown): string | null {
    try {
      const encoded = JSON.stringify(payload ?? null);
      if (new Blob([encoded]).size > HomeComponent.MAX_WIDGET_STATE_BYTES) return null;
      return encoded;
    } catch { return null; }
  }

  private respondToWidget(target: Window, requestId: string, ok: boolean, payload: unknown, message?: string): void {
    target.postMessage({ type: 'homepage:widget-storage-response', requestId, ok, payload, message }, '*');
  }
}
