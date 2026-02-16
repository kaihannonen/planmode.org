# Security Headers Rules

## Required HTTP headers

Every web application must set the following security headers on all responses:

### Strict-Transport-Security (HSTS)

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

- Always enable HSTS in production. The `max-age` must be at least 1 year (31536000 seconds). 2 years (63072000) is recommended.
- Include `includeSubDomains` to protect all subdomains.
- Add `preload` and submit to the HSTS preload list (hstspreload.org) for production domains.

### Content-Security-Policy (CSP)

Start with a restrictive policy and relax as needed:

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
```

- Never use `'unsafe-eval'` in `script-src`. If a library requires it, find an alternative.
- Use nonces or hashes for inline scripts instead of `'unsafe-inline'` in `script-src`.
- `'unsafe-inline'` in `style-src` is acceptable when using CSS-in-JS libraries, but prefer nonces when possible.
- Set `frame-ancestors 'none'` unless the site needs to be embedded in iframes.
- Use `report-uri` or `report-to` to monitor CSP violations in production.

### X-Content-Type-Options

```
X-Content-Type-Options: nosniff
```

Always set this header. It prevents the browser from MIME-sniffing the content type.

### X-Frame-Options

```
X-Frame-Options: DENY
```

Use `DENY` unless the application needs to be framed. Use `SAMEORIGIN` if same-origin framing is required. Note: `frame-ancestors` in CSP supersedes this header in modern browsers, but set both for backward compatibility.

### Referrer-Policy

```
Referrer-Policy: strict-origin-when-cross-origin
```

This sends the origin for cross-origin requests but the full URL for same-origin requests. Never use `no-referrer-when-downgrade` (the old default) or `unsafe-url`.

### Permissions-Policy

```
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
```

Explicitly disable browser features that the application does not use. Add permissions as needed (e.g., `camera=(self)` if the app uses the camera).

## HTTPS rules

- All production traffic must be served over HTTPS. Never serve authenticated pages over HTTP.
- Redirect all HTTP requests to HTTPS with a 301 permanent redirect.
- Use TLS 1.2 or higher. Disable TLS 1.0 and 1.1.
- Use strong cipher suites. Prefer ECDHE key exchange and AES-GCM.

## Cookie security

- Set `Secure` flag on all cookies in production (cookies only sent over HTTPS).
- Set `HttpOnly` flag on session cookies (prevents JavaScript access).
- Set `SameSite=Lax` as the default. Use `SameSite=Strict` for sensitive operations. Only use `SameSite=None; Secure` when cross-site access is genuinely needed.
- Set a reasonable `Max-Age` or `Expires` for session cookies. Never use session cookies that persist indefinitely.
- Use the `__Host-` prefix for session cookies to prevent subdomain attacks: `__Host-session=abc; Secure; Path=/; HttpOnly; SameSite=Lax`.

## Implementation patterns

### Next.js

Set headers in `next.config.js`:

```javascript
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

module.exports = {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};
```

### Express

Use the `helmet` middleware:

```javascript
const helmet = require("helmet");
app.use(helmet());
```

### Nginx

Add to the server block:

```nginx
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
```

## Validation

After deploying, verify headers using:

- `curl -I https://your-domain.com`
- securityheaders.com
- Mozilla Observatory (observatory.mozilla.org)

Target an A+ rating on securityheaders.com.
