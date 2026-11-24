/// <reference types="vite-plugin-pwa/client" />

// Typed Vite env for the browser. Only VITE_-prefixed names reach the bundle.
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}
