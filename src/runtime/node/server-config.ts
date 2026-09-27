const DEFAULT_PORT = 8787;

export function readServerPort(env: NodeJS.ProcessEnv): number {
  const raw = env['PORT']?.trim();

  if (raw === undefined || raw === '') {
    return DEFAULT_PORT;
  }

  if (!/^\d+$/.test(raw)) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  const port = Number(raw);

  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  return port;
}
