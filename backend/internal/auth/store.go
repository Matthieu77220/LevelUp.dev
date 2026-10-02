package auth

import (
	"context"
	"errors"
	"net"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrUsernameTaken = errors.New("username already exists")

type User struct {
	ID        string    `json:"id"`
	Username  string    `json:"username"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"createdAt"`
}

type credentials struct {
	User
	PasswordHash string
}

type Store struct{ pool *pgxpool.Pool }

func NewStore(pool *pgxpool.Pool) *Store { return &Store{pool: pool} }

func (s *Store) CreateUserWithSession(ctx context.Context, username, passwordHash string, tokenHash, agentHash []byte, ip net.IP, expiresAt time.Time) (User, error) {
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return User{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var user User
	err = tx.QueryRow(ctx, `
		INSERT INTO identity.users (username, password_hash, status)
		VALUES ($1, $2, 'ACTIVE')
		RETURNING id::text, username::text, status::text, created_at
	`, username, passwordHash).Scan(&user.ID, &user.Username, &user.Status, &user.CreatedAt)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" && pgErr.ConstraintName == "users_username_unique" {
			return User{}, ErrUsernameTaken
		}
		return User{}, err
	}

	if _, err = tx.Exec(ctx, `INSERT INTO identity.profiles (user_id, username, display_name) VALUES ($1, $2, $3)`, user.ID, user.Username, user.Username); err != nil {
		return User{}, err
	}
	if _, err = tx.Exec(ctx, `
		INSERT INTO identity.sessions (user_id, token_hash, user_agent_hash, ip_address, expires_at)
		VALUES ($1, $2, $3, $4, $5)
	`, user.ID, tokenHash, agentHash, nullableIP(ip), expiresAt); err != nil {
		return User{}, err
	}

	if err = tx.Commit(ctx); err != nil {
		return User{}, err
	}
	return user, nil
}

func (s *Store) CredentialsByUsername(ctx context.Context, username string) (credentials, error) {
	var result credentials
	err := s.pool.QueryRow(ctx, `
		SELECT id::text, username::text, status::text, created_at, COALESCE(password_hash, '')
		FROM identity.users
		WHERE username = $1 AND deleted_at IS NULL
	`, username).Scan(&result.ID, &result.Username, &result.Status, &result.CreatedAt, &result.PasswordHash)
	return result, err
}

func (s *Store) CreateSession(ctx context.Context, userID string, tokenHash, agentHash []byte, ip net.IP, expiresAt time.Time) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO identity.sessions (user_id, token_hash, user_agent_hash, ip_address, expires_at)
		VALUES ($1, $2, $3, $4, $5)
	`, userID, tokenHash, agentHash, nullableIP(ip), expiresAt)
	return err
}

func (s *Store) UserBySession(ctx context.Context, tokenHash []byte) (User, error) {
	var user User
	err := s.pool.QueryRow(ctx, `
		WITH touched AS (
			UPDATE identity.sessions SET last_seen_at = now()
			WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()
			  AND last_seen_at < now() - interval '5 minutes'
		)
		SELECT users.id::text, users.username::text, users.status::text, users.created_at
		FROM identity.sessions AS sessions
		JOIN identity.users AS users ON sessions.user_id = users.id
		WHERE sessions.token_hash = $1
		  AND sessions.user_id = users.id
		  AND sessions.revoked_at IS NULL
		  AND sessions.expires_at > now()
		  AND users.status = 'ACTIVE'
		  AND users.deleted_at IS NULL
	`, tokenHash).Scan(&user.ID, &user.Username, &user.Status, &user.CreatedAt)
	return user, err
}

func (s *Store) RevokeSession(ctx context.Context, tokenHash []byte) error {
	_, err := s.pool.Exec(ctx, `UPDATE identity.sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL`, tokenHash)
	return err
}

func (s *Store) RecordEvent(ctx context.Context, userID *string, username, event string, ip net.IP) {
	_, _ = s.pool.Exec(ctx, `
		INSERT INTO identity.authentication_events (user_id, username_attempted, event_type, ip_address)
		VALUES ($1, NULLIF($2, ''), $3, $4)
	`, userID, username, event, nullableIP(ip))
}

func nullableIP(ip net.IP) any {
	if ip == nil {
		return nil
	}
	return ip.String()
}
