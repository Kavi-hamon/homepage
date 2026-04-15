import { Component, EventEmitter, inject, Input, OnChanges, Output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HomepageStateService } from '../../../../core/services/homepage-state.service';

export interface GroupLinkData { title: string; url: string; emoji: string; }
export interface GroupData { title: string; emoji: string; }

@Component({
  selector: 'app-collection-modals',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './collection-modals.component.html',
  styleUrl: './collection-modals.component.css',
})
export class CollectionModalsComponent implements OnChanges {
  private readonly state = inject(HomepageStateService);

  // New group modal
  @Input() groupOpen = false;
  @Output() groupClosed = new EventEmitter<void>();
  @Output() groupSaved = new EventEmitter<GroupData>();

  // Edit group modal
  @Input() groupEditOpen = false;
  @Input() groupEditTargetId: string | null = null;
  @Output() groupEditClosed = new EventEmitter<void>();
  @Output() groupEditSaved = new EventEmitter<GroupData>();

  // Group link modal (add / edit link inside a group)
  @Input() groupLinkOpen = false;
  @Input() groupLinkTargetId: string | null = null;
  @Input() groupLinkEditIndex: number | null = null;
  @Output() groupLinkClosed = new EventEmitter<void>();
  @Output() groupLinkSaved = new EventEmitter<{ data: GroupLinkData; editIndex: number | null }>();

  protected groupTitle = '';
  protected groupEmoji = '📁';
  protected groupEditTitle = '';
  protected groupEditEmoji = '📁';
  protected groupLinkTitle = '';
  protected groupLinkUrl = '';
  protected groupLinkEmoji = '🔗';

  ngOnChanges(): void {
    if (this.groupOpen) { this.groupTitle = ''; this.groupEmoji = '📁'; }
    if (this.groupEditOpen && this.groupEditTargetId) {
      const tab = this.state.activeTab();
      const g = tab?.groups.find(x => x.id === this.groupEditTargetId);
      if (g) { this.groupEditTitle = g.title; this.groupEditEmoji = g.emoji || '📁'; }
    }
    if (this.groupLinkOpen) {
      if (this.groupLinkEditIndex !== null && this.groupLinkTargetId) {
        const tab = this.state.activeTab();
        const group = tab?.groups.find(g => g.id === this.groupLinkTargetId);
        const link = group?.links[this.groupLinkEditIndex];
        if (link) { this.groupLinkTitle = link.title; this.groupLinkUrl = link.url; this.groupLinkEmoji = link.emoji || '🔗'; return; }
      }
      this.groupLinkTitle = '';
      this.groupLinkUrl = '';
      this.groupLinkEmoji = '🔗';
    }
  }

  protected emojiPreview(raw: string, fallback: string): string {
    const t = raw?.trim();
    return t && t.length > 0 ? t : fallback;
  }

  protected saveGroup(): void {
    if (!this.groupTitle.trim()) return;
    this.groupSaved.emit({ title: this.groupTitle.trim(), emoji: this.groupEmoji });
  }

  protected saveGroupEdit(): void {
    if (!this.groupEditTitle.trim()) return;
    this.groupEditSaved.emit({ title: this.groupEditTitle.trim(), emoji: this.groupEditEmoji.trim() || '📁' });
  }

  protected get groupLinkFormValid(): boolean {
    return !!(this.groupLinkTitle.trim() && this.groupLinkUrl.trim());
  }

  protected saveGroupLink(): void {
    if (!this.groupLinkFormValid) return;
    let url = this.groupLinkUrl.trim();
    if (!url.startsWith('http')) url = 'https://' + url;
    this.groupLinkSaved.emit({ data: { title: this.groupLinkTitle.trim(), url, emoji: this.groupLinkEmoji.trim() || '🔗' }, editIndex: this.groupLinkEditIndex });
  }

  protected get groupLinkModalTitle(): string {
    return this.groupLinkEditIndex === null ? 'Add link to collection' : 'Edit collection link';
  }
  protected get groupLinkModalSubtitle(): string {
    return this.groupLinkEditIndex === null ? 'This link will appear under the selected collection.' : 'Update the label, URL, or icon for this collection link.';
  }
  protected get groupLinkModalAction(): string {
    return this.groupLinkEditIndex === null ? 'Add to collection' : 'Save changes';
  }
}
