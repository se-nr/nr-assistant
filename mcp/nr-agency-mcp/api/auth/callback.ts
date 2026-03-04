/**
 * OAuth Callback — HTML bridge page
 *
 * Supabase redirects here after Google OAuth login with tokens in the URL
 * hash fragment (#access_token=...). Since the server can't read hash
 * fragments, this page reads them client-side and redirects to the
 * server-side /api/auth/complete endpoint.
 *
 * GET /api/auth/callback?pending={signed_blob}#access_token={supabase_jwt}&...
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function handler(req: VercelRequest, res: VercelResponse) {
  const pending = String(req.query.pending || "");

  if (!pending) {
    res.status(400).send("Missing pending state. Please start the login flow again.");
    return;
  }

  // Check for error from Supabase (e.g. user cancelled login)
  const error = String(req.query.error || "");
  const errorDesc = String(req.query.error_description || "");
  if (error) {
    res.setHeader("Content-Type", "text/html");
    res.status(200).send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Login Failed</title>
<style>body{font-family:system-ui;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f5f5f5}
.card{background:#fff;padding:2rem;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,.1);max-width:400px;text-align:center}
h2{color:#dc2626;margin-top:0}</style></head>
<body><div class="card">
<h2>Login Failed</h2>
<p>${errorDesc || error || "Unknown error"}</p>
<p>Close this window and try again.</p>
</div></body></html>`);
    return;
  }

  // Serve HTML that reads hash fragment and redirects to complete endpoint
  const pendingJson = JSON.stringify(pending);

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
