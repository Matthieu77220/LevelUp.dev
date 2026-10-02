package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"levelup.dev/backend/internal/auth"
	"levelup.dev/backend/internal/config"
	"levelup.dev/backend/internal/httpapi"
	"levelup.dev/backend/internal/learning"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	if err := run(logger); err != nil {
		logger.Error("API stopped", "error", err)
		os.Exit(1)
	}
}

func run(logger *slog.Logger) error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("invalid configuration: %w", err)
	}

	poolConfig, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		return errors.New("invalid database URL (details omitted to protect credentials)")
	}
	poolConfig.MaxConns = 20
	poolConfig.MinConns = 2
	poolConfig.MaxConnLifetime = time.Hour
	poolConfig.MaxConnIdleTime = 15 * time.Minute

	pool, err := pgxpool.NewWithConfig(context.Background(), poolConfig)
	if err != nil {
		return errors.New("could not open database pool")
	}
	defer pool.Close()

	pingContext, cancelPing := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancelPing()
	if err = pool.Ping(pingContext); err != nil {
		return errors.New("database unavailable: check PostgreSQL and database credentials")
	}

	authHandler, err := auth.NewHandler(auth.NewStore(pool), cfg.CookieName, cfg.CookieSecure, cfg.SessionTTL, logger)
	if err != nil {
		return fmt.Errorf("initialize authentication: %w", err)
	}

	server := &http.Server{
		Addr:              cfg.Address,
		Handler:           httpapi.NewRouter(authHandler, learning.NewHandler(learning.NewStore(pool), logger), cfg.FrontendOrigin, logger, pool.Ping),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      32 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    1 << 20,
	}

	listener, err := net.Listen("tcp", cfg.Address)
	if err != nil {
		return fmt.Errorf("listen on %s: %w", cfg.Address, err)
	}
	defer listener.Close()
	shutdownSignal, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	serveErrors := make(chan error, 1)
	go func() {
		serveErrors <- server.Serve(listener)
	}()
	logger.Info("API listening", "address", listener.Addr().String(), "frontendOrigin", cfg.FrontendOrigin)
	select {
	case err = <-serveErrors:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	case <-shutdownSignal.Done():
		shutdownContext, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if shutdownErr := server.Shutdown(shutdownContext); shutdownErr != nil {
			_ = server.Close()
			return fmt.Errorf("graceful shutdown: %w", shutdownErr)
		}
	}
	return nil
}
