package handlers

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/homepage/server/internal/auth"
	"github.com/homepage/server/internal/config"
	"github.com/homepage/server/internal/store"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
)

const (
	oauthStateCookie  = "oauth_state"
	oauthReturnCookie = "oauth_return"
	sessionTTL        = 30 * 24 * time.Hour
)

// defaultHomepageJSON for users with no saved document yet.
// This mirrors the Angular `defaultHomepageData` / `createDefaultTab` structure
// so that the first login via Google shows the same Jira / AWS / dashboards layout
// that you see before signing in.
var defaultHomepageJSON = []byte(`{
  "activeTabId": "t_home",
  "tabs": [
    {
      "id": "t_home",
      "name": "Home",
      "quickLinks": [
        { "id": "q_search", "title": "Search", "url": "https://www.google.com", "emoji": "🔎", "x": 0, "y": 0, "w": 1, "h": 1 },
        { "id": "q_mail", "title": "Mail", "url": "https://mail.google.com", "emoji": "✉️", "x": 1, "y": 0, "w": 1, "h": 1 },
        { "id": "q_github", "title": "GitHub", "url": "https://github.com/", "emoji": "🐙", "x": 2, "y": 0, "w": 1, "h": 1 },
        { "id": "q_calendar", "title": "Calendar", "url": "https://calendar.google.com", "emoji": "🗓️", "x": 3, "y": 0, "w": 1, "h": 1 }
      ],
      "groups": [
        {
          "id": "g_workspace",
          "title": "Workspace",
          "emoji": "🧰",
          "x": 0,
          "y": 1,
          "w": 3,
          "h": 2,
          "links": [
            { "title": "Docs", "url": "https://docs.google.com", "emoji": "📄" },
            { "title": "Drive", "url": "https://drive.google.com", "emoji": "🗂️" },
            { "title": "Meet", "url": "https://meet.google.com", "emoji": "🎥" }
          ]
        },
        {
          "id": "g_explore",
          "title": "Explore",
          "emoji": "🧭",
          "x": 3,
          "y": 1,
          "w": 3,
          "h": 2,
          "links": [
            { "title": "Maps", "url": "https://maps.google.com", "emoji": "🗺️" },
            { "title": "YouTube", "url": "https://www.youtube.com", "emoji": "▶️" },
            { "title": "Wikipedia", "url": "https://www.wikipedia.org", "emoji": "📚" }
          ]
        }
      ],
      "widgets": [
        {
          "id": "w_clock",
          "title": "Live Clock",
          "html": "<div class=\"clock-wrap\"><div class=\"clock-label\">Local time</div><div id=\"clock-value\" class=\"clock-value\">--:--:--</div></div>",
          "css": ".clock-wrap{height:100%;display:grid;place-items:center;color:#e2e8f0;font-family:system-ui,sans-serif}.clock-label{font-size:12px;opacity:.75;letter-spacing:.08em;text-transform:uppercase}.clock-value{font-size:38px;font-weight:700;letter-spacing:.04em;margin-top:6px}",
          "js": "const el=document.getElementById('clock-value');const tick=()=>{const n=new Date();el.textContent=n.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});};tick();setInterval(tick,1000);",
          "x": 0,
          "y": 3,
          "w": 4,
          "h": 2
        }
      ]
    }
  ],
  "settings": {
    "theme": "default",
    "wallpaper": "gradient-deep",
    "customWallUrl": "",
    "overlay": 0.46,
    "blur": 12,
    "searchEngine": "google",
    "showClock": true,
    "userName": ""
  },
  "todos": [],
  "notes": ""
}`)

type Handler struct {
	cfg   *config.Config
	db    *store.DB
	oauth *oauth2.Config
}

