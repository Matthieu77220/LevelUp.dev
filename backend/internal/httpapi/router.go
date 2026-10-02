package httpapi

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"levelup.dev/backend/internal/auth"
	"levelup.dev/backend/internal/learning"
)

func NewRouter(authHandler *auth.Handler, learningHandler *learning.Handler, allowedOrigin string, logger *slog.Logger, databasePing func(context.Context) error) http.Handler {
	mux := http.NewServeMux()
	loginLimiter := NewRateLimiter(10, 15*time.Minute)
	registerLimiter := NewRateLimiter(5, time.Hour)

	mux.Handle("POST /api/v1/auth/register", registerLimiter.Middleware(http.HandlerFunc(authHandler.Register)))
	mux.Handle("POST /api/v1/auth/login", loginLimiter.Middleware(http.HandlerFunc(authHandler.Login)))
	mux.HandleFunc("POST /api/v1/auth/logout", authHandler.Logout)
	mux.HandleFunc("GET /api/v1/auth/me", authHandler.Me)
	mux.HandleFunc("GET /api/v1/learning/catalog", authHandler.RequireUser(learningHandler.Catalog))
	mux.HandleFunc("POST /api/v1/learning/skills/{skillID}/start", authHandler.RequireUser(learningHandler.StartSkill))
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if err := databasePing(ctx); err != nil {
			writeMiddlewareError(w, http.StatusServiceUnavailable, "NOT_READY", "Base de données indisponible.")
			return
		}
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	})

	return Chain(
		mux,
		Recover(logger),
		SecurityHeaders,
		RequestDeadline,
		CORS(allowedOrigin),
		RequireTrustedOrigin(allowedOrigin),
	)
}
