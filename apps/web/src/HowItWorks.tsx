import type { JSX } from 'react';

// "How it works": the pipeline drawn as lanes, each step tagged with the
// Meta model that does the work (or "code" when it is deterministic), so
// judges and viewers see where every model acts without reading code.

type ModelKey = 'spark' | 'wonder' | 'sam' | 'voice' | 'code';

interface ModelInfo {
  name: string;
  id: string;
  role: string;
}

const MODELS: Record<ModelKey, ModelInfo> = {
  spark: {
    name: 'Muse Spark',
    id: 'muse-spark-1.3',
    role: 'Reads the pliego, checks it against the Company Brain, researches prices and drafts. Also reads scanned pages (vision) and judges the suspicious fragments flagged by the document guard.',
  },
  wonder: {
    name: 'Muse Wonder',
    id: 'muse-wonder-1.0',
    role: 'Deep reasoning: audits the draft Muse Spark wrote (omissions, unsupported claims, contradictions).',
  },
  sam: {
    name: 'SAM 3.1',
    id: 'sam-3.1',
    role: 'Locates signatures, initials and institutional logos on scanned pages and returns their coordinates.',
  },
  voice: {
    name: 'Muse Voice Transcribe',
    id: 'muse-voice-transcribe-1.0',
    role: 'Transcribes the voice note in which the manager answers the draft’s [PENDING] items; Muse Spark maps it to each pending item.',
  },
  code: {
    name: 'Deterministic code',
    id: 'no model',
    role: 'Verdict, financial ratios, concentration, price validation, requirement coverage and form filling.',
  },
};

interface Step {
  title: string;
  detail: string;
  models: ModelKey[];
}

// Lanes run left to right; steps inside a lane run in parallel.
const LANES: { label: string; steps: Step[] }[] = [
  {
    label: '1 · Input',
    steps: [
      {
        title: 'Real DGCP tender file',
        detail: 'Original pliego, amendments and forms, unmodified.',
        models: ['code'],
      },
      {
        title: 'Document guard',
        detail: 'A screen looks for text aimed at an AI; Muse Spark judges what is suspicious.',
        models: ['code', 'spark'],
      },
    ],
  },
  {
    label: '2 · Reading',
    steps: [
      {
        title: 'Tender analyst',
        detail: 'Requirements with their exact page as evidence.',
        models: ['spark'],
      },
      {
        title: 'Visual reading',
        detail: 'Scanned pages: official marks + text.',
        models: ['sam', 'spark'],
      },
      {
        title: 'Opportunity fit',
        detail: 'Preliminary company ↔ tender fit.',
        models: ['spark'],
      },
    ],
  },
  {
    label: '3 · Decision',
    steps: [
      {
        title: 'Compliance',
        detail: 'Every requirement against the Company Brain: met / not met / to verify.',
        models: ['spark'],
      },
      {
        title: 'Verdict',
        detail: 'GO · GO WITH CONDITIONS · NO GO · REVIEW, with ratios and concentration.',
        models: ['code'],
      },
      {
        title: 'Prices',
        detail: 'Costs only from valid store catalogs and the company’s rates.',
        models: ['spark', 'code'],
      },
    ],
  },
  {
    label: '4 · Offer',
    steps: [
      {
        title: 'Writer',
        detail: 'Technical draft in the pliego’s order, with [PENDING].',
        models: ['spark'],
      },
      { title: 'Reviewer', detail: 'Another model audits the draft.', models: ['wonder'] },
      {
        title: 'Voice answers',
        detail:
          'The manager says what they know; it is recorded as a declaration, not as evidence.',
        models: ['voice', 'spark'],
      },
      {
        title: 'Forms + F.033',
        detail:
          'SNCC forms and a priced official F.033; signature and final approval stay with a person.',
        models: ['code'],
      },
    ],
  },
];

function ModelTag({ model }: { model: ModelKey }): JSX.Element {
  return <span className={`model-tag model-${model}`}>{MODELS[model].name}</span>;
}

export function HowItWorks(): JSX.Element {
  return (
    <div>
      <p className="kicker">How it works</p>
      <h2>Four Meta models, each with one job</h2>
      <p className="sub">
        From the real tender to an honest verdict and an offer draft. Everything each model does is
        recorded in the Trace tab of each analysis.
      </p>
      <div className="lanes">
        {LANES.map((lane) => (
          <div key={lane.label} className="lane">
            <div className="lane-label">{lane.label}</div>
            {lane.steps.map((step) => (
              <div key={step.title} className="lane-step">
                <div className="lane-step-title">{step.title}</div>
                <div className="muted">{step.detail}</div>
                <div className="lane-tags">
                  {step.models.map((model) => (
                    <ModelTag key={model} model={model} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
      <section className="panel">
        <h3 className="panel-title">The models</h3>
        <div className="model-grid">
          {(Object.keys(MODELS) as ModelKey[]).map((key) => (
            <div key={key} className={`model-card model-card-${key}`}>
              <ModelTag model={key} />
              <code>{MODELS[key].id}</code>
              <p>{MODELS[key].role}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
