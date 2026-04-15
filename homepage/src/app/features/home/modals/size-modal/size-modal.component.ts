import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

export interface SizeTarget { type: 'link' | 'collection' | 'widget'; id: string; }
export interface SizeResult { target: SizeTarget; w: number; h: number; }

@Component({
  selector: 'app-size-modal',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './size-modal.component.html',
  styleUrl: './size-modal.component.css',
})
export class SizeModalComponent implements OnChanges {
  @Input() open = false;
  @Input() target: SizeTarget | null = null;
  @Input() initialWidth = 1;
  @Input() initialHeight = 1;
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<SizeResult>();

  protected width = 1;
  protected height = 1;

  ngOnChanges(): void {
    if (this.open) {
      this.width = this.initialWidth;
      this.height = this.initialHeight;
    }
  }

  protected get title(): string {
    if (!this.target) return 'Card size';
    if (this.target.type === 'link') return 'Link size';
    if (this.target.type === 'collection') return 'Collection size';
    return 'Widget size';
  }

  protected save(): void {
    if (!this.target) return;
    this.saved.emit({ target: this.target, w: this.width, h: this.height });
  }
}
