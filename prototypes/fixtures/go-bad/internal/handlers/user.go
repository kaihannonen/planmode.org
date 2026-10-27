package handlers

import (
	"database/sql"
	"net/http"
)

// GetUser is deliberately wrong: no timeout, raw SQL, panic on error.
func GetUser(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := db.Query("SELECT id, email FROM users")
		if err != nil {
			panic(err)
		}
		defer rows.Close()
	}
}
