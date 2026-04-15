import { Component, EventEmitter, inject, Input, OnChanges, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HomepageStateService } from '../../../../core/services/homepage-state.service';

export interface WidgetData { title: string; html: string; css: string; js: string; w: number; h: number; }

@Component({
  selector: 'app-widget-modal',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './widget-modal.component.html',
  styleUrl: './widget-modal.component.css',
})
export class WidgetModalComponent implements OnChanges {
  private readonly state = inject(HomepageStateService);

  private static readonly MAX_HTML = 50_000;
  private static readonly MAX_CSS = 25_000;
  private static readonly MAX_JS = 50_000;
  private static readonly MAX_TOTAL = 100_000;

  @Input() open = false;
  @Input() editingWidgetId: string | null = null;
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<{ id: string | null; data: WidgetData }>();
  @Output() toast = new EventEmitter<string>();

  protected title = 'Custom widget';
  protected html = '';
  protected css = '';
  protected js = '';
  protected width = 4;
  protected height = 2;
  protected example = 'blank';

  protected readonly widgetAiPrompt = `Create a custom homepage widget using plain HTML, CSS and JavaScript.\n\nConstraints:\n- The widget runs inside a sandboxed iframe.\n- Do not use form submission.\n- Do not use localStorage.\n- Use window.homepageWidget.getState() and window.homepageWidget.setState(value) for persistence.\n- State must be JSON-serializable.\n- Keep the UI self-contained inside the widget.\n\nReturn output in three sections:\n1. HTML\n2. CSS\n3. JavaScript`;
  protected readonly widgetBridgeExample = `const saved = await window.homepageWidget.getState();\nawait window.homepageWidget.setState({ todos: [] });`;

  ngOnChanges(): void {
    if (this.open) {
      if (this.editingWidgetId) {
        const widget = this.state.activeTab().widgets.find(w => w.id === this.editingWidgetId);
        if (widget) {
          this.title = widget.title;
          this.html = widget.html;
          this.css = widget.css;
          this.js = widget.js;
          this.width = widget.w;
          this.height = widget.h;
          this.example = 'blank';
          return;
        }
      }
      this.title = 'Custom widget';
      this.html = '';
      this.css = '';
      this.js = '';
      this.width = 4;
      this.height = 2;
      this.example = 'blank';
    }
  }

  protected applyExample(exampleId: string): void {
    this.example = exampleId;
    if (exampleId === 'blank') return;
    const ex = this.examples().find(x => x.id === exampleId);
    if (!ex) return;
    this.title = ex.title; this.html = ex.html; this.css = ex.css; this.js = ex.js;
    this.width = ex.w; this.height = ex.h;
  }

  protected save(): void {
    const title = this.title.trim() || 'Custom widget';
    const html = this.html.trim();
    const css = this.css.trim();
    const js = this.js.trim();
    if (!html) { this.toast.emit('Widget HTML is required'); return; }
    const htmlBytes = new Blob([html]).size;
    const cssBytes = new Blob([css]).size;
    const jsBytes = new Blob([js]).size;
    if (htmlBytes > WidgetModalComponent.MAX_HTML || cssBytes > WidgetModalComponent.MAX_CSS || jsBytes > WidgetModalComponent.MAX_JS || htmlBytes + cssBytes + jsBytes > WidgetModalComponent.MAX_TOTAL) {
      this.toast.emit('Widget code is too large'); return;
    }
    this.saved.emit({ id: this.editingWidgetId, data: { title, html, css, js, w: this.width, h: this.height } });
  }

  protected examples() {
    return [
      { id: 'blank', title: 'Blank', html: '', css: '', js: '', w: 4, h: 2 },
      { id: 'clock', title: 'Live Clock', html: '<div class="clock-wrap"><div class="clock-label">Local time</div><div id="clock-value" class="clock-value">--:--:--</div></div>', css: '.clock-wrap{height:100%;display:grid;place-items:center;color:#e2e8f0;font-family:system-ui,sans-serif}.clock-label{font-size:12px;opacity:.75;letter-spacing:.08em;text-transform:uppercase}.clock-value{font-size:38px;font-weight:700;letter-spacing:.04em;margin-top:6px}', js: "const el=document.getElementById('clock-value');const tick=()=>{const n=new Date();el.textContent=n.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'});};tick();setInterval(tick,1000);", w: 4, h: 2 },
      { id: 'progress', title: 'Progress Ring', html: '<div class="ring-wrap"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="44" class="bg"/><circle cx="60" cy="60" r="44" class="fg" id="ring"/></svg><div id="pct" class="pct">0%</div><input id="slider" type="range" min="0" max="100" value="68"/></div>', css: ".ring-wrap{height:100%;display:grid;place-items:center;color:#e2e8f0;font-family:system-ui,sans-serif;gap:10px}svg{width:120px;height:120px}circle{fill:none;stroke-width:10}.bg{stroke:#334155}.fg{stroke:#22d3ee;stroke-linecap:round;transform:rotate(-90deg);transform-origin:60px 60px;stroke-dasharray:276.46;stroke-dashoffset:276.46;transition:stroke-dashoffset .2s}.pct{font-size:20px;font-weight:700}input{width:160px;accent-color:#22d3ee}", js: "const ring=document.getElementById('ring');const pct=document.getElementById('pct');const slider=document.getElementById('slider');const C=2*Math.PI*44;function draw(v){const p=Math.max(0,Math.min(100,Number(v)||0));ring.style.strokeDashoffset=String(C-(C*p/100));pct.textContent=`${p}%`;}draw(slider.value);slider.addEventListener('input',e=>draw(e.target.value));", w: 4, h: 2 },
    ];
  }
}
