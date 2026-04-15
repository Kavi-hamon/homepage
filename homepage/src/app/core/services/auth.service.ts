import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { afterNextRender } from '@angular/core';
import { catchError, of, tap } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface AuthUser {
  email: string;
  name?: string;
  picture?: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);

  /** Set true after GET /api/auth/me succeeds */
  readonly user = signal<AuthUser | null>(null);
  readonly checked = signal(false);

  constructor() {
    afterNextRender(() => this.refreshSession());
  }

  /** Call your Go endpoint that validates session / JWT. */
  refreshSession(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    this.http
      .get<AuthUser>(`${environment.apiUrl}/api/auth/me`, { withCredentials: true, headers: { 'Cache-Control': 'no-cache' } })
      .pipe(
        tap((u) => this.user.set(u)),
        catchError(() => {
          this.user.set(null);
          return of(null);
        }),
      )
      .subscribe(() => this.checked.set(true));
  }

  startGoogleLogin(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    const returnUrl = encodeURIComponent(window.location.origin + '/');
    window.location.href = `${environment.apiUrl}${environment.googleAuthPath}?return_url=${returnUrl}`;
  }

  logout(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    localStorage.removeItem('access_token');
    this.http
      .post(`${environment.apiUrl}/api/auth/logout`, {}, { withCredentials: true })
      .pipe(catchError(() => of(null)))
      .subscribe(() => {
        this.user.set(null);
        window.location.href = '/';
      });
  }
}
