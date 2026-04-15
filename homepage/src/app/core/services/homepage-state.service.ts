import { isPlatformBrowser } from '@angular/common';
import {
  computed,
  inject,
  Injectable,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { afterNextRender } from '@angular/core';
import { catchError, of } from 'rxjs';
import {
  clampItemLayout,
  createDefaultTab,
  DASHBOARD_GRID_COLUMNS,
  DASHBOARD_ITEM_DEFAULTS,
  defaultHomepageData,
  defaultSettings,
  type CalendarWidget,
  type CustomWidget,
  type DashboardItemType,
  type GridItemLayout,
  type HomepageData,
  type HomepageSettings,
  type HomepageTab,
  type LinkGroup,
  newId,
  type QuickLink,
  STORAGE_KEY,
  type ThemeId,
} from '../models/homepage.models';
import { AuthService } from './auth.service';
import { HomepageApiService } from './homepage-api.service';

type DashboardToken = `q:${string}` | `g:${string}` | `w:${string}` | `c:${string}`;
type MoveDirection = 'up' | 'down' | 'left' | 'right';

interface LayoutEntry {
  token: DashboardToken;
  type: DashboardItemType;
  w: number;
  h: number;
  x: number | null;
  y: number | null;
}

function tokenFor(type: DashboardItemType, id: string): DashboardToken {
  if (type === 'link') {
    return `q:${id}`;
  }
  if (type === 'collection') {
    return `g:${id}`;
  }
  if (type === 'calendar') {
    return `c:${id}`;
  }
  return `w:${id}`;
}

function overlaps(a: GridItemLayout, b: GridItemLayout): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function isValidLayout(layout: Partial<GridItemLayout> | null | undefined): layout is GridItemLayout {
  if (!layout) {
    return false;
  }
  return (
    Number.isInteger(layout.x) &&
    Number.isInteger(layout.y) &&
    Number.isInteger(layout.w) &&
    Number.isInteger(layout.h) &&
    (layout.x ?? 0) >= 0 &&
    (layout.y ?? 0) >= 0 &&
    (layout.w ?? 0) >= 1 &&
    (layout.h ?? 0) >= 1
  );
}

function legacyRows(height: unknown, fallback: number): number {
  const n = Math.round(Number(height) || fallback * 140);
  return Math.max(1, Math.min(6, Math.round(n / 140)));
}

function makeLegacyLayout(type: DashboardItemType, source: Record<string, unknown>): Partial<GridItemLayout> {
  const defaults = DASHBOARD_ITEM_DEFAULTS[type];
  if (isValidLayout(source as Partial<GridItemLayout>)) {
    return source as Partial<GridItemLayout>;
  }
  const legacyWidth = Math.round(Number(source['width']) || defaults.w);
  const legacyHeight = legacyRows(source['height'], defaults.h);
  return { w: legacyWidth, h: legacyHeight };
}

function findFirstOpen(layout: Pick<GridItemLayout, 'w' | 'h'>, occupied: GridItemLayout[]): Pick<GridItemLayout, 'x' | 'y'> {
  const maxX = Math.max(0, DASHBOARD_GRID_COLUMNS - layout.w);
  let y = 0;
  while (y < 500) {
    for (let x = 0; x <= maxX; x++) {
      const candidate = { x, y, w: layout.w, h: layout.h };
      if (!occupied.some((item) => overlaps(candidate, item))) {
        return { x, y };
      }
    }
    y += 1;
  }
  return { x: 0, y };
}

function packEntries(entries: LayoutEntry[], preferredOrder: DashboardToken[]): Map<DashboardToken, GridItemLayout> {
  const priority = new Map(preferredOrder.map((token, index) => [token, index]));
  const ordered = [...entries].sort((a, b) => {
    const aOrder = priority.get(a.token) ?? Number.MAX_SAFE_INTEGER;
    const bOrder = priority.get(b.token) ?? Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }
    if (a.y !== null && b.y !== null && a.y !== b.y) {
      return a.y - b.y;
    }
    if (a.x !== null && b.x !== null && a.x !== b.x) {
      return a.x - b.x;
    }
    return a.token.localeCompare(b.token);
  });

  const placed: GridItemLayout[] = [];
  const result = new Map<DashboardToken, GridItemLayout>();

  for (const entry of ordered) {
    const base = clampItemLayout(entry.type, { w: entry.w, h: entry.h });
    const preferred = entry.x !== null && entry.y !== null
      ? clampItemLayout(entry.type, { x: entry.x, y: entry.y, w: base.w, h: base.h })
      : null;
    const finalLayout =
      preferred &&
      !placed.some((other) => overlaps(preferred, other))
        ? preferred
        : { ...base, ...findFirstOpen(base, placed) };
    placed.push(finalLayout);
    result.set(entry.token, finalLayout);
  }

  return result;
}

