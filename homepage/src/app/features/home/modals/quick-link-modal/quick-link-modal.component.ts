import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { type QuickLink } from '../../../../core/models/homepage.models';

export type QuickLinkResult = Omit<QuickLink, 'id' | 'x' | 'y'>;

@Component({
  selector: 'app-quick-link-modal',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './quick-link-modal.component.html',
  styleUrl: './quick-link-modal.component.css',
})
export class QuickLinkModalComponent {
  @Input() open = false;
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<QuickLinkResult>();

  protected title = '';
  protected url = '';
  protected emoji = '🔗';

  ngOnChanges(): void {
    if (this.open) {
      this.title = '';
      this.url = '';
      this.emoji = '🔗';
    }
  }

  protected get isValid(): boolean {
    return !!(this.title.trim() && this.url.trim());
  }

  protected emojiPreview(raw: string, fallback: string): string {
    const t = raw?.trim();
    return t && t.length > 0 ? t : fallback;
  }

  protected save(): void {
    if (!this.isValid) return;
    let url = this.url.trim();
    if (!url.startsWith('http')) url = 'https://' + url;
    this.saved.emit({ title: this.title.trim(), url, emoji: this.emoji.trim() || '🔗', w: 1, h: 1 });
  }
}