func New(cfg *config.Config, db *store.DB) *Handler {
	o := &oauth2.Config{
		ClientID:     cfg.GoogleClientID,
		ClientSecret: cfg.GoogleClientSecret,
		RedirectURL:  cfg.OAuthRedirectURL,
		Scopes: []string{
			"https://www.googleapis.com/auth/userinfo.email",
			"https://www.googleapis.com/auth/userinfo.profile",
		},
		Endpoint: google.Endpoint,
	}
	return &Handler{cfg: cfg, db: db, oauth: o}
}

func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Get("/auth/google", h.startGoogle)
	r.Get("/auth/google/callback", h.googleCallback)

	r.Route("/api", func(r chi.Router) {
		r.Get("/auth/me", h.me)
		r.Get("/healthz", h.healthz)
		r.Post("/auth/logout", h.logout)
		r.Group(func(r chi.Router) {
			r.Use(h.requireAuth)
			r.Get("/homepage", h.getHomepage)
			r.Put("/homepage", h.putHomepage)
		})
	})
	return r
}

func (h *Handler) healthz(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write([]byte(`{"ok":true}`))
}

func (h *Handler) startGoogle(w http.ResponseWriter, r *http.Request) {
	returnURL := r.URL.Query().Get("return_url")
	if !h.safeReturnURL(returnURL) {
		returnURL = h.cfg.FrontendOrigin + "/"
	}
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	state := base64.RawURLEncoding.EncodeToString(b)

	http.SetCookie(w, &http.Cookie{
		Name:     oauthStateCookie,
		Value:    state,
		Path:     "/",
		MaxAge:   600,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   h.secureCookie(),
	})
	http.SetCookie(w, &http.Cookie{
		Name:     oauthReturnCookie,
		Value:    base64.RawURLEncoding.EncodeToString([]byte(returnURL)),
		Path:     "/",
		MaxAge:   600,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   h.secureCookie(),
	})

	http.Redirect(w, r, h.oauth.AuthCodeURL(state, oauth2.AccessTypeOffline), http.StatusFound)
}

func (h *Handler) secureCookie() bool {
	return strings.HasPrefix(h.cfg.FrontendOrigin, "https")
}

func (h *Handler) safeReturnURL(u string) bool {
	if u == "" {
		return false
	}
	parsed, err := url.Parse(u)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return false
	}
	front, err := url.Parse(h.cfg.FrontendOrigin)
	if err != nil {
		return false
	}
	return parsed.Scheme == front.Scheme && parsed.Host == front.Host
}

type googleUserInfo struct {
	Sub     string `json:"id"`
	Email   string `json:"email"`
	Name    string `json:"name"`
	Picture string `json:"picture"`
}

func (h *Handler) googleCallback(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	if r.URL.Query().Get("error") != "" {
		http.Redirect(w, r, h.cfg.FrontendOrigin+"/login?error=oauth", http.StatusFound)
		return
	}
	stateQ := r.URL.Query().Get("state")
	code := r.URL.Query().Get("code")
	sc, err := r.Cookie(oauthStateCookie)
	if err != nil || sc.Value == "" || sc.Value != stateQ {
		http.Redirect(w, r, h.cfg.FrontendOrigin+"/login?error=state", http.StatusFound)
		return
	}
	rc, err := r.Cookie(oauthReturnCookie)
	returnURL := h.cfg.FrontendOrigin + "/"
	if err == nil && rc.Value != "" {
		if b, err := base64.RawURLEncoding.DecodeString(rc.Value); err == nil {
			if u := string(b); h.safeReturnURL(u) {
				returnURL = u
			}
		}
	}
	http.SetCookie(w, &http.Cookie{Name: oauthStateCookie, Value: "", Path: "/", MaxAge: -1})
	http.SetCookie(w, &http.Cookie{Name: oauthReturnCookie, Value: "", Path: "/", MaxAge: -1})

	tok, err := h.oauth.Exchange(ctx, code)
	if err != nil {
		http.Redirect(w, r, h.cfg.FrontendOrigin+"/login?error=token", http.StatusFound)
		return
	}

	client := h.oauth.Client(ctx, tok)
	resp, err := client.Get("https://www.googleapis.com/oauth2/v2/userinfo")
	if err != nil {
		http.Redirect(w, r, h.cfg.FrontendOrigin+"/login?error=userinfo", http.StatusFound)
		return
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	var info googleUserInfo
	if json.Unmarshal(body, &info) != nil || info.Sub == "" {
		http.Redirect(w, r, h.cfg.FrontendOrigin+"/login?error=profile", http.StatusFound)
		return
	}

	user, err := h.db.UpsertUser(ctx, info.Sub, info.Email, info.Name, info.Picture)
	if err != nil {
		http.Redirect(w, r, h.cfg.FrontendOrigin+"/login?error=db", http.StatusFound)
		return
	}

	jwtStr, err := auth.SignUserID(h.cfg.JWTSecret, user.ID, sessionTTL)
	if err != nil {
		http.Redirect(w, r, h.cfg.FrontendOrigin+"/login?error=jwt", http.StatusFound)
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     h.cfg.SessionCookieName,
		Value:    jwtStr,
		Path:     "/",
		MaxAge:   int(sessionTTL.Seconds()),
		HttpOnly: true,
		SameSite: http.SameSiteNoneMode,
		Secure:   true,
	})
	http.Redirect(w, r, returnURL, http.StatusFound)
}