function normalizeQuickLink(raw: any): QuickLink {
  const layout = clampItemLayout('link', makeLegacyLayout('link', raw));
  return {
    id: raw?.id || newId('q'),
    title: String(raw?.title || 'Link'),
    url: String(raw?.url || ''),
    emoji: String(raw?.emoji || '🔗'),
    ...layout,
  };
}

function normalizeGroup(raw: any): LinkGroup {
  const layout = clampItemLayout('collection', makeLegacyLayout('collection', raw));
  return {
    id: raw?.id || newId('g'),
    title: String(raw?.title || 'Group'),
    emoji: String(raw?.emoji || '📁'),
    links: Array.isArray(raw?.links)
      ? raw.links.map((link: any) => ({
          title: String(link?.title || 'Link'),
          url: String(link?.url || ''),
          emoji: String(link?.emoji || '🔗'),
        }))
      : [],
    ...layout,
  };
}

function normalizeCalendarWidget(raw: any): CalendarWidget {
  const layout = clampItemLayout('calendar', makeLegacyLayout('calendar', raw));
  return {
    id: raw?.id || newId('c'),
    title: String(raw?.title || 'Upcoming Meetings'),
    ...layout,
  };
}

function normalizeWidget(raw: any): CustomWidget {
  const layout = clampItemLayout('widget', makeLegacyLayout('widget', raw));
  return {
    id: raw?.id || newId('w'),
    title: String(raw?.title || 'Custom widget'),
    html: String(raw?.html || ''),
    css: String(raw?.css || ''),
    js: String(raw?.js || ''),
    stateJson: typeof raw?.stateJson === 'string' ? raw.stateJson : '',
    ...layout,
  };
}

function normalizeTab(raw: any, legacyWidgets: any[] = []): HomepageTab {
  const quickLinks = Array.isArray(raw?.quickLinks) ? raw.quickLinks.map(normalizeQuickLink) : [];
  const groups = Array.isArray(raw?.groups) ? raw.groups.map(normalizeGroup) : [];
  const widgetsSource = Array.isArray(raw?.widgets) ? raw.widgets : legacyWidgets;
  const widgets = widgetsSource.map(normalizeWidget);
  const calendarWidgets: CalendarWidget[] = Array.isArray(raw?.calendarWidgets)
    ? raw.calendarWidgets.map(normalizeCalendarWidget)
    : [];
  const entries: LayoutEntry[] = [
    ...quickLinks.map((item: QuickLink) => ({ token: tokenFor('link', item.id), type: 'link' as const, w: item.w, h: item.h, x: item.x, y: item.y })),
    ...groups.map((item: LinkGroup) => ({ token: tokenFor('collection', item.id), type: 'collection' as const, w: item.w, h: item.h, x: item.x, y: item.y })),
    ...widgets.map((item: CustomWidget) => ({ token: tokenFor('widget', item.id), type: 'widget' as const, w: item.w, h: item.h, x: item.x, y: item.y })),
    ...calendarWidgets.map((item: CalendarWidget) => ({ token: tokenFor('calendar', item.id), type: 'calendar' as const, w: item.w, h: item.h, x: item.x, y: item.y })),
  ];
  const legacyOrder = Array.isArray(raw?.itemOrder) ? raw.itemOrder.filter((token: unknown): token is DashboardToken => typeof token === 'string') : [];
  const packed = packEntries(entries, legacyOrder);

  return {
    id: raw?.id || newId('t'),
    name: String(raw?.name || 'Tab'),
    quickLinks: quickLinks.map((item: QuickLink) => ({ ...item, ...packed.get(tokenFor('link', item.id))! })),
    groups: groups.map((item: LinkGroup) => ({ ...item, ...packed.get(tokenFor('collection', item.id))! })),
    widgets: widgets.map((item: CustomWidget) => ({ ...item, ...packed.get(tokenFor('widget', item.id))! })),
    calendarWidgets: calendarWidgets.map((item: CalendarWidget) => ({ ...item, ...packed.get(tokenFor('calendar', item.id))! })),
  };
}

