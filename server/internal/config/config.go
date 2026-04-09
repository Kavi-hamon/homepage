package config

import (
	"fmt"
	"os"
	"strings"
)

type Config struct {
	Port              string
	MongoURI          string
	MongoDB           string
	GoogleClientID    string
	GoogleClientSecret string
	OAuthRedirectURL  string // e.g. http://localhost:8080/auth/google/callback
	FrontendOrigin    string // e.g. http://localhost:4200
	JWTSecret         string // min 32 bytes recommended
	SessionCookieName string
}

func Load() (*Config, error) {
	c := &Config{
		Port:               get("PORT", "8080"),
		MongoURI:           os.Getenv("MONGO_URI"),
		MongoDB:            get("MONGO_DB", "homepage"),
		GoogleClientID:     os.Getenv("GOOGLE_CLIENT_ID"),
		GoogleClientSecret: os.Getenv("GOOGLE_CLIENT_SECRET"),
		OAuthRedirectURL:   os.Getenv("OAUTH_REDIRECT_URL"),
		FrontendOrigin:     strings.TrimSuffix(get("FRONTEND_ORIGIN", "http://localhost:4200"), "/"),
		JWTSecret:          os.Getenv("JWT_SECRET"),
		SessionCookieName:  get("SESSION_COOKIE", "homepage_session"),
	}
	if c.MongoURI == "" {
		return nil, fmt.Errorf("MONGO_URI is required")
	}
	if c.GoogleClientID == "" || c.GoogleClientSecret == "" {
		return nil, fmt.Errorf("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required")
	}
	if c.OAuthRedirectURL == "" {
		return nil, fmt.Errorf("OAUTH_REDIRECT_URL is required (must match Google Cloud console)")
	}
	if len(c.JWTSecret) < 16 {
		return nil, fmt.Errorf("JWT_SECRET must be at least 16 characters")
	}
	return c, nil
}

func get(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
