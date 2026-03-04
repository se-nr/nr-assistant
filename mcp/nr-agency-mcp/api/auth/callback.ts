/**
 * OAuth Callback — HTML bridge for Supabase implicit flow
 *
 * GET /api/auth/callback#access_token={supabase_jwt}&...
 *
 * After Google OAuth, Supabase redirects here with the access token in the
 * URL hash fragment. Since the server can't read hash fragments, this
 * endpoint serves an HTML page that reads the token client-side and
 * redirects to the server-side /api/auth/complete endpoint.
 *
 * The MCP OAuth params (pending blob) are read from a secure HTTP-only
 * cookie set by /authorize.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";

interface AuthState {
  pending: string; // signed blob with MCP OAuth params
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

  // Serve HTML bridge that reads #access_token from hash fragment
  // and redirects to the server-side /api/auth/complete endpoint
  const pendingJson = JSON.stringify(authState.pending);

  // Clear the auth cookie now that we've read it
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
