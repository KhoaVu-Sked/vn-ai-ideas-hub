// Google is the only way in. Flipping this back to true restores username /
// password sign-in, self-registration and password reset — the routes and the
// forms are all still here, just closed off.
//
// Keep it a plain constant, not an env var: middleware, server routes and the
// login page all need it, and an env var would have to be NEXT_PUBLIC_ to reach
// the browser, which makes it two things to keep in step instead of one.
export const PASSWORD_LOGIN = false;

// Break-glass: /skedadmin keeps the old username + password form so there is a
// way in that doesn't depend on Google. Restricted to accounts whose role is
// admin — every member still has a bcrypt hash from before the switch, and
// without that check this page would quietly re-open password login for all of
// them. It is not linked from anywhere, but treat it as public: the URL is
// guessable, so the admin password is the only thing protecting it.
export const ADMIN_PASSWORD_LOGIN = true;

// True when any password route should answer at all.
export const anyPasswordLogin = PASSWORD_LOGIN || ADMIN_PASSWORD_LOGIN;

// Sent by every password route while the above is false. 404 rather than 403 —
// there's nothing to negotiate, the endpoint isn't in service.
export const passwordLoginOff = () =>
  Response.json({ error: "Sign in with Google." }, { status: 404 });
