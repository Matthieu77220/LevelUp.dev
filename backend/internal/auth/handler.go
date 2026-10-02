package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"mime"
	"net"
	"net/http"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
)

const maxRequestBody = 4096

var usernamePattern = regexp.MustCompile(`^[A-Za-z0-9_]{3,32}$`)

type Handler struct {
	store         authStore
	hashing       chan struct{}
	cookieName    string
	cookieSecure  bool
	sessionTTL    time.Duration
	dummyPassword string
	logger        *slog.Logger
}

type authStore interface {
	CreateUserWithSession(context.Context, string, string, []byte, []byte, net.IP, time.Time) (User, error)
	CredentialsByUsername(context.Context, string) (credentials, error)
	CreateSession(context.Context, string, []byte, []byte, net.IP, time.Time) error
	UserBySession(context.Context, []byte) (User, error)
	RevokeSession(context.Context, []byte) error
	RecordEvent(context.Context, *string, string, string, net.IP)
}

type credentialsRequest struct {
	Username             string `json:"username"`
	Password             string `json:"password"`
	PasswordConfirmation string `json:"passwordConfirmation,omitempty"`
}

func NewHandler(store authStore, cookieName string, cookieSecure bool, sessionTTL time.Duration, logger *slog.Logger) (*Handler, error) {
	dummy, err := HashPassword("levelup-dummy-password-never-used")
	if err != nil {
		return nil, err
	}
	return &Handler{store: store, hashing: make(chan struct{}, 4), cookieName: cookieName, cookieSecure: cookieSecure, sessionTTL: sessionTTL, dummyPassword: dummy, logger: logger}, nil
}

// Bound concurrent memory-hard operations without building an unbounded queue.
func (h *Handler) acquireHashing(w http.ResponseWriter) bool {
	select {
	case h.hashing <- struct{}{}:
		return true
	default:
		w.Header().Set("Retry-After", "1")
		writeError(w, http.StatusServiceUnavailable, "AUTH_BUSY", "Authentification temporairement indisponible.")
		return false
	}
}

func (h *Handler) Register(w http.ResponseWriter, r *http.Request) {
	request, ok := decodeCredentials(w, r)
	if !ok {
		return
	}
	request.Username = strings.TrimSpace(request.Username)

	if !usernamePattern.MatchString(request.Username) {
		writeError(w, http.StatusUnprocessableEntity, "INVALID_USERNAME", "Le nom d’utilisateur doit contenir 3 à 32 lettres, chiffres ou underscores.")
		return
	}
	if message := validatePassword(request.Password); message != "" {
		writeError(w, http.StatusUnprocessableEntity, "INVALID_PASSWORD", message)
		return
	}
	if request.Password != request.PasswordConfirmation {
		writeError(w, http.StatusUnprocessableEntity, "PASSWORD_MISMATCH", "Les mots de passe ne correspondent pas.")
		return
	}

	if !h.acquireHashing(w) {
		return
	}
	passwordHash, err := HashPassword(request.Password)
	<-h.hashing
	if err != nil {
		h.logger.Error("password hashing failed", "error", err)
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Une erreur interne est survenue.")
		return
	}
	token, tokenHash, err := newSessionToken()
	if err != nil {
		h.logger.Error("session token generation failed", "error", err)
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Une erreur interne est survenue.")
		return
	}

	ip := clientIP(r)
	user, err := h.store.CreateUserWithSession(r.Context(), request.Username, passwordHash, tokenHash, userAgentHash(r), ip, time.Now().Add(h.sessionTTL))
	if errors.Is(err, ErrUsernameTaken) {
		h.store.RecordEvent(r.Context(), nil, request.Username, "REGISTER_FAILED", ip)
		writeError(w, http.StatusConflict, "USERNAME_UNAVAILABLE", "Ce nom d’utilisateur n’est pas disponible.")
		return
	}
	if err != nil {
		h.logger.Error("registration transaction failed", "error", err)
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Une erreur interne est survenue.")
		return
	}

	h.store.RecordEvent(r.Context(), &user.ID, user.Username, "REGISTER_SUCCEEDED", ip)
	h.setSessionCookie(w, token)
	writeJSON(w, http.StatusCreated, map[string]any{"user": user})
}

