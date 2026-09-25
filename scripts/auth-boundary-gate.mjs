import { readFileSync } from 'node:fs';
import process from 'node:process';

const read = (path) => readFileSync(path, 'utf8');
const findings = [];

const api = read('src/api/app.ts');
const verifier = read('src/auth/supabase-auth-verifier.ts');
const bearer = read('src/auth/bearer.ts');
const authConfig = read('src/runtime/node/auth-config.ts');
const persistent = read('src/runtime/node/persistent-api.ts');
const browserAuth = read('src/app/auth-client.ts');
const browserApi = read('src/app/operations-api.ts');
const browserConfig = read('src/app/runtime-config.ts');

for (const marker of [
  'AuthVerifier is required whenever domain routes are enabled',
  'extractBearerToken',
  'await verifier.verify(token)',
  "actor: 'operator-ui' as const",
  "context.header('WWW-Authenticate', 'Bearer')",
]) {
  if (!api.includes(marker)) {
    findings.push(`API authentication boundary lost required marker: ${marker}`);
  }
}

if (api.includes('actor: request.mutation.actor')) {
  findings.push('API must not trust caller-supplied mutation actor provenance');
}

for (const marker of [
  'createRemoteJWKSet',
  "header.alg === 'HS256'",
  "/auth/v1",
  '/user',
  "header.alg === 'ES256' || header.alg === 'RS256'",
  "audience: 'authenticated'",
  'claims.is_anonymous',
  'allowedUserIds.has(claims.sub)',
]) {
  if (!verifier.includes(marker)) {
    findings.push(`Supabase verifier lost required control: ${marker}`);
  }
}

for (const marker of [
  'MAX_AUTHORIZATION_HEADER_LENGTH',
  '^Bearer ',
  'AuthenticationError',
]) {
  if (!bearer.includes(marker)) {
    findings.push(`Bearer parser lost required control: ${marker}`);
  }
}

for (const marker of [
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'ELARA_ALLOWED_USER_IDS',
  "startsWith('sb_publishable_')",
]) {
  if (!authConfig.includes(marker)) {
    findings.push(`Auth runtime config lost required control: ${marker}`);
  }
}

for (const marker of [
  'new SupabaseAuthVerifier',
  'readAuthRuntimeConfig(env)',
  'app: createApi(kernel, authVerifier, { allowedOrigins })',
]) {
  if (!persistent.includes(marker)) {
    findings.push(`Persistent runtime lost auth wiring: ${marker}`);
  }
}

for (const marker of [
  'persistSession: true',
  'autoRefreshToken: true',
  'refreshSession()',
  'onAuthStateChange',
]) {
  if (!browserAuth.includes(marker)) {
    findings.push(`Browser auth client lost required control: ${marker}`);
  }
}

for (const marker of [
  "if (token === null || token === '')",
  'authorization: `Bearer ${token}`',
  'return schema.parse(raw);',
]) {
  if (!browserApi.includes(marker)) {
    findings.push(`Browser Operations API lost required control: ${marker}`);
  }
}

for (const marker of [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'VITE_ELARA_API_URL',
  "startsWith('sb_publishable_')",
  'must not contain credentials',
]) {
  if (!browserConfig.includes(marker)) {
    findings.push(`Browser runtime config lost required control: ${marker}`);
  }
}

if (findings.length > 0) {
  process.stderr.write(
    `Auth boundary gate failed (${findings.length}):\n${findings
      .map((finding) => `- ${finding}`)
      .join('\n')}\n`,
  );
  process.exit(1);
}

process.stdout.write(
  'Auth boundary gate passed: protected domain routes, server-owned actor provenance, JWT verification paths, strict bearer parsing, owner allowlist, and persistent auth wiring are intact.\n',
);
