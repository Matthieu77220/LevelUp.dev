package config

import "testing"

func TestConfigurationGuards(t *testing.T) {
	for _, tc := range []struct {
		name, origin, secure, environment, ttl string
		valid                                  bool
	}{
		{"local", "http://localhost:5173", "false", "development", "24h", true},
		{"production", "https://levelup.example", "true", "production", "24h", true},
		{"insecure production", "https://levelup.example", "false", "production", "24h", false},
		{"http production", "http://levelup.example", "true", "production", "24h", false},
		{"origin path", "https://levelup.example/path", "true", "production", "24h", false},
		{"origin credentials", "https://user:secret@levelup.example", "true", "production", "24h", false},
		{"short ttl", "http://localhost:5173", "false", "development", "1m", false},
		{"long ttl", "http://localhost:5173", "false", "development", "721h", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("DATABASE_URL", "postgresql://localhost/test")
			t.Setenv("FRONTEND_ORIGIN", tc.origin)
			t.Setenv("COOKIE_SECURE", tc.secure)
			t.Setenv("APP_ENV", tc.environment)
			t.Setenv("SESSION_TTL", tc.ttl)
			_, err := Load()
			if (err == nil) != tc.valid {
				t.Fatalf("valid=%v, error=%v", tc.valid, err)
			}
		})
	}
}
