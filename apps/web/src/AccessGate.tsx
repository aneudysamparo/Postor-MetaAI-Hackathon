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
  { name: 'Muse Spark', role: 'reads, judges and drafts', className: 'model-spark' },
  { name: 'Muse Wonder', role: 'audits the draft', className: 'model-wonder' },
  { name: 'SAM 3.1', role: 'locates signatures and stamps', className: 'model-sam' },
  { name: 'Muse Voice Transcribe', role: 'voice answers', className: 'model-voice' },
];

const STEPS = [
  'Reads real tenders from the DGCP portal, never modified.',
  'Checks every requirement against the company’s Company Brain, citing document and page.',
  'Decides: GO · GO WITH CONDITIONS · NO GO · HUMAN REVIEW.',
  'Prepares the offer: technical draft, SNCC forms and a priced F.033.',
  'Never submits, signs or sends anything: a human has the last word.',
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
      setError('Enter the access code.');
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
          Your AI bid team: from a public tender to an honest decision and an offer ready for
          review.
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
          Demo with 4 real tenders from the Dominican Republic and a fictional company (NovaTech
          Solutions SRL, marked DEMO).
        </p>
      </section>
      <form
        className="panel landing-card"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <h2>Enter the demo</h2>
        <label className="landing-field">
          <span>Access code</span>
          <input
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="The code you received with the submission"
            autoComplete="off"
            autoFocus
          />
        </label>
        <label className="landing-field">
          <span>
            Your Meta API key{' '}
            <span className="muted">
              {userKeyRequired ? '(to run live analyses)' : '(optional)'}
            </span>
          </span>
          <input
            type="password"
            value={metaKey}
            onChange={(event) => setMetaKey(event.target.value)}
            placeholder="Paste your Meta Model API key"
            autoComplete="off"
          />
        </label>
        <p className="muted landing-hint">
          Without a key you can explore the 4 recorded runs (verdicts, evidence, trace and F.033).
          The key stays in this browser tab and only travels with your analyses; the server never
          stores it.
        </p>
        <button type="submit" className="btn" disabled={submitting}>
          {submitting ? 'Entering…' : 'Enter'}
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
    return <p className="main">{error ?? 'Loading…'}</p>;
  }
  if (access.required && !access.granted) {
    return <Landing userKeyRequired={access.userKeyRequired} onEnter={enter} />;
  }
  return <>{children(access)}</>;
}
