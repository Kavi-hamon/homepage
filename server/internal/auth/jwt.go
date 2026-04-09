package auth

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

var ErrInvalidToken = errors.New("invalid token")

type Claims struct {
	UserID string `json:"sub"`
	jwt.RegisteredClaims
}

func SignUserID(secret string, userID primitive.ObjectID, ttl time.Duration) (string, error) {
	claims := Claims{
		UserID: userID.Hex(),
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(ttl)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	t := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return t.SignedString([]byte(secret))
}

func ParseUserID(secret, token string) (primitive.ObjectID, error) {
	claims := &Claims{}
	t, err := jwt.ParseWithClaims(token, claims, func(*jwt.Token) (interface{}, error) {
		return []byte(secret), nil
	})
	if err != nil || !t.Valid {
		return primitive.NilObjectID, ErrInvalidToken
	}
	id, err := primitive.ObjectIDFromHex(claims.UserID)
	if err != nil {
		return primitive.NilObjectID, ErrInvalidToken
	}
	return id, nil
}
