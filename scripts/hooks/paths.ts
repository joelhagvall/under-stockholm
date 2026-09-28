// Which files the gates care about (the same lists as scripts/hooks/pre-push): the game's code changes its speed
// and memory, the landing page's its audits.
export const PERF_PATHS = /^(src\/game\/|src\/network\/|vite\.config\.ts|package\.json|bun\.lock)/;
export const WEB_PATHS = /^(index\.html|en\/|public\/|src\/(style\.css|main\.ts|lang\.ts|device\.ts|place\.ts|landing\/))/;
export const CODE_PATHS = /^(src|scripts|server|tests)\/.*\.ts$|^vite\.config\.ts$/;
