import { Component, computed, DOCUMENT, EventEmitter, inject, Input, Output, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { THEMES, WALL_PRESETS, type ThemeId, type SearchEngine, SEARCH_ENGINES } from '../../../../core/models/homepage.models';
import { HomepageStateService } from '../../../../core/services/homepage-state.service';

const GRAD_STYLES: Record<string, string> = {
  'gradient-aurora': 'background:linear-gradient(135deg,#0a0618 0%,#1e1b4b 28%,#4c1d95 52%,#7c3aed 72%,#c4b5fd 100%)',
  'gradient-deep':   'background:linear-gradient(160deg,#020617 0%,#0f172a 38%,#1e3a8a 68%,#1d4ed8 100%)',
  'gradient-dusk':   'background:linear-gradient(175deg,#431407 0%,#9f1239 38%,#ea580c 72%,#fcd34d 100%)',
  'gradient-moss':   'background:linear-gradient(145deg,#022c22 0%,#064e3b 42%,#0d9488 78%,#6ee7b7 100%)',
  'gradient-sand':   'background:linear-gradient(155deg,#1c1917 0%,#57534e 40%,#a8a29e 75%,#f5f5f4 100%)',
};

@Component({
  selector: 'app-settings-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './settings-modal.component.html',
  styleUrl: './settings-modal.component.css',
})
export class SettingsModalComponent {
  @Input() open = false;
  @Output() closed = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<{ message: string; action: () => void }>();
  @Output() toast = new EventEmitter<string>();

  protected readonly state = inject(HomepageStateService);
  private readonly doc = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);

  protected readonly THEMES = THEMES;
  protected readonly WALL_PRESETS = WALL_PRESETS;
  protected readonly engines: SearchEngine[] = ['google', 'duckduckgo', 'bing'];

  protected wallpaperUseGradient(): boolean {
    const s = this.state.data().settings;
    if (s.wallpaper === 'custom' && s.customWallUrl) return false;
    const p = WALL_PRESETS.find(w => w.id === s.wallpaper);
    return !p?.url;
  }

  protected wallOptStyle(id: string): string {
    const p = WALL_PRESETS.find(w => w.id === id);
    if (p?.url) return `background-image:url(${p.url});background-size:cover;background-position:center;`;
    return GRAD_STYLES[id] ?? 'background:#1e293b;';
  }

  protected readonly pageUrl = computed(() => {
    if (!isPlatformBrowser(this.platformId)) return '';
    return this.doc.location?.href ?? '';
  });

  protected readonly detectedBrowser = computed(() => {
    if (!isPlatformBrowser(this.platformId)) return 'browser';
    const ua = navigator.userAgent;
    if (ua.includes('Edg/')) return 'Edge';
    if (ua.includes('OPR/') || ua.includes('Opera')) return 'Opera';
    if (ua.includes('Brave') || (navigator as Navigator & { brave?: unknown }).brave) return 'Brave';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
    if (ua.includes('Chrome')) return 'Chrome';
    return 'browser';
  });

  protected readonly homepageSteps = computed((): string[] => {
    switch (this.detectedBrowser()) {
      case 'Chrome': return ['Click the three-dot menu (⋮) in the top-right corner → Settings', 'Go to Appearance → toggle on Show home button', 'Select Enter custom web address and paste the URL below', 'Also go to On startup → Open a specific page', 'Click Add a new page and paste the URL below'];
      case 'Edge': return ['Click the three-dot menu (⋯) in the top-right corner → Settings', 'Go to Appearance → toggle on Show home button', 'Go to Start, home, and new tabs', 'Under Home button, toggle it on and select Enter custom web address', 'Paste the URL below'];
      case 'Firefox': return ['Click the three-line menu (☰) → Settings', 'Under Home, set Homepage and new windows to Custom URLs and paste the URL below', 'To show the home button: right-click the toolbar → Customize Toolbar', 'Drag the Home icon from the panel into your toolbar', 'Click Done'];
      case 'Safari': return ['Click Safari in the menu bar → Settings (or Preferences)', 'Go to the General tab', 'Paste the URL below into the Homepage field', 'The home icon appears in the toolbar automatically once a homepage is set'];
      case 'Opera': return ['Click the Opera logo → Settings', 'Go to Basic → On startup → Open a specific page', 'Enter the URL below', 'To show the home button: right-click the toolbar → Show home button'];
      case 'Brave': return ['Click the three-line menu → Settings', 'Go to Appearance → toggle on Show home button', 'Select Custom and paste the URL below', 'Also go to On startup → Open a specific page and paste the URL below'];
      default: return ['Open your browser Settings', 'Find the Appearance section and enable the Home button', 'Find the Homepage or On startup section', 'Set the homepage URL to the value below'];
    }
  });

  protected setTheme(id: ThemeId): void { this.state.setTheme(id); }
  protected setWallpaper(id: string): void { this.state.patchSettings({ wallpaper: id }); }
  protected applyCustomWall(url: string): void {
    const u = url.trim();
    this.state.patchSettings({ customWallUrl: u, wallpaper: 'custom' });
    if (u) this.toast.emit('Wallpaper updated');
  }
  protected setEngine(e: SearchEngine): void { this.state.patchSettings({ searchEngine: e }); }
  protected onOverlayInput(v: number): void { this.state.patchSettings({ overlay: v }); }
  protected onBlurInput(v: number): void { this.state.patchSettings({ blur: v }); }
  protected toggleShowClock(checked: boolean): void { this.state.patchSettings({ showClock: checked }); }
  protected setUserName(name: string): void { this.state.patchSettings({ userName: name }); }

  protected copyHomepageUrl(): void {
    if (!isPlatformBrowser(this.platformId) || !navigator.clipboard) return;
    navigator.clipboard.writeText(this.pageUrl()).then(() => this.toast.emit('URL copied to clipboard'));
  }

  protected exportData(): void {
    const blob = new Blob([this.state.exportJson()], { type: 'application/json' });
    const a = this.doc.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'homepage-backup.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  protected triggerImport(input: HTMLInputElement): void { input.click(); }

  protected onImportFile(ev: Event): void {
    const f = (ev.target as HTMLInputElement).files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      const ok = this.state.importJson(String(r.result));
      this.toast.emit(ok ? 'Data imported' : 'Could not read file');
      (ev.target as HTMLInputElement).value = '';
      if (ok) this.closed.emit();
    };
    r.readAsText(f);
  }

  protected resetAll(): void {
    this.confirm.emit({ message: 'Erase all data? This cannot be undone.', action: () => {
      this.state.resetAll();
      this.closed.emit();
      this.toast.emit('Data reset');
    }});
  }
}
