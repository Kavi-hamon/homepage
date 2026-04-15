import { CommonModule, DatePipe } from '@angular/common';
import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  EventEmitter,
  inject,
  PLATFORM_ID,
  signal,
  ViewChild,
  Output,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import {
  type CalendarWidget,
  type CustomWidget,
  type GridItemLayout,
  type QuickLink,
  type LinkGroup,
} from '../../../core/models/homepage.models';
import { CalendarService, type CalendarEvent } from '../../../core/services/calendar.service';
import { HomepageStateService } from '../../../core/services/homepage-state.service';
import { AuthService } from '../../../core/services/auth.service';
import { type DashboardAction, type DashboardItemView, type DashboardToken } from '../home.types';

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

@Component({
  selector: 'app-items-block',
  standalone: true,
  imports: [CommonModule, DatePipe],
  templateUrl: './items-block.component.html',
  styleUrl: './items-block.component.css',
})
export class ItemsBlockComponent {
  @Output() action = new EventEmitter<DashboardAction>();

  protected readonly state = inject(HomepageStateService);

  constructor() {
    afterNextRender(() => {
      const timer = setInterval(() => {
        if (!this.auth.checked()) return;
        clearInterval(timer);
        if (this.auth.user()) this.loadCalendarEvents();
      }, 80);
      setTimeout(() => clearInterval(timer), 15000);
    });
  }
  protected readonly auth = inject(AuthService);
  private readonly calendarSvc = inject(CalendarService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly platformId = inject(PLATFORM_ID);

  protected readonly itemsEditMode = signal(false);
  protected readonly dragPreview = signal<DragPreviewState | null>(null);
  private dragPointerOffset: DragPointerOffset | null = null;
  private readonly widgetSrcCache = new Map<string, { key: string; url: SafeResourceUrl }>();

  @ViewChild('itemsGrid') private readonly itemsGridRef?: ElementRef<HTMLElement>;

  protected readonly calendarEvents = signal<CalendarEvent[] | null>(null);
  protected readonly calendarLoading = signal(false);

  protected readonly calendarGroups = computed(() => {
    const events = this.calendarEvents();
    if (!events) return null;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 86400000);
    const weekEnd = new Date(todayStart.getTime() + 7 * 86400000);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const groups: { label: string; events: CalendarEvent[] }[] = [
      { label: 'Today', events: [] },
      { label: 'This Week', events: [] },
      { label: 'This Month', events: [] },
      { label: 'Upcoming', events: [] },
    ];
    for (const ev of events) {
      const d = new Date(ev.start);
      if (d < todayEnd) groups[0].events.push(ev);
      else if (d < weekEnd) groups[1].events.push(ev);
      else if (d < monthEnd) groups[2].events.push(ev);
      else groups[3].events.push(ev);
    }
    return groups.filter(g => g.events.length > 0);
  });

  loadCalendarEvents(): void {
    this.calendarLoading.set(true);
    this.calendarSvc.getUpcomingEvents().subscribe((events) => {
      this.calendarLoading.set(false);
      this.calendarEvents.set(events);
      if (events && events.length >= 0) {
        this.state.addCalendarWidget();
      }
    });
  }

  protected dashboardItems(): DashboardItemView[] {
    const tab = this.state.activeTab();
    if (!tab) return [];
    return [
      ...tab.quickLinks.map((link) => ({ key: `q:${link.id}`, type: 'link' as const, link })),
      ...tab.groups.map((group) => ({ key: `g:${group.id}`, type: 'collection' as const, group })),
      ...tab.widgets.map((widget) => ({ key: `w:${widget.id}`, type: 'widget' as const, widget })),
      ...tab.calendarWidgets.map((calendarWidget) => ({ key: `c:${calendarWidget.id}`, type: 'calendar' as const, calendarWidget })),
    ].sort((a, b) => {
      const aL = this.itemLayout(a);
      const bL = this.itemLayout(b);
      if (aL.y !== bL.y) return aL.y - bL.y;
      if (aL.x !== bL.x) return aL.x - bL.x;
      return a.key.localeCompare(b.key);
    });
  }

  private itemLayout(item: DashboardItemView): GridItemLayout {
    if (item.type === 'link') return item.link;
    if (item.type === 'collection') return item.group;
    if (item.type === 'calendar') return item.calendarWidget;
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
    if (!preview) return null;
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
    const previewBottom = this.dragPreview() ? this.dragPreview()!.y + this.dragPreview()!.h : 0;
    const rows = Math.max(maxBottom, previewBottom) + (this.itemsEditMode() ? 3 : 0);
    return {
      'min-height': `calc(${rows} * var(--dashboard-row) + ${Math.max(0, rows - 1)} * var(--dashboard-gap))`,
    };
  }

  protected suppressItemActivation(event: Event): void {
    if (!this.itemsEditMode()) return;
    event.preventDefault();
    event.stopPropagation();
  }

  protected faviconUrl(rawUrl: string): string {
    const host = this.faviconHost(rawUrl);
    if (!host) return '';
    return `https://icons.duckduckgo.com/ip3/${encodeURIComponent(host)}.ico`;
  }

  protected faviconFallbackUrl(rawUrl: string): string {
    const host = this.faviconHost(rawUrl);
    if (!host) return '';
    return `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(host)}`;
  }

  private faviconHost(rawUrl: string): string {
    const u = (rawUrl ?? '').trim();
    if (!u) return '';
    try { return new URL(u).hostname; } catch { return ''; }
  }

