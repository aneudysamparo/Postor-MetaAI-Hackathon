import { useEffect, useState } from 'react';
import type { JSX, ReactNode } from 'react';
import { fetchAccess, grantAccess, readStoredMetaKey, storeMetaKey } from './api';
import type { AccessStatus } from './api';

// Public demo landing + gate. When the deployment sets DEMO_ACCESS_TOKEN,
// visitors land here first: what Postor is, then a card with the access code
// (the API answers with an httpOnly cookie) and, optionally, their own Meta
// API key. The key stays in this browser tab (sessionStorage) and is sent
// only with the requests that call Meta models; the server never stores it.

const MODELS = [
  { name: 'Muse Spark', role: 'lee, juzga y redacta', className: 'model-spark' },
  { name: 'Muse Wonder', role: 'audita el borrador', className: 'model-wonder' },
  { name: 'SAM 3.1', role: 'ubica firmas y sellos', className: 'model-sam' },
  { name: 'Muse Voice Transcribe', role: 'pendientes por voz', className: 'model-voice' },
];

const STEPS = [
  'Lee licitaciones reales del portal DGCP, sin modificarlas.',
  'Contrasta cada requisito con el Company Brain de la empresa, citando documento y página.',
  'Decide: GO · GO CON CONDICIONES · NO GO · REVISIÓN HUMANA.',
  'Prepara la oferta: borrador técnico, formularios SNCC y el F.033 con precios.',
  'Nunca envía, firma ni presenta nada: la última palabra es humana.',
];

function errorText(reason: unknown): string {
  if (reason instanceof Error) {
    return reason.message;
  }
  return String(reason);
}

function Landing({
  userKeyRequired,
  onEnter,
}: {
  userKeyRequired: boolean;
  onEnter: (token: string, metaKey: string) => Promise<void>;
}): JSX.Element {
  const [token, setToken] = useState('');
  const [metaKey, setMetaKey] = useState(() => readStoredMetaKey());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    if (token.trim().length === 0) {
      setError('Ingresa el código de acceso.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onEnter(token.trim(), metaKey.trim());
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="landing">
      <section className="landing-hero">
        <p className="kicker">Meta AI Developer Hackathon · Startup track</p>
        <h1>Postor</h1>
        <p className="landing-lead">
          Tu equipo de licitaciones con IA: de un pliego público a una decisión honesta y una oferta
          lista para revisar.
        </p>
        <ol className="landing-steps">
          {STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <div className="landing-models">
          {MODELS.map((model) => (
            <span key={model.name} className={`model-tag ${model.className}`}>
              {model.name} <span className="landing-model-role">· {model.role}</span>
            </span>
          ))}
        </div>
        <p className="muted landing-note">
          Demo con 4 licitaciones reales de República Dominicana y una empresa ficticia (NovaTech
          Solutions SRL, marcada DEMO).
        </p>
      </section>
      <form
        className="panel landing-card"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <h2>Entrar a la demo</h2>
        <label className="landing-field">
          <span>Código de acceso</span>
          <input
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="El código que recibiste con la entrega"
            autoComplete="off"
            autoFocus
          />
        </label>
        <label className="landing-field">
          <span>
            Tu Meta API key{' '}
            <span className="muted">
              {userKeyRequired ? '(para correr análisis en vivo)' : '(opcional)'}
            </span>
          </span>
          <input
            type="password"
            value={metaKey}
            onChange={(event) => setMetaKey(event.target.value)}
            placeholder="Pega tu key de la Meta Model API"
            autoComplete="off"
          />
        </label>
        <p className="muted landing-hint">
          Sin key puedes recorrer las 4 corridas grabadas (veredictos, evidencia, traza y F.033). La
          key se queda en esta pestaña del navegador y solo viaja con tus análisis; el servidor
          nunca la guarda.
        </p>
        <button type="submit" className="btn" disabled={submitting}>
          {submitting ? 'Entrando…' : 'Entrar'}
        </button>
        {error !== null && <p className="error">{error}</p>}
      </form>
    </div>
  );
}

export function AccessGate({
  children,
}: {
  children: (access: AccessStatus) => ReactNode;
}): JSX.Element {
  const [access, setAccess] = useState<AccessStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = (): void => {
    fetchAccess()
      .then(setAccess)
      .catch((reason: unknown) => setError(errorText(reason)));
  };
  useEffect(load, []);

  async function enter(token: string, metaKey: string): Promise<void> {
    await grantAccess(token);
    storeMetaKey(metaKey);
    load();
  }

  if (access === null) {
    return <p className="main">{error ?? 'Cargando…'}</p>;
  }
  if (access.required && !access.granted) {
    return <Landing userKeyRequired={access.userKeyRequired} onEnter={enter} />;
  }
  return <>{children(access)}</>;
}
