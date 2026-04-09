import { HttpInterceptorFn } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID } from '@angular/core';
import { environment } from '../../../environments/environment';

/** Sends cookies to Go API; optional Bearer token from localStorage. */
export const apiInterceptor: HttpInterceptorFn = (req, next) => {
  const platformId = inject(PLATFORM_ID);
  if (!req.url.startsWith(environment.apiUrl)) {
    return next(req);
  }
  let headers = req.headers;
  if (isPlatformBrowser(platformId)) {
    const token = localStorage.getItem('access_token');
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
  }
  return next(req.clone({ withCredentials: true, headers }));
};
