import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

function uniqPreserve(xs: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const x of xs) {
    if (!x) continue
    if (seen.has(x)) continue
    seen.add(x)
    out.push(x)
  }
  return out
}

function dedupeDirective(directiveLine: string): string {
  const parts = directiveLine.trim().split(/\s+/)
  // directives like "block-all-mixed-content" have no sources
  if (parts.length <= 1) return directiveLine

  const directive = parts[0]!
  const sources = uniqPreserve(parts.slice(1))
  return [directive, ...sources].join(' ')
}

function generateNonceBase64(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!)
  return btoa(s)
}

function safeOrigin(urlLike: string | undefined): string | null {
  if (!urlLike) return null
  try {
    return new URL(urlLike).origin
  } catch {
    return null
  }
}

function originToWsOrigin(origin: string): string | null {
  try {
    const u = new URL(origin)
    const wsProto = u.protocol === 'https:' ? 'wss:' : u.protocol === 'http:' ? 'ws:' : null
    if (!wsProto) return null
    return `${wsProto}//${u.host}`
  } catch {
    return null
  }
}

function buildConnectSrc(req: NextRequest, isRelaxed: boolean): string {
  const allowedHttpOrigins = uniqPreserve([
    // Supabase browser client needs these.
    safeOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined),
    safeOrigin(process.env.SUPABASE_AUTH_PUBLIC_URL as string | undefined),
    // Some pages talk to MCP server from browser.
    safeOrigin(process.env.NEXT_PUBLIC_MCP_SERVER_URL as string | undefined),
    // MediaPipe Tasks Vision loads WASM from this CDN by default (unless you self-host the wasm files).
    'https://cdn.jsdelivr.net',
    // MediaPipe model assets (e.g. *.tflite) are served from Google Cloud Storage.
    'https://storage.googleapis.com',
  ].filter((v): v is string => typeof v === 'string' && v.length > 0))

  const allowedWsOrigins = uniqPreserve(
    allowedHttpOrigins
      .map(originToWsOrigin)
      .filter((v): v is string => typeof v === 'string' && v.length > 0)
  )

  // Allow same-host websocket endpoints explicitly (HMR in dev; other ws use-cases in prod).
  const host = req.headers.get('host') || req.nextUrl.host
  const selfWs = host ? uniqPreserve([`ws://${host}`, `wss://${host}`]) : []

  // Dev tooling often needs broad ws allowances; keep the previous behavior there.
  const relaxedExtras = isRelaxed ? uniqPreserve(['ws:', 'wss:']) : []

  // NOTE:
  // - three.js/GLTFLoader can fetch() from blob: URLs (e.g. textures/object URLs).
  // - Fetch/XHR/WebSocket are governed by `connect-src`, so we must allow blob: here.
  const sources = uniqPreserve([
    "'self'",
    'blob:',
    ...allowedHttpOrigins,
    ...allowedWsOrigins,
    ...selfWs,
    ...relaxedExtras,
  ])
  return ['connect-src', ...sources].join(' ')
}

function buildCsp(nonce: string, isRelaxed: boolean, connectSrc: string): string {
  // Phase B (production): nonce-based CSP, no unsafe-*
  // Relaxed mode: allow eval/inline to avoid breaking Next dev tooling.
  //
  // NOTE about styles:
  // - CSP nonces apply to <style> elements (and some link/script elements), but NOT to style="" attributes.
  // - This codebase uses React inline styles in multiple pages/components (style={{...}}), which become style=""
  //   attributes in the rendered HTML. A strict CSP that disallows inline styles will make those pages look "unstyled".
  // - To keep the app usable while still keeping script-src strict, we allow inline *style attributes* explicitly.
  const directives: string[] = [
    "default-src 'self'",
    // Next.js injects inline scripts; allow via nonce.
    [
      "script-src 'self'",
      `'nonce-${nonce}'`,
      // MediaPipe Tasks Vision dynamically loads vision_wasm_internal.js from jsDelivr; allow that CDN for script.
      "https://cdn.jsdelivr.net",
      // MediaPipe / WebAssembly compilation can be blocked by CSP unless wasm is explicitly allowed.
      // Prefer the narrower directive over 'unsafe-eval'.
      ...(isRelaxed ? [] : ["'wasm-unsafe-eval'"]),
      // Dev-only allowances
      ...(isRelaxed ? ["'unsafe-eval'", "'unsafe-inline'"] : []),
    ].join(' '),
    // For CSP3-capable browsers, split element vs attribute controls:
    // - Keep <style> strict via nonce
    // - Allow style="" attributes so React inline styles won't break UI
    [
      "style-src 'self'",
      `'nonce-${nonce}'`,
      ...(isRelaxed ? ["'unsafe-inline'"] : []),
    ].join(' '),
    ["style-src-elem 'self'", `'nonce-${nonce}'`, ...(isRelaxed ? ["'unsafe-inline'"] : [])].join(
      ' '
    ),
    "style-src-attr 'unsafe-inline'",
    // Allow data/blob for user-generated images and Next.js blobs.
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    // Network connections used by browser clients (Supabase, MCP, etc.).
    connectSrc,
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "frame-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    // Security hardening
    'block-all-mixed-content',
  ]

  return directives.map(dedupeDirective).join('; ')
}

