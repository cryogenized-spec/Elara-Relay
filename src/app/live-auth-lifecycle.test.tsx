import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import type { AuthIdentity } from '../auth/auth-verifier';
import type { BrowserAuthSession } from './auth-client';
import type { BrowserRuntime } from './browser-runtime';
import { OperationsApiError } from './operations-api';
import { App } from './App';

const OWNER_ID = '30000000-0000-4000-8000-000000000001';
const OTHER_ID = '30000000-0000-4000-8000-000000000099';

function session(userId: string): BrowserAuthSession {
  return {
    accessToken:
      userId === OWNER_ID ? 'owner-access-token' : 'other-access-token',
    userId,
    email: userId === OWNER_ID ? 'owner@example.com' : 'other@example.com',
  };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0);
  });
  await Promise.resolve();
}

describe('live authorization lifecycle', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('clears the authorized shell and reauthorizes when the Supabase user changes', async () => {
    let currentSession = session(OWNER_ID);
    let listener: ((value: BrowserAuthSession | null) => void) | null = null;

    const runtime: BrowserRuntime = {
      auth: {
        getAccessToken: () => currentSession.accessToken,
        restoreSession: () => Promise.resolve(currentSession),
        refreshSession: () => Promise.resolve(currentSession),
        subscribe: (next) => {
          listener = next;
          return () => {
            listener = null;
          };
        },
        signIn: () => Promise.resolve(currentSession),
        signOut: () => Promise.resolve(),
      },
      api: {
        whoAmI: (): Promise<AuthIdentity> =>
          currentSession.userId !== OWNER_ID
            ? Promise.reject(
                new OperationsApiError(403, 'FORBIDDEN', 'Access denied'),
              )
            : Promise.resolve({
                userId: OWNER_ID,
                sessionId: '30000000-0000-4000-8000-000000000002',
                email: 'owner@example.com',
                aal: 'aal1',
              }),
        today: (asOf) =>
          Promise.resolve({
            asOf,
            tasks: [],
            repairs: [],
            scheduledActions: [],
          }),
        work: () => Promise.resolve({ parties: [], jobs: [], tasks: [] }),
        repairs: () =>
          Promise.resolve({ parties: [], jobs: [], repairs: [] }),
        schedule: (asOf) =>
          Promise.resolve({
            asOf,
            due: [],
            upcoming: [],
            paused: [],
          }),
        search: () =>
          Promise.resolve({
            parties: [],
            jobs: [],
            tasks: [],
            repairs: [],
            scheduledActions: [],
            events: [],
          }),
        task: () => Promise.reject(new Error('not used')),
        job: () => Promise.reject(new Error('not used')),
        repair: () => Promise.reject(new Error('not used')),
      },
    };

    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<App runtime={runtime} />);
      await flush();
    });

    expect(container.textContent).toContain('Today');
    expect(container.textContent).toContain('Online');

    currentSession = session(OTHER_ID);
    await act(async () => {
      listener?.(currentSession);
      await flush();
    });

    expect(container.textContent).toContain('Access not authorized');
    expect(container.textContent).not.toContain('Needs attention');

    act(() => {
      root.unmount();
    });
  });
});
