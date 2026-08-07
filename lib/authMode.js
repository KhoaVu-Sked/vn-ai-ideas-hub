// Google is the only way in. Flipping this back to true restores username /
// password sign-in, self-registration and password reset — the routes and the
// forms are all still here, just closed off.
//
// Keep it a plain constant, not an env var: middleware, server routes and the
// login page all need it, and an env var would have to be NEXT_PUBLIC_ to reach
// the browser, which makes it two things to keep in step instead of one.
export const PASSWORD_LOGIN = false;

// Sent by every password route while the above is false. 404 rather than 403 —
// there's nothing to negotiate, the endpoint isn't in service.
export const passwordLoginOff = () =>
  Response.json({ error: "Sign in with Google." }, { status: 404 });
