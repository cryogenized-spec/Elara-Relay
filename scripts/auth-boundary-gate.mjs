import { readFileSync } from 'node:fs';
import process from 'node:process';

const read = (path) => readFileSync(path, 'utf8');
const findings = [];

const api = read('src/api/app.ts');
const verifier = read('src/auth/supabase-auth-verifier.ts');
const bearer = read('src/auth/bearer.ts');
const authConfig = read('src/runtime/node/auth-config.ts');
const persistent = read('src/runtime/node/persistent-api.ts');

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
  'createApi(kernel, authVerifier)',
]) {
  if (!persistent.includes(marker)) {
    findings.push(`Persistent runtime lost auth wiring: ${marker}`);
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
