# CORS: scotts.house → api.scotts.house

The site at **scotts.house** (Cloudflare Pages) and the API at **api.scotts.house**
(a read-only Home Assistant proxy written in Go, running on the home network and
exposed through a Cloudflare Tunnel) are **two different origins**. Every call the
browser makes from the site to the API is therefore a **CORS request**.

CORS is enforced by the browser but **granted by the server**. The static site
cannot grant itself access — **the Go API must send the right response headers**.
A `_headers` file on the Pages site does nothing here, because it only affects
responses from scotts.house, not from api.scotts.house.

## What the API must send

For a normal `GET`:

```
Access-Control-Allow-Origin: https://scotts.house
Vary: Origin
```

Because the client sends an `Authorization: Bearer …` header (see `ha-api.js`),
the browser first sends a **preflight** `OPTIONS` request. The API must answer
that (typically `204 No Content`) with:

```
Access-Control-Allow-Origin: https://scotts.house
Vary: Origin
Access-Control-Allow-Methods: GET, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type
Access-Control-Max-Age: 86400
```

## Implementation

`cors.go` in this repo is a ready-to-paste `net/http` middleware. Copy it into the
API project and wrap your router:

```go
log.Fatal(http.ListenAndServe(addr, withCORS(mux)))
```

It reflects a specific allowed origin (`https://scotts.house`) instead of using
`*`. Don't use the `*` wildcard here: it's broader than needed for a window into a
home network, and `*` can't be combined with credentialed requests.

## Gotchas

- **Reflect the origin, don't wildcard.** Keep the all-list in `cors.go` tight.
- **Always send `Vary: Origin`** so Cloudflare's cache doesn't hand one origin's
  CORS headers to another.
- **Let the Tunnel pass headers through.** Cloudflare Tunnel forwards your
  response headers as-is; just make sure no Cloudflare *Transform Rule* or cache
  rule strips `Access-Control-*`.
- **Local testing:** when running `hugo server` (default `http://localhost:1313`),
  add that origin to `allowedOrigins` in `cors.go` so the dev site can reach the
  API.
- The API is **read-only**, so `GET, OPTIONS` is all the methods list needs. Add
  more only if the surface grows.
