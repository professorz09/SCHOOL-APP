// Side-effect bootstrap that runs at module-load time. Imported FIRST
// from vite.config.ts so process.env is hydrated from .env / .env.local
// BEFORE any other plugin module (admin-api, api-server) is evaluated.
//
// In ES modules, every `import` statement is hoisted before code runs,
// so calling dotenv inside defineConfig() — or even at top-level after
// imports — happens too late: plugin modules have already read empty
// process.env values into module-level constants.
//
// Putting dotenv in its own module and importing it FIRST guarantees the
// side effect fires before any plugin module loads (modules are
// evaluated in import-order, top-down).

import { config as loadDotenv } from 'dotenv';

loadDotenv({ path: '.env' });
// .env.local overrides .env (mirrors Vite's own loadEnv precedence).
loadDotenv({ path: '.env.local', override: true });
