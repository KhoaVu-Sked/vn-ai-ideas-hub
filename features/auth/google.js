// Google sign-in, restricted to one email domain.
//
// Deliberately not Auth.js: we already own sessions (signed cookie + a
// session_id column for the one-session rule), and Auth.js wants to own them
// too. Google is used only to prove who someone is; the session it produces is
// the same one the password flow produces, so single-session, the idle timeout
// and requireUser() all keep working untouched.
//
// Pasting a credential out of the Google console picks up a trailing newline
// often enough to be worth defending against — it surfaces as "The provided
// client secret is invalid", which sends you looking at the wrong thing.
const clientId = () => (process.env.GOOGLE_CLIENT_ID || "").trim();
const clientSecret = () => (process.env.GOOGLE_CLIENT_SECRET || "").trim();


// Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, plus the callback URL
// registered in the Google Cloud console for each environment.

import { createRemoteJWKSet, jwtVerify } from "jose";

export const ALLOWED_DOMAIN = "@skedulo.com";
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

// Cached across invocations on a warm function; refetched on a cold start.
let jwks;
function googleKeys() {
  jwks ||= createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
  return jwks;
}

export const googleConfigured = () =>
  Boolean(clientId() && clientSecret());

// The callback must match a registered redirect URI exactly, so it's derived
// from the request's own origin rather than a guess.
export const callbackUrl = (origin) => `${origin}/api/auth/google/callback`;

export function authUrl({ origin, state }) {
  const p = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: callbackUrl(origin),
    response_type: "code",
    scope: "openid email profile",
    state,
    // A hint only — Google may still return another account, so the domain is
    // re-checked below. Never trust hd for authorisation.
    hd: ALLOWED_DOMAIN.slice(1),
    prompt: "select_account",
  });
  return `${AUTH_ENDPOINT}?${p}`;
}

// Swap the one-time code for tokens, server-to-server with the client secret.
async function exchangeCode({ code, origin }) {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: callbackUrl(origin),
      grant_type: "authorization_code",
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.id_token) {
    throw new Error(body.error_description || body.error || "Google rejected the sign-in.");
  }
  return body.id_token;
}

// Returns { email, name } for a verified, in-domain Google account.
// Throws with a user-safe message otherwise.
export async function identityFromCode({ code, origin }) {
  const idToken = await exchangeCode({ code, origin });

  // Verify the signature against Google's keys and pin the audience to our
  // client id — a token minted for a different app must not be accepted.
  const { payload } = await jwtVerify(idToken, googleKeys(), {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: clientId(),
  });

  const email = String(payload.email || "").trim().toLowerCase();
  if (!email || payload.email_verified !== true) {
    throw new Error("That Google account has no verified email address.");
  }
  if (!email.endsWith(ALLOWED_DOMAIN) || email.length <= ALLOWED_DOMAIN.length) {
    throw new Error(`Sign in with your ${ALLOWED_DOMAIN} Google account.`);
  }
  return { email, name: String(payload.name || "").trim() || null };
}
