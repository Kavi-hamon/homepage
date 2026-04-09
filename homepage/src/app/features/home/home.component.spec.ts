import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultHomepageData } from '../../core/models/homepage.models';
import { AuthService } from '../../core/services/auth.service';
import { HomepageStateService } from '../../core/services/homepage-state.service';
import { HomeComponent } from './home.component';

class MockHomepageStateService {
  readonly data = signal(defaultHomepageData());
  readonly activeTab = computed(() => this.data().tabs[0]);
  readonly moveTabItem = vi.fn(() => true);
  readonly placeTabItem = vi.fn(() => true);
  readonly updateQuickLinkSize = vi.fn(() => true);
  readonly updateGroupSize = vi.fn(() => true);
  readonly updateCustomWidget = vi.fn(() => true);
  readonly updateCustomWidgetState = vi.fn();
  readonly addGroupLink = vi.fn();
  readonly updateGroupLink = vi.fn();
  readonly moveGroupLink = vi.fn(() => true);
  readonly removeCustomWidget = vi.fn();
  readonly removeQuickLink = vi.fn();
}

class MockAuthService {
  readonly user = signal(null);
  readonly checked = signal(true);
}

describe('HomeComponent', () => {
  let state: MockHomepageStateService;

  beforeEach(async () => {
    state = new MockHomepageStateService();

    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [
        { provide: HomepageStateService, useValue: state },
        { provide: AuthService, useClass: MockAuthService },
      ],
    }).compileComponents();
  });

  it('renders cards from explicit grid coordinates', () => {
    const fixture = TestBed.createComponent(HomeComponent);
    const component = fixture.componentInstance as unknown as {
      cardShellStyle: (item: unknown) => Record<string, string>;
    };

    const link = {
      id: 'q1',
      title: 'Link',
      url: 'https://example.com',
      emoji: '🔗',
      x: 2,
      y: 3,
      w: 1,
      h: 2,
    };

    expect(component.cardShellStyle({ key: 'q:q1', type: 'link', link })).toEqual({
      'grid-column': '3 / span 1',
      'grid-row': '4 / span 2',
    });
  });

  it('extends the grid surface in edit mode to allow lower drop rows', () => {
    const fixture = TestBed.createComponent(HomeComponent);
    const component = fixture.componentInstance as unknown as {
      itemsEditMode: ReturnType<typeof signal<boolean>>;
      itemsGridStyle: () => Record<string, string>;
    };

    component.itemsEditMode.set(true);
    expect(component.itemsGridStyle()['min-height']).toContain('var(--dashboard-row)');
  });

  it('saves link and collection size in grid units', () => {
    const fixture = TestBed.createComponent(HomeComponent);
    const component = fixture.componentInstance as unknown as {
      sizeTarget: ReturnType<typeof signal<{ type: 'link' | 'collection' | 'widget'; id: string } | null>>;
      sizeWidth: number;
      sizeHeight: number;
      saveItemSize: () => void;
    };

    component.sizeTarget.set({ type: 'link', id: 'q1' });
    component.sizeWidth = 2;
    component.sizeHeight = 1;
    component.saveItemSize();
    expect(state.updateQuickLinkSize).toHaveBeenCalledWith('q1', 2, 1);

    component.sizeTarget.set({ type: 'collection', id: 'g1' });
    component.sizeWidth = 4;
    component.sizeHeight = 3;
    component.saveItemSize();
    expect(state.updateGroupSize).toHaveBeenCalledWith('g1', 4, 3);
  });

  it('drops a dragged card onto an explicit grid position through the state service', () => {
    const fixture = TestBed.createComponent(HomeComponent);
    const component = fixture.componentInstance as unknown as {
      dragPreview: ReturnType<typeof signal<{ key: 'q:q1'; x: number; y: number; w: number; h: number; valid: boolean } | null>>;
      onGridDrop: (event: DragEvent) => void;
    };

    component.dragPreview.set({ key: 'q:q1', x: 3, y: 2, w: 1, h: 1, valid: true });
    component.onGridDrop(new Event('drop') as DragEvent);

    expect(state.placeTabItem).toHaveBeenCalledWith(state.activeTab().id, 'q:q1', 3, 2);
  });

  it('saves widgets with unit-based width and height', () => {
    const fixture = TestBed.createComponent(HomeComponent);
    const component = fixture.componentInstance as unknown as {
      editingWidgetId: ReturnType<typeof signal<string | null>>;
      widgetTitle: string;
      widgetHtml: string;
      widgetCss: string;
      widgetJs: string;
      widgetWidth: number;
      widgetHeight: number;
      saveWidget: () => void;
    };

    component.editingWidgetId.set('w1');
    component.widgetTitle = 'Widget';
    component.widgetHtml = '<div>ok</div>';
    component.widgetCss = '';
    component.widgetJs = '';
    component.widgetWidth = 5;
    component.widgetHeight = 3;
    component.saveWidget();

    expect(state.updateCustomWidget).toHaveBeenCalledWith('w1', {
      title: 'Widget',
      html: '<div>ok</div>',
      css: '',
      js: '',
      w: 5,
      h: 3,
    });
  });

  it('injects the widget storage bridge into widget iframe documents', () => {
    const fixture = TestBed.createComponent(HomeComponent);
    const component = fixture.componentInstance as unknown as {
      widgetSrcDoc: (widget: any) => string;
    };

    const html = component.widgetSrcDoc(state.activeTab().widgets[0]);
    expect(html).toContain('window.homepageWidget');
    expect(html).toContain("type: 'homepage:widget-storage'");
  });

  it('reuses the collection link modal for editing existing links', () => {
    const fixture = TestBed.createComponent(HomeComponent);
    const component = fixture.componentInstance as unknown as {
      editGroupLink: (gid: string, index: number) => void;
      groupLinkTitle: string;
      groupLinkUrl: string;
      groupLinkEmoji: string;
      groupLinkEditIndex: ReturnType<typeof signal<number | null>>;
      saveGroupLink: () => void;
    };
    const groupId = state.activeTab().groups[0].id;
    const originalLink = state.activeTab().groups[0].links[0];

    component.editGroupLink(groupId, 0);
    expect(component.groupLinkEditIndex()).toBe(0);
    expect(component.groupLinkTitle).toBe(originalLink.title);

    component.groupLinkTitle = 'Inbox';
    component.saveGroupLink();

    expect(state.updateGroupLink).toHaveBeenCalledWith(groupId, 0, {
      title: 'Inbox',
      url: originalLink.url,
      emoji: originalLink.emoji,
    });
  });

  it('moves collection links up and down through the state service', () => {
    const fixture = TestBed.createComponent(HomeComponent);
    const component = fixture.componentInstance as unknown as {
      moveGroupLink: (gid: string, index: number, direction: 'up' | 'down') => void;
    };
    const groupId = state.activeTab().groups[0].id;

    component.moveGroupLink(groupId, 1, 'up');
    component.moveGroupLink(groupId, 0, 'down');

    expect(state.moveGroupLink).toHaveBeenNthCalledWith(1, groupId, 1, 'up');
    expect(state.moveGroupLink).toHaveBeenNthCalledWith(2, groupId, 0, 'down');
  });
});