func (h *Handler) sessionToken(r *http.Request) string {
	if c, err := r.Cookie(h.cfg.SessionCookieName); err == nil && c.Value != "" {
		return c.Value
	}
	authz := r.Header.Get("Authorization")
	if len(authz) > 7 && strings.EqualFold(authz[:7], "bearer ") {
		return strings.TrimSpace(authz[7:])
	}
	return ""
}

func (h *Handler) requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tok := h.sessionToken(r)
		if tok == "" {
			w.Header().Set("Content-Type", "application/json")
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}
		uid, err := auth.ParseUserID(h.cfg.JWTSecret, tok)
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r.WithContext(contextWithUserID(r.Context(), uid)))
	})
}

type ctxKey int

const userIDKey ctxKey = 1

func contextWithUserID(ctx context.Context, id primitive.ObjectID) context.Context {
	return context.WithValue(ctx, userIDKey, id)
}

func userIDFromContext(ctx context.Context) (primitive.ObjectID, bool) {
	id, ok := ctx.Value(userIDKey).(primitive.ObjectID)
	return id, ok
}

func (h *Handler) me(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	tok := h.sessionToken(r)
	if tok == "" {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":"unauthorized"}`))
		return
	}
	uid, err := auth.ParseUserID(h.cfg.JWTSecret, tok)
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":"unauthorized"}`))
		return
	}
	user, err := h.db.UserByID(r.Context(), uid)
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":"unauthorized"}`))
		return
	}
	_ = json.NewEncoder(w).Encode(map[string]string{
		"email":   user.Email,
		"name":    user.Name,
		"picture": user.Picture,
	})
}

func (h *Handler) logout(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     h.cfg.SessionCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		SameSite: http.SameSiteNoneMode,
		Secure:   true,
	})
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write([]byte(`{"ok":true}`))
}

func (h *Handler) getHomepage(w http.ResponseWriter, r *http.Request) {
	uid, ok := userIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	data, found, err := h.db.GetHomepageData(r.Context(), uid)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	if !found {
		_, _ = w.Write(defaultHomepageJSON)
		return
	}
	_, _ = w.Write(data)
}

func (h *Handler) putHomepage(w http.ResponseWriter, r *http.Request) {
	uid, ok := userIDFromContext(r.Context())
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 4<<20))
	if err != nil {
		http.Error(w, "read error", http.StatusBadRequest)
		return
	}
	if !json.Valid(body) {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if err := h.db.SaveHomepageData(r.Context(), uid, body); err != nil {
		http.Error(w, "save error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write([]byte(`{"ok":true}`))
}
