import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-workspace-modal',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './workspace-modal.component.html',
  styleUrl: './workspace-modal.component.css',
})
export class WorkspaceModalComponent {
  @Input() tabEditOpen = false;
  @Input() newWorkspaceOpen = false;
  @Input() tabNameDraft = '';
  @Input() tabCount = 1;
  @Input() newWorkspaceName = '';

  @Output() tabEditClosed = new EventEmitter<void>();
  @Output() newWorkspaceClosed = new EventEmitter<void>();
  @Output() tabNameSaved = new EventEmitter<string>();
  @Output() tabDeleted = new EventEmitter<void>();
  @Output() newWorkspaceSaved = new EventEmitter<string>();

  protected localTabName = '';
  protected localWorkspaceName = '';

  ngOnChanges(): void {
    if (this.tabEditOpen) this.localTabName = this.tabNameDraft;
    if (this.newWorkspaceOpen) this.localWorkspaceName = this.newWorkspaceName;
  }

  protected saveTabName(): void {
    this.tabNameSaved.emit(this.localTabName);
  }

  protected saveNewWorkspace(): void {
    if (this.localWorkspaceName.trim()) {
      this.newWorkspaceSaved.emit(this.localWorkspaceName.trim());
    }
  }
}
