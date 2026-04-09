# Homepage API (Go)

Google OAuth, JWT session cookie, MongoDB for user + homepage JSON.

## Prerequisites

- Go 1.22+
- MongoDB running locally or Atlas URI
- [Google OAuth client](https://console.cloud.google.com/apis/credentials) (Web application)

### Google Cloud setup

1. Create **OAuth 2.0 Client ID** (Web application).
2. **Authorized JavaScript origins**: `http://localhost:4200` (Angular dev).
3. **Authorized redirect URIs** (must match `OAUTH_REDIRECT_URL` exactly):
   - Docker Compose (frontend proxies `/auth` → API): `http://localhost:4200/auth/google/callback`
   - Local dev (API served directly on 8080): `http://localhost:8080/auth/google/callback`

## Run

```bash
cp .env.example .env
# Edit .env with real values

go run .
# or
go build -o bin/homepage-api . && ./bin/homepage-api
```

Server listens on `:8080` by default.

## Environment

| Variable | Description |
|----------|-------------|
| `MONGO_URI` | e.g. `mongodb://localhost:27017` or Atlas connection string |
| `MONGO_DB` | Database name (default `homepage`) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | From Google Cloud |
| `OAUTH_REDIRECT_URL` | Exact callback URL registered in Google |
| `FRONTEND_ORIGIN` | Angular origin for CORS and post-login redirect allowlist |
| `JWT_SECRET` | HMAC secret for session JWT (16+ chars) |

## API

| Method | Path | Auth |
|--------|------|------|
| GET | `/auth/google?return_url=...` | Start OAuth |
| GET | `/auth/google/callback` | Google redirect (sets cookie) |
| GET | `/api/auth/me` | Optional session |
| POST | `/api/auth/logout` | Clears cookie |
| GET | `/api/homepage` | Session required |
| PUT | `/api/homepage` | Session required, JSON body |

Angular should use `withCredentials: true` and `apiUrl` pointing at this server (see `homepage/API.md`).

## MongoDB collections

- **users** — `google_sub` (unique), email, name, picture
- **homepages** — `user_id` (unique), `data` (homepage JSON object)

The server stores the homepage payload as an opaque JSON document. The current frontend shape includes:
- tab-local `widgets`
- explicit grid layout on links, groups, and widgets via `x`, `y`, `w`, `h`
- settings, todos, and notes in the same document

### MongoDB: `(Unauthorized) createIndexes requires authentication`

Your server is connecting **without** credentials, but MongoDB has **auth enabled**.

1. **Use a URI that includes the user + password**, and the correct **`authSource`** (the DB where that user was created).

   If you ran `createUser` while `use homepage`:

   ```env
   MONGO_URI=mongodb://homepage-user:homepage-pass@127.0.0.1:27017/homepage?authSource=homepage
   ```

   If the user lives in `admin` (e.g. root):

   ```env
   MONGO_URI=mongodb://root:yourpass@127.0.0.1:27017/admin?authSource=admin
   ```

   Keep `MONGO_DB=homepage` — the app still uses the `homepage` database for collections.

2. **Special characters in the password** must be URL-encoded in the URI (`@` → `%40`, `#` → `%23`, etc.).

3. **Creating the first user**: if you can’t run `createUser` on `homepage`, connect as an admin user (or briefly run Mongo **without** `--auth`), create the user, then re-enable auth.

4. **Test the URI** (replace values):

   ```bash
   mongosh "mongodb://homepage-user:homepage-pass@127.0.0.1:27017/homepage?authSource=homepage" --eval 'db.runCommand({ ping: 1 })'
   ```

   If `ping` succeeds, use that same string as `MONGO_URI` in `.env`.
