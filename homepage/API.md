# Go API contract (for sync + auth)

Configure `src/environments/environment.ts` → `apiUrl` (e.g. `http://localhost:8080`).

## CORS

Allow your Angular origin and credentials:

- `Access-Control-Allow-Credentials: true`
- `Access-Control-Allow-Origin: http://localhost:4200` (not `*` when using cookies)

## Endpoints

### `GET /api/auth/me`

Returns `200` + JSON when the user is logged in:

```json
{ "email": "user@gmail.com", "name": "Name", "picture": "https://..." }
```

Returns `401` when not logged in.  
The app uses this to show **Sign in** vs email + **Sign out**.

### `POST /api/auth/logout`

Clears session; optional. App then reloads home.

### `GET /auth/google?return_url=...`

Your Google OAuth start URL (see `googleAuthPath` in environment).  
After success, redirect to `return_url` and set session cookie (or return JWT to store in `localStorage` as `access_token`).

### `GET /api/homepage`

Returns the same shape as local storage backup:

```json
{
  "activeTabId": "t_xxx",
  "tabs": [
    {
      "id": "t_xxx",
      "name": "Home",
      "quickLinks": [
        { "id": "q_xxx", "title": "", "url": "", "emoji": "", "x": 0, "y": 0, "w": 1, "h": 1 }
      ],
      "groups": [
        {
          "id": "g_xxx",
          "title": "",
          "emoji": "",
          "x": 0,
          "y": 1,
          "w": 3,
          "h": 2,
          "links": [{ "title": "", "url": "", "emoji": "" }]
        }
      ],
      "widgets": [
        {
          "id": "w_xxx",
          "title": "",
          "html": "<div></div>",
          "css": "",
          "js": "",
          "x": 0,
          "y": 5,
          "w": 4,
          "h": 2
        }
      ]
    }
  ],
  "settings": {
    "theme": "default",
    "wallpaper": "wallpaper-lakeside",
    "customWallUrl": "",
    "overlay": 0.46,
    "blur": 16,
    "searchEngine": "google",
    "showClock": true,
    "userName": ""
  },
  "todos": [{ "text": "", "done": false }],
  "notes": ""
}
```

Notes:
- The backend stores the homepage payload as JSON and returns it back as-is.
- The current frontend layout relies on explicit grid coordinates and spans via `x`, `y`, `w`, and `h`.
- Widgets are tab-local inside each tab’s `widgets` array; the older global `customWidgets` shape is legacy data only.

### `PUT /api/homepage`

Body: same JSON. Called after edits when the user is logged in.

## Client behavior

- All requests to `apiUrl` use **`withCredentials: true`**.
- Optional header: `Authorization: Bearer <token>` if `localStorage.access_token` is set.
