/**
 * Theme preference.
 *
 * The choice lives in `localStorage` (instant, survives sign-in) with a mirror cookie so a
 * future server render could read it, and so the preference still applies if storage is
 * blocked. "system" follows the operating system and keeps following it while the tab is open.
 */
export const THEME_STORAGE_KEY = "bt-theme";
export const THEME_COOKIE = "bt_theme";

export type ThemeChoice = "light" | "dark" | "system";

export const THEME_CHOICES: { value: ThemeChoice; label: string; description: string }[] = [
  { value: "light", label: "Light", description: "Warm glass, graphite accents." },
  { value: "dark", label: "Dark", description: "Charcoal glass, silver contrast." },
  { value: "system", label: "System", description: "Follow your device setting." },
];

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === "light" || value === "dark" || value === "system";
}

/**
 * Runs before paint so the correct theme is applied without a flash.
 * Kept tiny on purpose: it must finish before the first paint.
 */
export const THEME_SCRIPT = `(function(){try{var k='${THEME_STORAGE_KEY}',c=document.cookie.match(/(?:^|;\\s*)${THEME_COOKIE}=(light|dark|system)/),v=null;try{v=localStorage.getItem(k)}catch(e){}v=v||(c&&c[1])||'system';if(v!=='light'&&v!=='dark'&&v!=='system')v='system';var m=window.matchMedia('(prefers-color-scheme: dark)'),dark=v==='dark'||(v==='system'&&m.matches),r=document.documentElement;r.classList.toggle('dark',dark);r.dataset.theme=dark?'dark':'light';if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches)r.classList.add('motion-ready');m.addEventListener('change',function(e){var s='system';try{s=localStorage.getItem(k)||'system'}catch(err){}if(s!=='system')return;r.classList.toggle('dark',e.matches);r.dataset.theme=e.matches?'dark':'light'});}catch(e){}})();`;
