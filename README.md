# 🎮 Game Account Manager

**One account for all your games.** Sign up once, then use the same username and password in every connected game.

## Connected games

- **♠ Court Piece** (online-hokm) — online multiplayer card game
- **🐍 Neon Slither** — online snake arena

## How it works

| Part | Tech |
|---|---|
| Account storage | Cloudflare Durable Object (`AccountDO`) with SQLite storage |
| Passwords | PBKDF2 (SHA-256, 100k iterations) — never stored in plain text |
| Sessions | Random 48-hex tokens, 30-day expiry |
| API | Public JSON API with CORS — any game can integrate |

## API (for games)

| Endpoint | Method | Body | Returns |
|---|---|---|---|
| `/api/signup` | POST | `{username, password}` | `{token, username}` |
| `/api/login` | POST | `{username, password}` | `{token, username}` |
| `/api/me` | GET | `?token=...` | `{username, createdAt}` |
| `/api/change-password` | POST | `{token, oldPassword, newPassword}` | `{ok}` |
| `/api/logout` | POST | `{token}` | `{ok}` |
| `/api/ping` | GET | — | `{ok}` |

## Deploy

```bash
npm install
npx wrangler login
npm run deploy
```

## License

MIT
