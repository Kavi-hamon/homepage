export function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 11)}`;
}

export const DASHBOARD_GRID_COLUMNS = 12;

export interface GridItemLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type DashboardItemType = 'link' | 'collection' | 'widget';

export interface QuickLink extends GridItemLayout {
  id: string;
  title: string;
  url: string;
  emoji: string;
}

export interface GroupLink {
  title: string;
  url: string;
  emoji: string;
}

export interface LinkGroup extends GridItemLayout {
  id: string;
  title: string;
  emoji: string;
  links: GroupLink[];
}

export interface CustomWidget extends GridItemLayout {
  id: string;
  title: string;
  html: string;
  css: string;
  js: string;
  stateJson: string;
}

export interface HomepageTab {
  id: string;
  name: string;
  quickLinks: QuickLink[];
  groups: LinkGroup[];
  widgets: CustomWidget[];
}

export type ThemeId =
  | 'default'
  | 'ocean'
  | 'forest'
  | 'sunset'
  | 'rose'
  | 'amber'
  | 'light';

export type SearchEngine = 'google' | 'duckduckgo' | 'bing';

export interface HomepageSettings {
  theme: ThemeId;
  wallpaper: string;
  customWallUrl: string;
  overlay: number;
  blur: number;
  searchEngine: SearchEngine;
  showClock: boolean;
  userName: string;
}

export interface TodoItem {
  text: string;
  done: boolean;
}

export interface HomepageData {
  activeTabId: string;
  tabs: HomepageTab[];
  settings: HomepageSettings;
  todos: TodoItem[];
  notes: string;
}

export const STORAGE_KEY = 'homehub_angular_v2';

export const DASHBOARD_ITEM_LIMITS: Record<DashboardItemType, { minW: number; maxW: number; minH: number; maxH: number }> = {
  link: { minW: 1, maxW: 2, minH: 1, maxH: 2 },
  collection: { minW: 2, maxW: 6, minH: 2, maxH: 6 },
  widget: { minW: 3, maxW: 8, minH: 2, maxH: 6 },
};

export const DASHBOARD_ITEM_DEFAULTS: Record<DashboardItemType, Pick<GridItemLayout, 'w' | 'h'>> = {
  link: { w: 1, h: 1 },
  collection: { w: 3, h: 2 },
  widget: { w: 4, h: 2 },
};

export function clampDashboardColumns(value: unknown): number {
  const n = Math.round(Number(value) || DASHBOARD_GRID_COLUMNS);
  return Math.max(1, Math.min(DASHBOARD_GRID_COLUMNS, n));
}

export function clampDashboardRows(value: unknown, fallback = 1): number {
  const n = Math.round(Number(value) || fallback);
  return Math.max(1, Math.min(12, n));
}

export function clampItemLayout(
  type: DashboardItemType,
  patch: Partial<GridItemLayout>,
  base?: Partial<GridItemLayout>,
): GridItemLayout {
  const limits = DASHBOARD_ITEM_LIMITS[type];
  const defaults = DASHBOARD_ITEM_DEFAULTS[type];
  const rawW = Math.round(Number(patch.w ?? base?.w ?? defaults.w) || defaults.w);
  const w = Math.max(limits.minW, Math.min(limits.maxW, rawW, DASHBOARD_GRID_COLUMNS));
  const rawH = Math.round(Number(patch.h ?? base?.h ?? defaults.h) || defaults.h);
  const h = Math.max(limits.minH, Math.min(limits.maxH, rawH));
  const rawX = Math.round(Number(patch.x ?? base?.x ?? 0) || 0);
  const x = Math.max(0, Math.min(DASHBOARD_GRID_COLUMNS - w, rawX));
  const rawY = Math.round(Number(patch.y ?? base?.y ?? 0) || 0);
  const y = Math.max(0, rawY);
  return { x, y, w, h };
}

export const WALL_PRESETS: { id: string; label: string; class?: string; url?: string }[] = [
  { id: 'gradient-deep', label: 'Deep', class: 'gradient-deep' },
  { id: 'gradient-dusk', label: 'Dusk', class: 'gradient-dusk' },
  { id: 'gradient-moss', label: 'Moss', class: 'gradient-moss' },
  { id: 'gradient-sand', label: 'Sand', class: 'gradient-sand' },
  { id: 'gradient-aurora', label: 'Aurora', class: 'gradient-aurora' },

  { id: 'photo-lakeside', label: 'Lakeside', url: 'https://picsum.photos/id/1015/1920/1080' },
  { id: 'photo-peaks', label: 'Peaks', url: 'https://picsum.photos/id/1018/1920/1080' },
  { id: 'photo-waves', label: 'Waves', url: 'https://picsum.photos/id/1036/1920/1080' },
  { id: 'photo-canyon', label: 'Canyon', url: 'https://picsum.photos/id/1043/1920/1080' },
  { id: 'photo-skyline', label: 'Skyline', url: 'https://picsum.photos/id/1067/1920/1080' },
  { id: 'photo-mist', label: 'Mist', url: 'https://picsum.photos/id/1060/1920/1080' },
];

export const THEMES: { id: ThemeId; label: string; bodyClass?: string }[] = [
  { id: 'default', label: 'Indigo' },
  { id: 'ocean', label: 'Ocean', bodyClass: 'theme-ocean' },
  { id: 'forest', label: 'Forest', bodyClass: 'theme-forest' },
  { id: 'sunset', label: 'Sunset', bodyClass: 'theme-sunset' },
  { id: 'rose', label: 'Rose', bodyClass: 'theme-rose' },
  { id: 'amber', label: 'Amber', bodyClass: 'theme-amber' },
  { id: 'light', label: 'Light', bodyClass: 'theme-light' },
];

export const SEARCH_ENGINES: Record<SearchEngine, (q: string) => string> = {
  google: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
  duckduckgo: (q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}`,
  bing: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}`,
};

export function defaultSettings(): HomepageSettings {
  return {
    theme: 'default',
    wallpaper: 'gradient-deep',
    customWallUrl: '',
    overlay: 0.46,
    blur: 12,
    searchEngine: 'google',
    showClock: true,
    userName: '',
  };
}

export function createDefaultCustomWidgets(): CustomWidget[] {
  return [
    {
      id: 'w_clock',
      title: 'Live Clock',
      html:
        '<div class="clock-wrap"><div class="clock-label">Local time</div><div id="clock-value" class="clock-value">--:--:--</div></div>',
      css:
        '.clock-wrap{height:100%;display:grid;place-items:center;color:#e2e8f0;font-family:system-ui,sans-serif}.clock-label{font-size:12px;opacity:.75;letter-spacing:.08em;text-transform:uppercase}.clock-value{font-size:38px;font-weight:700;letter-spacing:.04em;margin-top:6px}',
      js:
        "const el=document.getElementById('clock-value');const tick=()=>{const n=new Date();el.textContent=n.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});};tick();setInterval(tick,1000);",
      stateJson: '',
      x: 0,
      y: 3,
      w: 4,
      h: 2,
    },
  ];
}

export function createDefaultTab(name = 'Home'): HomepageTab {
  const quickLinks: QuickLink[] = [
    { id: newId('q'), title: 'Search', url: 'https://www.google.com', emoji: '🔎', x: 0, y: 0, w: 1, h: 1 },
    { id: newId('q'), title: 'Mail', url: 'https://mail.google.com', emoji: '✉️', x: 1, y: 0, w: 1, h: 1 },
    { id: newId('q'), title: 'GitHub', url: 'https://github.com/', emoji: '🐙', x: 2, y: 0, w: 1, h: 1 },
    { id: newId('q'), title: 'Calendar', url: 'https://calendar.google.com', emoji: '🗓️', x: 3, y: 0, w: 1, h: 1 },
  ];
  const groups: LinkGroup[] = [
    {
      id: newId('g'),
      title: 'Workspace',
      emoji: '🧰',
      x: 0,
      y: 1,
      w: 3,
      h: 2,
      links: [
        { title: 'Docs', url: 'https://docs.google.com', emoji: '📄' },
        { title: 'Drive', url: 'https://drive.google.com', emoji: '🗂️' },
        { title: 'Meet', url: 'https://meet.google.com', emoji: '🎥' },
      ],
    },
    {
      id: newId('g'),
      title: 'Explore',
      emoji: '🧭',
      x: 3,
      y: 1,
      w: 3,
      h: 2,
      links: [
        { title: 'Maps', url: 'https://maps.google.com', emoji: '🗺️' },
        { title: 'YouTube', url: 'https://www.youtube.com', emoji: '▶️' },
        { title: 'Wikipedia', url: 'https://www.wikipedia.org', emoji: '📚' },
      ],
    },
  ];
  return {
    id: newId('t'),
    name,
    quickLinks,
    groups,
    widgets: createDefaultCustomWidgets(),
  };
}

export function defaultHomepageData(): HomepageData {
  const tab = createDefaultTab();
  return {
    activeTabId: tab.id,
    tabs: [tab],
    settings: defaultSettings(),
    todos: [],
    notes: '',
  };
}