func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	request, ok := decodeCredentials(w, r)
	if !ok {
		return
	}
	request.Username = strings.TrimSpace(request.Username)
	ip := clientIP(r)
	if !usernamePattern.MatchString(request.Username) || len(request.Password) == 0 || len(request.Password) > 128 {
		writeError(w, http.StatusUnauthorized, "INVALID_CREDENTIALS", "Nom d’utilisateur ou mot de passe incorrect.")
		return
	}

	credentials, err := h.store.CredentialsByUsername(r.Context(), request.Username)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		h.logger.Error("login lookup failed", "error", err)
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Une erreur interne est survenue.")
		return
	}
	passwordHash := h.dummyPassword
	if err == nil && credentials.PasswordHash != "" {
		passwordHash = credentials.PasswordHash
	}
	if !h.acquireHashing(w) {
		return
	}
	passwordOK, hashErr := VerifyPassword(request.Password, passwordHash)
	<-h.hashing
	if hashErr != nil {
		h.logger.Error("password hash verification failed", "error", hashErr)
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Une erreur interne est survenue.")
		return
	}
	if err != nil || credentials.PasswordHash == "" || !passwordOK || credentials.Status != "ACTIVE" {
		h.store.RecordEvent(r.Context(), nil, request.Username, "LOGIN_FAILED", ip)
		writeError(w, http.StatusUnauthorized, "INVALID_CREDENTIALS", "Nom d’utilisateur ou mot de passe incorrect.")
		return
	}

	token, tokenHash, err := newSessionToken()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Une erreur interne est survenue.")
		return
	}
	if err = h.store.CreateSession(r.Context(), credentials.ID, tokenHash, userAgentHash(r), ip, time.Now().Add(h.sessionTTL)); err != nil {
		h.logger.Error("session creation failed", "error", err)
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Une erreur interne est survenue.")
		return
	}

	h.store.RecordEvent(r.Context(), &credentials.ID, credentials.Username, "LOGIN_SUCCEEDED", ip)
	h.setSessionCookie(w, token)
	writeJSON(w, http.StatusOK, map[string]any{"user": credentials.User})
}

func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	_, tokenHash, ok := h.sessionFromRequest(w, r)
	if !ok {
		return
	}
	user, err := h.store.UserBySession(r.Context(), tokenHash)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			h.clearSessionCookie(w)
			writeError(w, http.StatusUnauthorized, "UNAUTHENTICATED", "Session absente ou expirée.")
			return
		}
		h.logger.Error("session lookup failed", "error", err)
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Une erreur interne est survenue.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": user})
}

func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie(h.cookieName)
	if err == nil && validSessionToken(cookie.Value) {
		hash := sha256.Sum256([]byte(cookie.Value))
		tokenHash := hash[:]
		if err := h.store.RevokeSession(r.Context(), tokenHash); err != nil {
			h.logger.Error("session revocation failed", "error", err)
			writeError(w, http.StatusServiceUnavailable, "LOGOUT_FAILED", "La déconnexion a échoué. Réessaie.")
			return
		}
	}
	h.clearSessionCookie(w)
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) sessionFromRequest(w http.ResponseWriter, r *http.Request) (string, []byte, bool) {
	cookie, err := r.Cookie(h.cookieName)
	if err != nil || !validSessionToken(cookie.Value) {
		writeError(w, http.StatusUnauthorized, "UNAUTHENTICATED", "Session absente ou expirée.")
		return "", nil, false
	}
	hash := sha256.Sum256([]byte(cookie.Value))
	return cookie.Value, hash[:], true
}

func validSessionToken(token string) bool {
	if len(token) != 43 {
		return false
	}
	raw, err := base64.RawURLEncoding.Strict().DecodeString(token)
	return err == nil && len(raw) == 32
}

func (h *Handler) setSessionCookie(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{Name: h.cookieName, Value: token, Path: "/", HttpOnly: true, Secure: h.cookieSecure, SameSite: http.SameSiteStrictMode})
}

func (h *Handler) clearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{Name: h.cookieName, Value: "", Path: "/", HttpOnly: true, Secure: h.cookieSecure, SameSite: http.SameSiteStrictMode, MaxAge: -1, Expires: time.Unix(1, 0)})
}

func decodeCredentials(w http.ResponseWriter, r *http.Request) (credentialsRequest, bool) {
	var request *credentialsRequest
	contentType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || contentType != "application/json" {
		writeError(w, http.StatusUnsupportedMediaType, "JSON_REQUIRED", "Le contenu doit être au format JSON.")
		return credentialsRequest{}, false
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxRequestBody))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil || request == nil {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "La requête est invalide.")
		return credentialsRequest{}, false
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "La requête doit contenir un seul objet JSON.")
		return credentialsRequest{}, false
	}
	return *request, true
}

func validatePassword(password string) string {
	if !utf8.ValidString(password) {
		return "Le mot de passe contient des caractères invalides."
	}
	if utf8.RuneCountInString(password) < 12 {
		return "Le mot de passe doit contenir au moins 12 caractères."
	}
	if len(password) > 128 {
		return "Le mot de passe ne peut pas dépasser 128 octets."
	}
	return ""
}

func newSessionToken() (string, []byte, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", nil, err
	}
	token := base64.RawURLEncoding.EncodeToString(raw)
	hash := sha256.Sum256([]byte(token))
	return token, hash[:], nil
}

func userAgentHash(r *http.Request) []byte {
	if r.UserAgent() == "" {
		return nil
	}
	hash := sha256.Sum256([]byte(r.UserAgent()))
	return hash[:]
}

func clientIP(r *http.Request) net.IP {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return nil
	}
	return net.ParseIP(host)
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]any{"error": map[string]string{"code": code, "message": message}})
}
