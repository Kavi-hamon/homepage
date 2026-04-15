import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, Observable, of } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  htmlLink: string;
  location?: string;
  meetLink?: string;
}

@Injectable({ providedIn: 'root' })
export class CalendarService {
  private readonly http = inject(HttpClient);

  getUpcomingEvents(): Observable<CalendarEvent[] | null> {
    return this.http
      .get<CalendarEvent[]>(`${environment.apiUrl}/api/calendar/events`, { withCredentials: true })
      .pipe(catchError(() => of(null)));
  }
}
