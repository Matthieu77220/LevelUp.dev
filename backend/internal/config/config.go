package config

import (
	"errors"
	"net"
	"net/url"
	"os"
	"strconv"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	Address        string
	DatabaseURL    string
	FrontendOrigin string
	CookieName     string
	CookieSecure   bool
	SessionTTL     time.Duration
}

func Load() (Config, error) {
	for _, path := range []string{".env", "../.env"} {
		if err := godotenv.Load(path); err != nil && !errors.Is(err, os.ErrNotExist) {
			return Config{}, errors.New("cannot load environment file")
		}
	}

	secure, err := strconv.ParseBool(envOrDefault("COOKIE_SECURE", "false"))
	if err != nil {
		return Config{}, errors.New("COOKIE_SECURE must be true or false")
	}
	origin := envOrDefault("FRONTEND_ORIGIN", "http://localhost:5173")
	parsedOrigin, err := url.Parse(origin)
	if err != nil || parsedOrigin.Host == "" || (parsedOrigin.Scheme != "http" && parsedOrigin.Scheme != "https") || parsedOrigin.User != nil || parsedOrigin.Path != "" || parsedOrigin.RawQuery != "" || parsedOrigin.Fragment != "" {
		return Config{}, errors.New("FRONTEND_ORIGIN must be an HTTP(S) origin without path or credentials")
	}
	if os.Getenv("APP_ENV") == "production" && (!secure || parsedOrigin.Scheme != "https") {
		return Config{}, errors.New("production requires COOKIE_SECURE=true and an HTTPS FRONTEND_ORIGIN")
	}

	ttl, err := time.ParseDuration(envOrDefault("SESSION_TTL", "24h"))
	if err != nil || ttl < time.Hour || ttl > 30*24*time.Hour {
		return Config{}, errors.New("SESSION_TTL must be between 1h and 720h")
	}

	databaseURL := resolveDatabaseURL()
	if databaseURL == "" {
		return Config{}, errors.New("DATABASE_URL is required")
	}

	cookieName := "levelup_session"
	if secure {
		cookieName = "__Host-levelup_session"
	}

	return Config{
		Address:        envOrDefault("API_ADDRESS", "127.0.0.1:8081"),
		DatabaseURL:    databaseURL,
		FrontendOrigin: origin,
		CookieName:     cookieName,
		CookieSecure:   secure,
		SessionTTL:     ttl,
	}, nil
}

func resolveDatabaseURL() string {
	databaseName := os.Getenv("POSTGRES_DB")
	user := os.Getenv("POSTGRES_USER")
	password := os.Getenv("POSTGRES_PASSWORD")
	if databaseName != "" && user != "" && password != "" {
		connection := &url.URL{
			Scheme: "postgresql",
			User:   url.UserPassword(user, password),
			Host:   net.JoinHostPort(envOrDefault("POSTGRES_HOST", "localhost"), envOrDefault("POSTGRES_PORT", "5432")),
			Path:   databaseName,
		}
		query := connection.Query()
		query.Set("sslmode", envOrDefault("DATABASE_SSLMODE", "disable"))
		connection.RawQuery = query.Encode()
		return connection.String()
	}
	return os.Getenv("DATABASE_URL")
}

func envOrDefault(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
