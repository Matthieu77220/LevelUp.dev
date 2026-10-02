package learning

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"levelup.dev/backend/internal/auth"
)

type Handler struct {
	store           *Store
	logger          *slog.Logger
	evaluationSlots chan struct{}
}

func NewHandler(store *Store, logger *slog.Logger) *Handler {
	return &Handler{store: store, logger: logger, evaluationSlots: make(chan struct{}, 2)}
}

func (h *Handler) Catalog(w http.ResponseWriter, r *http.Request, user auth.User) {
	catalog, err := h.store.Catalog(r.Context(), user.ID)
	if err != nil {
		h.logger.Error("catalog lookup failed", "error", err)
		writeError(w, http.StatusInternalServerError, "CATALOG_UNAVAILABLE", "Le catalogue est momentanément indisponible.")
		return
	}
	writeJSON(w, http.StatusOK, catalog)
}

func (h *Handler) StartSkill(w http.ResponseWriter, r *http.Request, user auth.User) {
	skillID := r.PathValue("skillID")
	var id pgtype.UUID
	if err := id.Scan(skillID); err != nil || !id.Valid {
		writeError(w, http.StatusBadRequest, "INVALID_SKILL", "Identifiant de compétence invalide.")
		return
	}
	progress, err := h.store.StartSkill(r.Context(), user.ID, skillID)
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		writeError(w, http.StatusNotFound, "SKILL_NOT_FOUND", "Cette compétence n’est pas disponible.")
	case errors.Is(err, ErrLocked):
		writeError(w, http.StatusConflict, "SKILL_LOCKED", "Les prérequis de cette compétence ne sont pas encore validés.")
	case err != nil:
		h.logger.Error("skill start failed", "error", err)
		writeError(w, http.StatusInternalServerError, "START_FAILED", "Impossible de démarrer cette compétence. Réessaie.")
	default:
		writeJSON(w, http.StatusOK, progress)
	}
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
