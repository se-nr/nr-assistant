/**
 * OAuth Complete — Server-side user verification and MCP code generation
 *
 * GET /api/auth/complete?sb_token={supabase_jwt}&pending={signed_blob}
 *
 * 1. Verifies the pending blob (signature + expiry)
 * 2. Verifies the Supabase JWT via REST API
 * 3. Checks email domain is @neblerohde.dk
 * 4. Looks up user in profiles table (role, full_name)
 * 5. Generates MCP auth code with user info
 * 6. Redirects to MCP client's redirect_uri with code + state
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHmac } from "crypto";
import { createClient } from "@supabase/supabase-js";

const SIGN_SECRET = process.env.OAUTH_SIGN_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ALLOWED_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN || "neblerohde.dk";

const CODE_TTL = 120; // 2 minutes — auth code lifetime

// ─── Pending blob verification ────────────────────────────────────────────

interface PendingState {
  exp: number;
  cc: string;   // code_challenge
  ccm: string;  // code_challenge_method
  ru: string;   // redirect_uri (MCP client's callback)
  cid: string;  // client_id
  st: string;   // state
}

function verifyPendingBlob(blob: string): PendingState | null {
  if (!SIGN_SECRET) return null;
  const dotIdx = blob.lastIndexOf(".");
  if (dotIdx < 1) return null;
  const payload = blob.slice(0, dotIdx);
  const sig = blob.slice(dotIdx + 1);

  const expected = createHmac("sha256", SIGN_SECRET).update(payload).digest("base64url");
  if (sig !== expected) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (data.exp <= Math.floor(Date.now() / 1000)) return null;
    return data as PendingState;
  } catch {
    return null;
  }
}

// ─── MCP auth code generation (with user info) ───────────────────────────

function makeAuthCode(params: {
  codeChallenge: string;
  codeChallengeMethod: string;
  redirectUri: string;
  clientId: string;
  email: string;
  role: string;
  name: string;
}): string {
  const exp = Math.floor(Date.now() / 1000) + CODE_TTL;
  const payload = Buffer.from(
    JSON.stringify({
      exp,
      cc: params.codeChallenge,
      ccm: params.codeChallengeMethod,
      ru: params.redirectUri,
      cid: params.clientId,
      email: params.email,
      role: params.role,
      name: params.name,
    })
  ).toString("base64url");
  const sig = createHmac("sha256", SIGN_SECRET!).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

// ─── Error page helper ────────────────────────────────────────────────────

function errorPage(res: VercelResponse, status: number, title: string, message: string) {
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

// ─── Handler ──────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!SIGN_SECRET || !SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    errorPage(res, 500, "Server Error", "OAuth not configured. Missing environment variables.");
    return;
  }

  const sbToken = String(req.query.sb_token || "");
  const pendingStr = String(req.query.pending || "");

  if (!sbToken || !pendingStr) {
    errorPage(res, 400, "Bad Request", "Missing required parameters.");
    return;
  }

  // 1. Verify pending blob (signature + expiry)
  const pending = verifyPendingBlob(pendingStr);
  if (!pending) {
    errorPage(res, 400, "Session Expired", "Your login session has expired. Please start over.");
    return;
  }

  // 2. Verify Supabase token via REST API
  let user: any;
  try {
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${sbToken}`,
        apikey: SUPABASE_ANON_KEY,
      },
    });

    if (!userRes.ok) {
      errorPage(res, 401, "Authentication Failed", "Could not verify your Google login.");
      return;
    }

    user = await userRes.json();
  } catch (e: any) {
    errorPage(res, 500, "Server Error", `Failed to verify token: ${e.message}`);
    return;
  }

  const email: string = user.email || "";
  const domain = email.split("@")[1] || "";

  // 3. Domain check
  if (domain !== ALLOWED_DOMAIN) {
    errorPage(
      res,
      403,
      "Access Denied",
      `Only @${ALLOWED_DOMAIN} accounts are allowed. You signed in as ${email}.`
    );
    return;
  }

  // 4. Look up profile (role, full_name) via service role
  let role = "viewer";
  let name = email.split("@")[0];
  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: profile } = await sb
      .from("profiles")
      .select("role, full_name")
      .eq("id", user.id)
      .single();

    if (profile?.role) role = profile.role;
    if (profile?.full_name) name = profile.full_name;
  } catch {
    // Profile lookup failed — use defaults (viewer role, email prefix as name)
  }

  // 5. Generate MCP auth code with user info
  const code = makeAuthCode({
    codeChallenge: pending.cc,
    codeChallengeMethod: pending.ccm,
    redirectUri: pending.ru,
    clientId: pending.cid,
    email,
    role,
    name,
  });

  // 6. Redirect to MCP client's redirect_uri with code + state
  const redirectUrl = new URL(pending.ru);
  redirectUrl.searchParams.set("code", code);
  if (pending.st) redirectUrl.searchParams.set("state", pending.st);

  res.redirect(302, redirectUrl.toString());
}
