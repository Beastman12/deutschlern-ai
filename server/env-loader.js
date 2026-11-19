/**
 * Local .env loader for `npm start` / `npm run dev`.
 *
 * Only the server entry point loads it, so tests and the verifier keep a clean
 * process environment. Existing shell variables always win, and nothing here
 * ever reaches the browser: the file is read server-side before any module
 * reads AI, speech, auth or rate-limit configuration.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const isServerEntry = /[\\/]server[\\/]index\.js$/.test(String(process.argv[1] || ''));

if (isServerEntry) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const envFile = path.join(root, '.env');
  try {
    if (fs.existsSync(envFile)) {
      const text = fs.readFileSync(envFile, 'utf8');
      for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const equals = line.indexOf('=');
        if (equals < 0) continue;
        const key = line.slice(0, equals).trim();
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
        let value = line.slice(equals + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        // Shell/process-manager values take precedence over the local file.
        if (process.env[key] === undefined) process.env[key] = value;
      }
    }
  } catch (error) {
    console.warn(`[env] Could not read .env; continuing with the process environment.`, error?.message || error);
  }
}