function normalizeData(raw: unknown): HomepageData | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const source = raw as Record<string, any>;
  if (!Array.isArray(source['tabs']) || source['tabs'].length === 0) {
    return null;
  }

  const activeTabId = typeof source['activeTabId'] === 'string' ? source['activeTabId'] : '';
  const legacyWidgets = Array.isArray(source['customWidgets']) ? source['customWidgets'] : [];
  const tabs = source['tabs'].map((tab: any, index: number) =>
    normalizeTab(tab, index === 0 || tab?.id === activeTabId ? legacyWidgets : []),
  );

  return {
    activeTabId: tabs.some((tab) => tab.id === activeTabId) ? activeTabId : tabs[0].id,
    tabs,
    settings: { ...defaultSettings(), ...source['settings'] },
    todos: Array.isArray(source['todos']) ? source['todos'] : [],
    notes: typeof source['notes'] === 'string' ? source['notes'] : '',
  };
}

@Injectable({ providedIn: 'root' })
export class HomepageStateService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly api = inject(HomepageApiService);
  private readonly auth = inject(AuthService);

  private readonly _data = signal<HomepageData>(defaultHomepageData());
  readonly data = this._data.asReadonly();

  readonly activeTab = computed(() => {
    const d = this._data();
    return d.tabs.find((t) => t.id === d.activeTabId) ?? d.tabs[0];
  });

  constructor() {
    afterNextRender(() => {
      this.loadFromLocalStorage();
      const timer = setInterval(() => {
        if (!this.auth.checked()) {
          return;
        }
        clearInterval(timer);
        if (this.auth.user()) {
          this.pullFromApi();
        }
      }, 80);
      setTimeout(() => clearInterval(timer), 15000);
    });
  }

  private isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  private persist(): void {
    if (!this.isBrowser()) {
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._data()));
    } catch {
      /* ignore */
    }
  }

  private sync(): void {
    this.persist();
    if (this.auth.user()) {
      this.pushToApi();
    }
  }

  private loadFromLocalStorage(): void {
    if (!this.isBrowser()) {
      return;
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = normalizeData(JSON.parse(raw));
      if (parsed) {
        this._data.set(parsed);
      }
    } catch {
      /* ignore */
    }
  }

  clearLocalState(): void {
    this._data.set(defaultHomepageData());
    if (!this.isBrowser()) {
      return;
    }
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  pullFromApi(): void {
    this.api
      .getHomepage()
      .pipe(
        catchError(() => {
          return of(null);
        }),
      )
      .subscribe((remote) => {
        if (!remote) {
          return;
        }
        const n = normalizeData(remote);
        if (n) {
          this._data.set(n);
          this.persist();
        }
      });
  }

  pushToApi(): void {
    this.api.saveHomepage(this._data()).subscribe();
  }

  private updateActiveTab(mutator: (tab: HomepageTab) => HomepageTab): void {
    const activeTabId = this._data().activeTabId;
    this._data.update((d) => ({
      ...d,
      tabs: d.tabs.map((tab) => (tab.id === activeTabId ? mutator(tab) : tab)),
    }));
    this.sync();
  }

  private updateTabById(tabId: string, mutator: (tab: HomepageTab) => HomepageTab): void {
    this._data.update((d) => ({
      ...d,
      tabs: d.tabs.map((tab) => (tab.id === tabId ? mutator(tab) : tab)),
    }));
    this.sync();
  }

  private occupiedLayouts(tab: HomepageTab, exclude?: DashboardToken): GridItemLayout[] {
    const entries: Array<{ token: DashboardToken; layout: GridItemLayout }> = [
      ...tab.quickLinks.map((item) => ({ token: tokenFor('link', item.id), layout: item })),
      ...tab.groups.map((item) => ({ token: tokenFor('collection', item.id), layout: item })),
      ...tab.widgets.map((item) => ({ token: tokenFor('widget', item.id), layout: item })),
      ...tab.calendarWidgets.map((item) => ({ token: tokenFor('calendar', item.id), layout: item })),
    ];
    return entries.filter((entry) => entry.token !== exclude).map((entry) => entry.layout);
  }

  private nextLayout(tab: HomepageTab, type: DashboardItemType, patch?: Partial<GridItemLayout>): GridItemLayout {
    const base = clampItemLayout(type, patch ?? {});
    return { ...base, ...findFirstOpen(base, this.occupiedLayouts(tab)) };
  }

  private canPlace(tab: HomepageTab, layout: GridItemLayout, exclude?: DashboardToken): boolean {
    if (layout.x < 0 || layout.y < 0 || layout.x + layout.w > DASHBOARD_GRID_COLUMNS) {
      return false;
    }
    return !this.occupiedLayouts(tab, exclude).some((other) => overlaps(layout, other));
  }

  selectTab(id: string): void {
    if (!this._data().tabs.some((t) => t.id === id)) {
      return;
    }
    this._data.update((d) => ({ ...d, activeTabId: id }));
    this.sync();
  }

  addTab(name: string): void {
    const tab = createDefaultTab(name.trim() || 'New tab');
    tab.quickLinks = [];
    tab.groups = [];
    tab.widgets = [];
    tab.calendarWidgets = [];
    this._data.update((d) => ({
      ...d,
      tabs: [...d.tabs, tab],
      activeTabId: tab.id,
    }));
    this.sync();
  }

  renameTab(id: string, name: string): void {
    const n = name.trim();
    if (!n) {
      return;
    }
    this._data.update((d) => ({
      ...d,
      tabs: d.tabs.map((t) => (t.id === id ? { ...t, name: n } : t)),
    }));
    this.sync();
  }

  deleteTab(id: string): void {
    this._data.update((d) => {
      if (d.tabs.length <= 1) {
        return d;
      }
      const tabs = d.tabs.filter((t) => t.id !== id);
      const activeTabId = d.activeTabId === id ? tabs[0].id : d.activeTabId;
      return { ...d, tabs, activeTabId };
    });
    this.sync();
  }

  addQuickLink(link: Omit<QuickLink, 'id' | 'x' | 'y'> & Partial<GridItemLayout>): void {
    const tab = this.activeTab();
    if (!tab) {
      return;
    }
    const nextLayout = this.nextLayout(tab, 'link', link);
    const next: QuickLink = {
      id: newId('q'),
      title: link.title,
      url: link.url,
      emoji: link.emoji,
      ...nextLayout,
    };
    this.updateActiveTab((current) => ({
      ...current,
      quickLinks: [...current.quickLinks, next],
    }));
  }

  updateQuickLinkSize(linkId: string, w: number, h: number): boolean {
    let moved = false;
    this.updateActiveTab((tab) => ({
      ...tab,
      quickLinks: tab.quickLinks.map((link) => {
        if (link.id !== linkId) {
          return link;
        }
        const layout = clampItemLayout('link', { w, h }, link);
        if (!this.canPlace(tab, layout, tokenFor('link', linkId))) {
          return link;
        }
        moved = true;
        return { ...link, ...layout };
      }),
    }));
    return moved;
  }

  removeQuickLink(index: number): void {
    this.updateActiveTab((tab) => ({
      ...tab,
      quickLinks: tab.quickLinks.filter((_, i) => i !== index),
    }));
  }

  addGroup(title: string, emoji: string): void {
    const tab = this.activeTab();
    if (!tab) {
      return;
    }
    const group: LinkGroup = {
      id: newId('g'),
      title: title.trim() || 'Group',
      emoji: emoji || '📁',
      links: [],
      ...this.nextLayout(tab, 'collection'),
    };
    this.updateActiveTab((current) => ({
      ...current,
      groups: [...current.groups, group],
    }));
  }

  updateGroup(groupId: string, title: string, emoji: string): void {
    this.updateActiveTab((tab) => ({
      ...tab,
      groups: tab.groups.map((group) =>
        group.id === groupId ? { ...group, title: title.trim() || group.title, emoji: emoji || group.emoji } : group,
      ),
    }));
  }

  updateGroupSize(groupId: string, w: number, h: number): boolean {
    let moved = false;
    this.updateActiveTab((tab) => ({
      ...tab,
      groups: tab.groups.map((group) => {
        if (group.id !== groupId) {
          return group;
        }
        const layout = clampItemLayout('collection', { w, h }, group);
        if (!this.canPlace(tab, layout, tokenFor('collection', groupId))) {
          return group;
        }
        moved = true;
        return { ...group, ...layout };
      }),
    }));
    return moved;
  }

  deleteGroup(groupId: string): void {
    this.updateActiveTab((tab) => ({
      ...tab,
      groups: tab.groups.filter((group) => group.id !== groupId),
    }));
  }

  addGroupLink(groupId: string, link: { title: string; url: string; emoji: string }): void {
    let url = link.url.trim();
    if (url && !url.startsWith('http')) {
      url = 'https://' + url;
    }
    this.updateActiveTab((tab) => ({
      ...tab,
      groups: tab.groups.map((group) =>
        group.id === groupId
          ? {
              ...group,
              links: [
                ...group.links,
                {
                  title: link.title.trim() || 'Link',
                  url,
                  emoji: link.emoji || '🔗',
                },
              ],
            }
          : group,
      ),
    }));
  }

  updateGroupLink(groupId: string, linkIndex: number, link: { title: string; url: string; emoji: string }): void {
    let url = link.url.trim();
    if (url && !url.startsWith('http')) {
      url = 'https://' + url;
    }
    this.updateActiveTab((tab) => ({
      ...tab,
      groups: tab.groups.map((group) =>
        group.id === groupId
          ? {
              ...group,
              links: group.links.map((existing, index) =>
                index === linkIndex
                  ? {
                      ...existing,
                      title: link.title.trim() || 'Link',
                      url,
                      emoji: link.emoji || '🔗',
                    }
                  : existing,
              ),
            }
          : group,
      ),
    }));
  }

  moveGroupLink(groupId: string, linkIndex: number, direction: 'up' | 'down'): boolean {
    const group = this.activeTab()?.groups.find((entry) => entry.id === groupId);
    if (!group) {
      return false;
    }
    const targetIndex = direction === 'up' ? linkIndex - 1 : linkIndex + 1;
    if (linkIndex < 0 || targetIndex < 0 || linkIndex >= group.links.length || targetIndex >= group.links.length) {
      return false;
    }
    this.updateActiveTab((tab) => ({
      ...tab,
      groups: tab.groups.map((entry) => {
        if (entry.id !== groupId) {
          return entry;
        }
        const links = [...entry.links];
        const [moved] = links.splice(linkIndex, 1);
        links.splice(targetIndex, 0, moved);
        return { ...entry, links };
      }),
    }));
    return true;
  }

  removeGroupLink(groupId: string, linkIndex: number): void {
    this.updateActiveTab((tab) => ({
      ...tab,
      groups: tab.groups.map((group) =>
        group.id === groupId
          ? { ...group, links: group.links.filter((_, i) => i !== linkIndex) }
          : group,
      ),
    }));
  }

  patchSettings(patch: Partial<HomepageSettings>): void {
    this._data.update((d) => ({
      ...d,
      settings: { ...d.settings, ...patch },
    }));
    this.sync();
  }

  setTheme(theme: ThemeId): void {
    this.patchSettings({ theme });
  }

  addTodo(text: string): void {
    const t = text.trim();
    if (!t) {
      return;
    }
    this._data.update((d) => ({
      ...d,
      todos: [{ text: t, done: false }, ...d.todos],
    }));
    this.sync();
  }

  toggleTodo(index: number): void {
    this._data.update((d) => {
      const todos = [...d.todos];
      if (todos[index]) {
        todos[index] = { ...todos[index], done: !todos[index].done };
      }
      return { ...d, todos };
    });
    this.sync();
  }

  removeTodo(index: number): void {
    this._data.update((d) => ({
      ...d,
      todos: d.todos.filter((_, i) => i !== index),
    }));
    this.sync();
  }

  clearTodos(): void {
    this._data.update((d) => ({ ...d, todos: [] }));
    this.sync();
  }

  setNotes(notes: string): void {
    this._data.update((d) => ({ ...d, notes }));
    this.persist();
    if (this.auth.user()) {
      this.debouncedPush();
    }
  }

  addCustomWidget(widget: Omit<CustomWidget, 'id' | 'x' | 'y'> & Partial<GridItemLayout>): void {
    const tab = this.activeTab();
    if (!tab) {
      return;
    }
    const next: CustomWidget = {
      id: newId('w'),
      title: widget.title,
      html: widget.html,
      css: widget.css,
      js: widget.js,
      stateJson: widget.stateJson ?? '',
      ...this.nextLayout(tab, 'widget', widget),
    };
    this.updateActiveTab((current) => ({
      ...current,
      widgets: [...current.widgets, next],
    }));
  }

  updateCustomWidget(widgetId: string, patch: Partial<Omit<CustomWidget, 'id'>>): boolean {
    let moved = false;
    this.updateActiveTab((tab) => ({
      ...tab,
      widgets: tab.widgets.map((widget) => {
        if (widget.id !== widgetId) {
          return widget;
        }
        const layout = clampItemLayout('widget', patch, widget);
        if (!this.canPlace(tab, layout, tokenFor('widget', widgetId))) {
          return widget;
        }
        moved = true;
        return {
          ...widget,
          ...patch,
          ...layout,
        };
      }),
    }));
    return moved;
  }

  removeCustomWidget(widgetId: string): void {
    this.updateActiveTab((tab) => ({
      ...tab,
      widgets: tab.widgets.filter((widget) => widget.id !== widgetId),
    }));
  }

  addCalendarWidget(): void {
    const tab = this.activeTab();
    if (!tab || tab.calendarWidgets.length > 0) {
      return;
    }
    const next: CalendarWidget = {
      id: newId('c'),
      title: 'Upcoming Meetings',
      ...this.nextLayout(tab, 'calendar'),
    };
    this.updateActiveTab((current) => ({
      ...current,
      calendarWidgets: [...current.calendarWidgets, next],
    }));
  }

  removeCalendarWidget(widgetId: string): void {
    this.updateActiveTab((tab) => ({
      ...tab,
      calendarWidgets: tab.calendarWidgets.filter((w) => w.id !== widgetId),
    }));
  }

  updateCustomWidgetState(widgetId: string, stateJson: string): void {
    this.updateActiveTab((tab) => ({
      ...tab,
      widgets: tab.widgets.map((widget) => (widget.id === widgetId ? { ...widget, stateJson } : widget)),
    }));
  }

  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private debouncedPush(): void {
    if (this.pushTimer) {
      clearTimeout(this.pushTimer);
    }
    this.pushTimer = setTimeout(() => {
      this.pushTimer = null;
      this.pushToApi();
    }, 800);
  }

  exportJson(): string {
    return JSON.stringify(this._data(), null, 2);
  }

  importJson(json: string): boolean {
    try {
      const n = normalizeData(JSON.parse(json));
      if (!n) {
        return false;
      }
      this._data.set(n);
      this.sync();
      return true;
    } catch {
      return false;
    }
  }

  resetAll(): void {
    this._data.set(defaultHomepageData());
    this.sync();
  }

  moveTabItem(tabId: string, token: DashboardToken, direction: MoveDirection): boolean {
    let moved = false;
    this.updateTabById(tabId, (tab) => {
      const delta =
        direction === 'left'
          ? { x: -1, y: 0 }
          : direction === 'right'
            ? { x: 1, y: 0 }
            : direction === 'up'
              ? { x: 0, y: -1 }
              : { x: 0, y: 1 };

      const mutate = <T extends GridItemLayout & { id: string }>(
        items: T[],
        type: DashboardItemType,
      ): T[] =>
        items.map((item) => {
          if (tokenFor(type, item.id) !== token) {
            return item;
          }
          const layout = clampItemLayout(type, { x: item.x + delta.x, y: item.y + delta.y }, item);
          if (layout.x === item.x && layout.y === item.y) {
            return item;
          }
          if (!this.canPlace(tab, layout, token)) {
            return item;
          }
          moved = true;
          return { ...item, ...layout };
        });

      return {
        ...tab,
        quickLinks: mutate(tab.quickLinks, 'link'),
        groups: mutate(tab.groups, 'collection'),
        widgets: mutate(tab.widgets, 'widget'),
        calendarWidgets: mutate(tab.calendarWidgets, 'calendar'),
      };
    });
    return moved;
  }

  placeTabItem(tabId: string, token: DashboardToken, x: number, y: number): boolean {
    let moved = false;
    this.updateTabById(tabId, (tab) => {
      const mutate = <T extends GridItemLayout & { id: string }>(
        items: T[],
        type: DashboardItemType,
      ): T[] =>
        items.map((item) => {
          if (tokenFor(type, item.id) !== token) {
            return item;
          }
          const layout = clampItemLayout(type, { x, y }, item);
          if (layout.x === item.x && layout.y === item.y) {
            return item;
          }
          if (!this.canPlace(tab, layout, token)) {
            return item;
          }
          moved = true;
          return { ...item, ...layout };
        });

      return {
        ...tab,
        quickLinks: mutate(tab.quickLinks, 'link'),
        groups: mutate(tab.groups, 'collection'),
        widgets: mutate(tab.widgets, 'widget'),
        calendarWidgets: mutate(tab.calendarWidgets, 'calendar'),
      };
    });
    return moved;
  }
}
