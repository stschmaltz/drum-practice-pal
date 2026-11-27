/**
 * The password accounts get on the local stack only, so the dev server can sign in
 * without an email (`DevSignIn`). Import-free: the seed script reads it too. Hosted
 * projects never see it: `DevSignIn` exists only under `vite` (`import.meta.env.DEV`).
 */
export const DEV_PASSWORD = 'drumpal-local-dev';

/** Signed in when the email field is left empty. */
export const DEV_DEFAULT_EMAIL = 'demo@drumpal.test';
