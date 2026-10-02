package auth

import (
	"strings"
	"testing"
)

func TestHashAndVerifyPassword(t *testing.T) {
	password := "une-phrase-secrete-solide"
	encoded, err := HashPassword(password)
	if err != nil {
		t.Fatalf("HashPassword returned an error: %v", err)
	}
	if strings.Contains(encoded, password) {
		t.Fatal("encoded hash contains the clear-text password")
	}

	valid, err := VerifyPassword(password, encoded)
	if err != nil {
		t.Fatalf("VerifyPassword returned an error: %v", err)
	}
	if !valid {
		t.Fatal("correct password was rejected")
	}

	valid, err = VerifyPassword("mauvais-mot-de-passe", encoded)
	if err != nil {
		t.Fatalf("VerifyPassword returned an error: %v", err)
	}
	if valid {
		t.Fatal("incorrect password was accepted")
	}
}

func TestHashPasswordUsesUniqueSalt(t *testing.T) {
	first, err := HashPassword("mot-de-passe-identique")
	if err != nil {
		t.Fatal(err)
	}
	second, err := HashPassword("mot-de-passe-identique")
	if err != nil {
		t.Fatal(err)
	}
	if first == second {
		t.Fatal("two hashes unexpectedly use the same salt")
	}
}

func TestValidatePassword(t *testing.T) {
	tests := []struct {
		name     string
		password string
		valid    bool
	}{
		{name: "too short", password: "short", valid: false},
		{name: "minimum", password: "123456789012", valid: true},
		{name: "unicode", password: "phrase-secrète-très-longue", valid: true},
		{name: "too large", password: strings.Repeat("a", 129), valid: false},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			message := validatePassword(test.password)
			if test.valid && message != "" {
				t.Fatalf("valid password rejected: %s", message)
			}
			if !test.valid && message == "" {
				t.Fatal("invalid password accepted")
			}
		})
	}
}

func TestRejectMalformedHashes(t *testing.T) {
	encoded, err := HashPassword("a-valid-test-password")
	if err != nil {
		t.Fatal(err)
	}
	for _, hash := range []string{
		"", strings.Repeat("x", 257),
		"prefix" + encoded,
		strings.Replace(encoded, "v=19", "v=19junk", 1),
		strings.Replace(encoded, "p=1", "p=1junk", 1),
		strings.Replace(encoded, "m=19456", "m=999999", 1),
		strings.Replace(encoded, "p=1", "p=0", 1),
	} {
		if ok, err := VerifyPassword("a-valid-test-password", hash); err == nil || ok {
			t.Errorf("malformed hash accepted")
		}
	}
}
