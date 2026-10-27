package handlers

import (
	"context"
	"database/sql"
	"net/http"
	"time"
)

// GetUser is the corrected version: bounded context, parameterised query,
// no panic in the request path.
func GetUser(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
		defer cancel()

		rows, err := db.QueryContext(ctx, "SELECT id, email FROM users WHERE id = $1", r.URL.Query().Get("id"))
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		defer rows.Close()
	}
}