export function middleware(req: NextRequest) {
  const isDev = process.env.NODE_ENV !== 'production'
  // 預設：dev 放寬（避免破壞 HMR / source map）、prod 嚴格。
  // 若你想在 dev 跑 ZAP 也使用嚴格 CSP，可設：SECURITY_HEADERS_MODE=strict
  const securityMode = process.env.SECURITY_HEADERS_MODE
  const isRelaxed = securityMode ? securityMode !== 'strict' : isDev

  // IMPORTANT:
  // - Static (SSG) pages are rendered at build time. They cannot embed a per-request nonce.
  // - Therefore, when security headers are strict (i.e. not relaxed), we must use a *stable* nonce
  //   so the build output and runtime CSP match.
  const stableNonce = (process.env.CSP_NONCE as string | undefined) || 'zap-scan-nonce'
  const nonce = isRelaxed ? generateNonceBase64() : stableNonce
  const connectSrc = buildConnectSrc(req, isRelaxed)

  // Pass nonce to SSR so Document can apply it.
  const pathname = req.nextUrl.pathname
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-nonce', nonce)

  // ZAP (or other clients) can request Next.js data endpoints directly (e.g. /_next/data/<buildId>/login.json).
  // In this codebase these pages are "auto-exported" and Next responds with HTML, which confuses scanners and can
  // be flagged as missing/incorrect Content-Type for JSON. We return an explicit JSON response for these known
  // routes to avoid MIME sniffing issues and quiet scanner noise.
  const zapJsonFix = pathname.match(/^\/_next\/data\/[^/]+\/(login|tos)\.json$/)
  if (zapJsonFix) {
    const r = NextResponse.json({}, { status: 200 })
    r.headers.set('Content-Type', 'application/json; charset=utf-8')
    r.headers.set('X-Content-Type-Options', 'nosniff')
    return r
  }

  // Next.js page data endpoints are expected to be JSON. Some clients/scanners hit these URLs
  // without the `x-nextjs-data: 1` header, which can cause Next to treat them like a normal page
  // request and respond with HTML. Ensure these are handled as data requests.
  if (pathname.startsWith('/_next/data/') && pathname.endsWith('.json')) {
    requestHeaders.set('x-nextjs-data', '1')
    requestHeaders.set('accept', 'application/json')
  }

  const res = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })

  // Next.js emits page data as JSON under /_next/data/**.json. ZAP can flag missing Content-Type there,
  // so we set it explicitly for those routes.
  if (pathname.startsWith('/_next/data/') && pathname.endsWith('.json')) {
    res.headers.set('Content-Type', 'application/json; charset=utf-8')
  }

  res.headers.set('Content-Security-Policy', buildCsp(nonce, isRelaxed, connectSrc))
  res.headers.set('X-Frame-Options', 'SAMEORIGIN')
  res.headers.set('X-Content-Type-Options', 'nosniff')
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.headers.set('X-Permitted-Cross-Domain-Policies', 'none')
  res.headers.set(
    'Permissions-Policy',
    [
      'camera=(self)',
      'microphone=(self)',
      'geolocation=()',
      'payment=()',
      'usb=()',
      'interest-cohort=()',
    ].join(', ')
  )
  // HSTS is only meaningful over HTTPS, but setting it doesn't break HTTP.
  res.headers.set(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains'
  )

  return res
}

export const config = {
  matcher: '/:path*',
}

