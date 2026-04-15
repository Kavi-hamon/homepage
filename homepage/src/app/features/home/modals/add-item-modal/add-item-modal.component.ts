import { Component, EventEmitter, Input, Output } from '@angular/core';
import { AuthService } from '../../../../core/services/auth.service';
import { HomepageStateService } from '../../../../core/services/homepage-state.service';
import { inject } from '@angular/core';
import { signal } from '@angular/core';

export type AddItemChoice = 'link' | 'collection' | 'widget' | 'calendar';

@Component({
  selector: 'app-add-item-modal',
  standalone: true,
  imports: [],
  templateUrl: './add-item-modal.component.html',
  styleUrl: './add-item-modal.component.css',
})
export class AddItemModalComponent {
  @Input() open = false;
  @Output() closed = new EventEmitter<void>();
  @Output() chose = new EventEmitter<AddItemChoice>();

  protected readonly auth = inject(AuthService);
  protected readonly state = inject(HomepageStateService);
  protected step = signal<'root' | 'widget'>('root');

  ngOnChanges(): void {
    if (this.open) this.step.set('root');
  }

  protected choose(type: AddItemChoice): void {
    if (type === 'widget') {
      this.step.set('widget');
      return;
    }
    this.chose.emit(type);
  }

  protected chooseCustomWidget(): void {
    this.chose.emit('widget');
  }
}
