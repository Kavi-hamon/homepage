export const environment = {
  production: true,
  /** Use same-origin routing in production so HTTPS ingress can proxy /api and /auth. */
  apiUrl: '',
  /** Browser redirect after Google OAuth (your Go handler). */
  googleAuthPath: '/auth/google',
};
