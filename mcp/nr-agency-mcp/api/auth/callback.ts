/**
 * OAuth Callback — handles both Supabase auth flows
 *
 * GET /api/auth/callback?code={supabase_pkce_code}     — PKCE flow
 * GET /api/auth/callback#access_token={supabase_jwt}    — Implicit flow
 *
 * After Google OAuth, Supabase redirects here. Depending on the Supabase
 * config, it either returns a PKCE code (?code=) or an implicit token
 * (#access_token=). We handle both:
 *
 *   PKCE: Exchange code server-side using code_verifier from cookie
 *   Implicit: Serve HTML bridge to read hash fragment client-side
 *
 * Both paths redirect to /api/auth/complete with the Supabase access token.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

interface AuthState {
  pending: string; // signed blob with MCP OAuth params
  cv: string;      // Supabase PKCE code_verifier
}

function readAuthCookie(req: VercelRequest): AuthState | null {
  const cookies = req.headers.cookie || "";
  const match = cookies.match(/mcp_auth_state=([^;]+)/);
  if (!match) return null;
  try {
    return JSON.parse(decodeURIComponent(match[1]));
  } catch {
    return null;
  }
}

function clearCookieHeader(): string {
  return "mcp_auth_state=; Path=/api/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
}

function errorPage(res: VercelResponse, status: number, title: string, message: string) {
  res.setHeader("Set-Cookie", clearCookieHeader());
  res.setHeader("Content-Type", "text/html");
  res.status(status).send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:system-ui;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f5f5f5}
.card{background:#fff;padding:2rem;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,.1);max-width:400px;text-align:center}
h2{color:#dc2626;margin-top:0}</style></head>
<body><div class="card">
<h2>${title}</h2>
<p>${message}</p>
<p>Close this window and try again.</p>
</div></body></html>`);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Check for error from Supabase (e.g. user cancelled login)
  const error = String(req.query.error || "");
  const errorDesc = String(req.query.error_description || "");
  if (error) {
    errorPage(res, 200, "Login Failed", errorDesc || error || "Unknown error");
    return;
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    errorPage(res, 500, "Server Error", "Missing Supabase configuration.");
    return;
  }

  // Read auth state from cookie (set by /authorize)
  const authState = readAuthCookie(req);
  if (!authState) {
    errorPage(
      res,
      400,
      "Session Expired",
      "Your login session has expired or cookies are blocked. Please start the login flow again."
    );
    return;
  }

  // ── Case 1: PKCE flow — Supabase returned ?code= ────────────────────
  const code = String(req.query.code || "");
  if (code) {
    try {
      const tokenRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=pkce`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          auth_code: code,
          code_verifier: authState.cv,
        }),
      });

      if (!tokenRes.ok) {
        const errBody = await tokenRes.text();
        console.error("Supabase PKCE token exchange failed:", tokenRes.status, errBody);
        errorPage(res, 401, "Authentication Failed", "Could not verify your Google login. Please try again.");
        return;
      }

      const session = await tokenRes.json();
      const sbAccessToken = session.access_token;

      if (!sbAccessToken) {
        errorPage(res, 401, "Authentication Failed", "No access token received. Please try again.");
        return;
      }

      // Clear cookie and redirect to complete endpoint
      res.setHeader("Set-Cookie", clearCookieHeader());
      res.redirect(
        302,
        `/api/auth/complete?sb_token=${encodeURIComponent(sbAccessToken)}&pending=${encodeURIComponent(authState.pending)}`
      );
    } catch (e: any) {
      console.error("Supabase token exchange error:", e);
      errorPage(res, 500, "Server Error", `Authentication failed: ${e.message}`);
    }
    return;
  }

  // ── Case 2: Implicit flow — tokens in hash fragment ──────────────────
  // Serve HTML bridge that reads #access_token client-side and redirects
  const pendingJson = JSON.stringify(authState.pending);

  // Clear the cookie in this response
  res.setHeader("Set-Cookie", clearCookieHeader());
  res.setHeader("Content-Type", "text/html");
  res.status(200).send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Completing login...</title>
<style>body{font-family:system-ui;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f5f5f5}
.card{background:#fff;padding:2rem;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,.1);max-width:400px;text-align:center}
.spinner{width:32px;height:32px;border:3px solid #e5e7eb;border-top:3px solid #2563eb;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 1rem}
@keyframes spin{to{transform:rotate(360deg)}}</style></head>
<body><div class="card">
<div class="spinner"></div>
<p>Completing login...</p>
</div>
<script>
(function() {
  var hash = window.location.hash.substring(1);
  var params = new URLSearchParams(hash);
  var sbToken = params.get("access_token");

  if (!sbToken) {
    document.querySelector(".card").innerHTML =
      "<h2 style='color:#dc2626'>Login Failed</h2>" +
      "<p>No authentication token received from Google.</p>" +
      "<p>Close this window and try again.</p>";
    return;
  }

  var pending = ${pendingJson};
  window.location.href = "/api/auth/complete"
    + "?sb_token=" + encodeURIComponent(sbToken)
    + "&pending=" + encodeURIComponent(pending);
})();
</script>
</body></html>`);
}
