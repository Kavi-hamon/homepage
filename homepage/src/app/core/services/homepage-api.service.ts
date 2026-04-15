import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, Observable, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { HomepageData } from '../models/homepage.models';

/** Expected Go API: GET/PUT /api/homepage with JSON body matching HomepageData. */
@Injectable({ providedIn: 'root' })
export class HomepageApiService {
  private readonly http = inject(HttpClient);

  getHomepage(): Observable<HomepageData> {
    return this.http.get<HomepageData>(`${environment.apiUrl}/api/homepage`, { withCredentials: true });
  }

  saveHomepage(data: HomepageData): Observable<unknown> {
    return this.http
      .put(`${environment.apiUrl}/api/homepage`, data, { withCredentials: true })
      .pipe(catchError(() => of(null)));
  }
}
