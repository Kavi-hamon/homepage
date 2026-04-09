import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { of } from 'rxjs';
import { HomepageStateService } from './homepage-state.service';
import { HomepageApiService } from './homepage-api.service';
import { AuthService } from './auth.service';

class MockHomepageApiService {
  readonly getHomepage = vi.fn(() => of(null));
  readonly saveHomepage = vi.fn(() => of(null));
}

class MockAuthService {
  readonly user = vi.fn(() => null);
  readonly checked = vi.fn(() => true);
}

describe('HomepageStateService', () => {
  let service: HomepageStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        HomepageStateService,
        { provide: HomepageApiService, useClass: MockHomepageApiService },
        { provide: AuthService, useClass: MockAuthService },
      ],
    });

    service = TestBed.inject(HomepageStateService);
  });

  it('moves an item by one cell only when the destination is open', () => {
    service.importJson(
      JSON.stringify({
        activeTabId: 't1',
        tabs: [
          {
            id: 't1',
            name: 'Home',
            quickLinks: [
              { id: 'q1', title: 'One', url: 'https://one', emoji: '1', x: 0, y: 0, w: 1, h: 1 },
              { id: 'q2', title: 'Two', url: 'https://two', emoji: '2', x: 1, y: 0, w: 1, h: 1 },
            ],
            groups: [],
            widgets: [],
          },
        ],
        settings: {},
        todos: [],
        notes: '',
      }),
    );

    expect(service.moveTabItem('t1', 'q:q1', 'right')).toBe(false);
    expect(service.moveTabItem('t1', 'q:q1', 'down')).toBe(true);

    const moved = service.activeTab().quickLinks.find((link) => link.id === 'q1');
    expect(moved).toMatchObject({ x: 0, y: 1 });
  });

  it('rejects a resize that would overlap another card', () => {
    service.importJson(
      JSON.stringify({
        activeTabId: 't1',
        tabs: [
          {
            id: 't1',
            name: 'Home',
            quickLinks: [
              { id: 'q1', title: 'One', url: 'https://one', emoji: '1', x: 0, y: 0, w: 1, h: 1 },
            ],
            groups: [
              { id: 'g1', title: 'Group', emoji: '📁', links: [], x: 1, y: 0, w: 3, h: 2 },
            ],
            widgets: [],
          },
        ],
        settings: {},
        todos: [],
        notes: '',
      }),
    );

    expect(service.updateQuickLinkSize('q1', 2, 1)).toBe(false);
    expect(service.activeTab().quickLinks.find((link) => link.id === 'q1')).toMatchObject({
      x: 0,
      y: 0,
      w: 1,
      h: 1,
    });
  });

  it('places an item at explicit coordinates only when the target is open', () => {
    service.importJson(
      JSON.stringify({
        activeTabId: 't1',
        tabs: [
          {
            id: 't1',
            name: 'Home',
            quickLinks: [
              { id: 'q1', title: 'One', url: 'https://one', emoji: '1', x: 0, y: 0, w: 1, h: 1 },
              { id: 'q2', title: 'Two', url: 'https://two', emoji: '2', x: 2, y: 0, w: 1, h: 1 },
            ],
            groups: [],
            widgets: [],
          },
        ],
        settings: {},
        todos: [],
        notes: '',
      }),
    );

    expect(service.placeTabItem('t1', 'q:q1', 2, 0)).toBe(false);
    expect(service.placeTabItem('t1', 'q:q1', 1, 1)).toBe(true);
    expect(service.activeTab().quickLinks.find((link) => link.id === 'q1')).toMatchObject({
      x: 1,
      y: 1,
    });
  });

  it('updates and reorders collection links in place', () => {
    service.importJson(
      JSON.stringify({
        activeTabId: 't1',
        tabs: [
          {
            id: 't1',
            name: 'Home',
            quickLinks: [],
            groups: [
              {
                id: 'g1',
                title: 'Group',
                emoji: '📁',
                x: 0,
                y: 0,
                w: 3,
                h: 2,
                links: [
                  { title: 'One', url: 'https://one', emoji: '1' },
                  { title: 'Two', url: 'https://two', emoji: '2' },
                ],
              },
            ],
            widgets: [],
          },
        ],
        settings: {},
        todos: [],
        notes: '',
      }),
    );

    service.updateGroupLink('g1', 0, { title: 'Start', url: 'start.local', emoji: 'S' });
    expect(service.activeTab().groups[0].links[0]).toMatchObject({
      title: 'Start',
      url: 'https://start.local',
      emoji: 'S',
    });

    expect(service.moveGroupLink('g1', 0, 'up')).toBe(false);
    expect(service.moveGroupLink('g1', 0, 'down')).toBe(true);
    expect(service.activeTab().groups[0].links.map((link) => link.title)).toEqual(['Two', 'Start']);
  });

  it('persists custom widget state in the homepage model', () => {
    const widgetId = service.activeTab().widgets[0].id;

    service.updateCustomWidgetState(widgetId, JSON.stringify({ todos: ['ship it'] }));

    expect(service.activeTab().widgets.find((widget) => widget.id === widgetId)?.stateJson).toBe(
      '{"todos":["ship it"]}',
    );
  });
});
