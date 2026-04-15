import { type CalendarWidget, type CustomWidget, type LinkGroup, type QuickLink } from '../../core/models/homepage.models';

export type DashboardItemView =
  | { key: string; type: 'link'; link: QuickLink }
  | { key: string; type: 'collection'; group: LinkGroup }
  | { key: string; type: 'widget'; widget: CustomWidget }
  | { key: string; type: 'calendar'; calendarWidget: CalendarWidget };

export type MoveDirection = 'up' | 'down' | 'left' | 'right';
export type DashboardToken = `q:${string}` | `g:${string}` | `w:${string}` | `c:${string}`;

export type DashboardAction =
  | { type: 'openAddItem' }
  | { type: 'openSizeEditor'; item: DashboardItemView }
  | { type: 'removeQuick'; id: string }
  | { type: 'removeWidget'; id: string }
  | { type: 'removeCalendar'; id: string }
  | { type: 'editWidget'; id: string }
  | { type: 'addGroupLink'; gid: string }
  | { type: 'editGroupLink'; gid: string; index: number }
  | { type: 'editGroup'; gid: string }
  | { type: 'deleteGroup'; gid: string }
  | { type: 'openAll'; gid: string }
  | { type: 'moveGroupLink'; gid: string; index: number; direction: 'up' | 'down' }
  | { type: 'removeGroupLink'; gid: string; index: number };
