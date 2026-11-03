import { useEffect, useState } from 'react';
import type { JSX, ReactNode } from 'react';
import { fetchAccess, grantAccess } from './api';
import type { AccessStatus } from './api';

// Public demo gate: when the deployment sets DEMO_ACCESS_TOKEN, the app asks
// for it once (the API answers with an httpOnly cookie) before showing data.
export function AccessGate({
  children,
}: {
  children: (access: AccessStatus) => ReactNode;
}): JSX.Element {
  const [access, setAccess] = useState<AccessStatus | null>(null);
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = (): void => {
    fetchAccess()
      .then(setAccess)
      .catch((reason: unknown) => setError(String(reason)));
  };
  useEffect(load, []);

  async function onSubmit(): Promise<void> {
    setError(null);
    try {
      await grantAccess(token.trim());
      load();
    } catch (reason) {
      let message = String(reason);
      if (reason instanceof Error) {
        message = reason.message;
      }
      setError(message);
    }
  }

  if (access === null) {
    return <p className="main">{error ?? 'Cargando…'}</p>;
  }
  if (access.required && !access.granted) {
    return (
      <div className="gate">
        <div className="panel">
          <h2>Postor Bids · demo</h2>
          <p className="muted">
            Demo privada para jueces del Meta AI Developer Hackathon. Ingresa el token de acceso.
          </p>
          <input
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void onSubmit();
              }
            }}
            placeholder="Token de acceso"
            autoFocus
          />
          <button className="btn" onClick={() => void onSubmit()}>
            Entrar
          </button>
          {error !== null && <p className="error">{error}</p>}
        </div>
      </div>
    );
  }
  return <>{children(access)}</>;
}
