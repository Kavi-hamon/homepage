package store

import (
	"context"
	"encoding/json"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type User struct {
	ID                 primitive.ObjectID `bson:"_id,omitempty"`
	GoogleSub          string             `bson:"google_sub"`
	Email              string             `bson:"email"`
	Name               string             `bson:"name"`
	Picture            string             `bson:"picture"`
	CreatedAt          time.Time          `bson:"created_at"`
	GoogleAccessToken  string             `bson:"google_access_token,omitempty"`
	GoogleRefreshToken string             `bson:"google_refresh_token,omitempty"`
	GoogleTokenExpiry  time.Time          `bson:"google_token_expiry,omitempty"`
}

type homepageDoc struct {
	UserID    primitive.ObjectID     `bson:"user_id"`
	Data      map[string]interface{} `bson:"data"`
	UpdatedAt time.Time              `bson:"updated_at"`
}

type DB struct {
	client   *mongo.Client
	database string
}

func Connect(ctx context.Context, uri, dbName string) (*DB, error) {
	client, err := mongo.Connect(ctx, options.Client().ApplyURI(uri))
	if err != nil {
		return nil, err
	}
	if err := client.Ping(ctx, nil); err != nil {
		_ = client.Disconnect(ctx)
		return nil, err
	}
	d := &DB{client: client, database: dbName}
	if err := d.ensureIndexes(ctx); err != nil {
		return nil, err
	}
	return d, nil
}

func (d *DB) Close(ctx context.Context) error {
	return d.client.Disconnect(ctx)
}

func (d *DB) ensureIndexes(ctx context.Context) error {
	users := d.client.Database(d.database).Collection("users")
	_, err := users.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "google_sub", Value: 1}},
		Options: options.Index().SetUnique(true),
	})
	if err != nil {
		return err
	}
	hp := d.client.Database(d.database).Collection("homepages")
	_, err = hp.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "user_id", Value: 1}},
		Options: options.Index().SetUnique(true),
	})
	return err
}

func (d *DB) UpsertUser(ctx context.Context, sub, email, name, picture string) (*User, error) {
	col := d.client.Database(d.database).Collection("users")
	now := time.Now().UTC()
	filter := bson.M{"google_sub": sub}
	update := bson.M{
		"$set": bson.M{
			"email":      email,
			"name":       name,
			"picture":    picture,
			"updated_at": now,
		},
		"$setOnInsert": bson.M{
			"google_sub": sub,
			"created_at": now,
		},
	}
	_, err := col.UpdateOne(ctx, filter, update, options.Update().SetUpsert(true))
	if err != nil {
		return nil, err
	}
	var u User
	if err := col.FindOne(ctx, filter).Decode(&u); err != nil {
		return nil, err
	}
	return &u, nil
}

func (d *DB) UserByID(ctx context.Context, id primitive.ObjectID) (*User, error) {
	col := d.client.Database(d.database).Collection("users")
	var u User
	err := col.FindOne(ctx, bson.M{"_id": id}).Decode(&u)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (d *DB) GetHomepageData(ctx context.Context, userID primitive.ObjectID) ([]byte, bool, error) {
	col := d.client.Database(d.database).Collection("homepages")
	var doc homepageDoc
	err := col.FindOne(ctx, bson.M{"user_id": userID}).Decode(&doc)
	if err == mongo.ErrNoDocuments {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	b, err := json.Marshal(doc.Data)
	return b, true, err
}

func (d *DB) SaveGoogleTokens(ctx context.Context, userID primitive.ObjectID, accessToken, refreshToken string, expiry time.Time) error {
	col := d.client.Database(d.database).Collection("users")
	update := bson.M{"$set": bson.M{
		"google_access_token":  accessToken,
		"google_refresh_token": refreshToken,
		"google_token_expiry":  expiry,
	}}
	_, err := col.UpdateOne(ctx, bson.M{"_id": userID}, update)
	return err
}

func (d *DB) SaveHomepageData(ctx context.Context, userID primitive.ObjectID, rawJSON []byte) error {
	var m map[string]interface{}
	if err := json.Unmarshal(rawJSON, &m); err != nil {
		return err
	}
	col := d.client.Database(d.database).Collection("homepages")
	now := time.Now().UTC()
	_, err := col.UpdateOne(ctx,
		bson.M{"user_id": userID},
		bson.M{
			"$set": bson.M{
				"data":       m,
				"updated_at": now,
			},
			"$setOnInsert": bson.M{"user_id": userID},
		},
		options.Update().SetUpsert(true),
	)
	return err
}