  protected onFaviconError(ev: Event): void {
    const img = ev.target as HTMLImageElement | null;
    if (!img) return;
    const fallback = img.dataset['fallback'] ?? '';
    const retried = img.dataset['retry'] === '1';
    if (!retried && fallback) {
      img.dataset['retry'] = '1';
      img.src = fallback;
      return;
    }
    img.style.display = 'none';
  }

  protected widgetFrameSrc(widget: CustomWidget): SafeResourceUrl {
    const html = this.widgetSrcDoc(widget);
    const key = `${widget.id}:${html}`;
    const cached = this.widgetSrcCache.get(widget.id);
    if (cached && cached.key === key) return cached.url;
    const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
    const trusted = this.sanitizer.bypassSecurityTrustResourceUrl(dataUrl);
    this.widgetSrcCache.set(widget.id, { key, url: trusted });
    return trusted;
  }

  private widgetSrcDoc(widget: CustomWidget): string {
    const safeScript = widget.js.replace(/<\/script/gi, '<\\/script');
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
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${csp}"><style>html,body{margin:0;padding:0;height:100%;background:transparent;}*{box-sizing:border-box;}${widget.css}</style></head><body>${widget.html}<script>${safeScript}</script></body></html>`;
  }

  // ── Drag & drop ──────────────────────────────────────────────

  private isTokenOccupied(candidate: GridItemLayout, key: DashboardToken): boolean {
    return this.dashboardItems().some((item) => {
      if (item.key === key) return false;
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
    const x = Math.max(0, Math.min(metrics.columns - layout.w, Math.floor(offsetX / Math.max(1, metrics.columnWidth + metrics.gap))));
    const y = Math.max(0, Math.floor(offsetY / Math.max(1, metrics.row + metrics.gap)));
    const candidate = { x, y, w: layout.w, h: layout.h };
    return { key: item.key as DashboardToken, ...candidate, valid: !this.isTokenOccupied(candidate, item.key as DashboardToken) };
  }

  protected onItemDragStart(item: DashboardItemView, event: DragEvent): void {
    if (!this.itemsEditMode()) { event.preventDefault(); return; }
    if (!event.dataTransfer) return;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', item.key);
    const layout = this.itemLayout(item);
    const handleRect = (event.currentTarget as HTMLElement | null)?.getBoundingClientRect?.();
    const cardRect = (event.currentTarget as HTMLElement | null)?.closest('.item-cell')?.getBoundingClientRect?.();
    if (handleRect && cardRect) {
      this.dragPointerOffset = { x: Math.max(0, event.clientX - cardRect.left), y: Math.max(0, event.clientY - cardRect.top) };
    } else {
      this.dragPointerOffset = { x: Math.max(0, event.clientX - (handleRect?.left ?? event.clientX)), y: Math.max(0, event.clientY - (handleRect?.top ?? event.clientY)) };
    }
    this.dragPreview.set({ key: item.key as DashboardToken, x: layout.x, y: layout.y, w: layout.w, h: layout.h, valid: true });
  }

  protected onGridDragOver(event: DragEvent): void {
    const preview = this.dragPreview();
    const grid = this.itemsGridRef?.nativeElement;
    if (!preview || !grid || !this.itemsEditMode()) return;
    const item = this.dashboardItems().find((entry) => entry.key === preview.key);
    if (!item) return;
    event.preventDefault();
    const next = this.previewFromPointer(event, item, grid);
    if (next) this.dragPreview.set(next);
  }

  protected onGridDrop(event: DragEvent): void {
    const preview = this.dragPreview();
    const tab = this.state.activeTab();
    if (!preview || !tab) return;
    event.preventDefault();
    if (!preview.valid || !this.state.placeTabItem(tab.id, preview.key, preview.x, preview.y)) {
      // Parent can show toast via action, but drag-drop result is self-contained
    }
    this.dragPreview.set(null);
    this.dragPointerOffset = null;
  }

  protected onItemDragEnd(): void {
    this.dragPreview.set(null);
    this.dragPointerOffset = null;
  }

  // ── Action emitters ───────────────────────────────────────────

  protected emit(act: DashboardAction): void {
    this.action.emit(act);
  }

  protected openAddItem(): void {
    if (this.itemsEditMode()) this.emit({ type: 'openAddItem' });
  }

  protected openSizeEditor(item: DashboardItemView): void {
    this.emit({ type: 'openSizeEditor', item });
  }

  protected removeQuickById(id: string): void {
    const tab = this.state.activeTab();
    const idx = tab?.quickLinks.findIndex((x) => x.id === id) ?? -1;
    if (idx >= 0) {
      this.state.removeQuickLink(idx);
    }
  }

  protected removeWidget(id: string): void {
    this.emit({ type: 'removeWidget', id });
  }

  protected removeCalendarWidget(id: string): void {
    this.emit({ type: 'removeCalendar', id });
  }

  protected editWidget(id: string): void {
    this.emit({ type: 'editWidget', id });
  }

  protected addGroupLink(gid: string): void {
    this.emit({ type: 'addGroupLink', gid });
  }

  protected editGroupLink(gid: string, index: number): void {
    this.emit({ type: 'editGroupLink', gid, index });
  }

  protected editGroup(gid: string): void {
    this.emit({ type: 'editGroup', gid });
  }

  protected deleteGroup(gid: string): void {
    this.emit({ type: 'deleteGroup', gid });
  }

  protected openAll(gid: string): void {
    this.emit({ type: 'openAll', gid });
  }

  protected moveGroupLink(gid: string, index: number, direction: 'up' | 'down'): void {
    this.emit({ type: 'moveGroupLink', gid, index, direction });
  }

  protected removeGroupLink(gid: string, index: number): void {
    this.emit({ type: 'removeGroupLink', gid, index });
  }
}
