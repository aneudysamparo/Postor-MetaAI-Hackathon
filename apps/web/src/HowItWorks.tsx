import type { JSX } from 'react';

// "Cómo funciona": the pipeline drawn as lanes, each step tagged with the
// Meta model that does the work (or "código" when it is deterministic), so
// judges and viewers see where every model acts without reading code.

type ModelKey = 'spark' | 'wonder' | 'sam' | 'guard' | 'code';

interface ModelInfo {
  name: string;
  id: string;
  role: string;
}

const MODELS: Record<ModelKey, ModelInfo> = {
  spark: {
    name: 'Muse Spark',
    id: 'muse-spark-1.3',
    role: 'Lee el pliego, contrasta con el Company Brain, investiga precios y redacta. También lee páginas escaneadas (visión).',
  },
  wonder: {
    name: 'Muse Wonder',
    id: 'muse-wonder-1.0',
    role: 'Razonamiento profundo: audita el borrador que escribió Muse Spark (omisiones, afirmaciones sin respaldo, contradicciones).',
  },
  sam: {
    name: 'SAM 3.1',
    id: 'sam-3.1',
    role: 'Localiza firmas, rúbricas y logos institucionales en páginas escaneadas y devuelve sus coordenadas.',
  },
  guard: {
    name: 'Llama Prompt Guard 2',
    id: 'Llama-Prompt-Guard-2-86M · Modal',
    role: 'Revisa cada fragmento del pliego antes de que lo lean los agentes: detecta instrucciones escondidas (prompt injection).',
  },
  code: {
    name: 'Código determinista',
    id: 'sin modelo',
    role: 'Veredicto, ratios financieros, concentración, validación de precios, cobertura de requisitos y llenado de formularios.',
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
    label: '1 · Entrada',
    steps: [
      {
        title: 'Expediente real DGCP',
        detail: 'Pliego, enmiendas y formularios originales, sin modificar.',
        models: ['code'],
      },
      {
        title: 'Guardia de documentos',
        detail: 'Cada página se revisa contra instrucciones escondidas.',
        models: ['guard'],
      },
    ],
  },
  {
    label: '2 · Lectura',
    steps: [
      {
        title: 'Analista del pliego',
        detail: 'Requisitos con su página exacta como evidencia.',
        models: ['spark'],
      },
      {
        title: 'Lectura visual',
        detail: 'Páginas escaneadas: marcas oficiales + texto.',
        models: ['sam', 'spark'],
      },
      {
        title: 'Ajuste de oportunidad',
        detail: 'Encaje preliminar empresa ↔ licitación.',
        models: ['spark'],
      },
    ],
  },
  {
    label: '3 · Decisión',
    steps: [
      {
        title: 'Cumplimiento',
        detail: 'Cada requisito contra el Company Brain: cumple / no cumple / por verificar.',
        models: ['spark'],
      },
      {
        title: 'Veredicto',
        detail: 'GO · GO CON CONDICIONES · NO GO · REVISIÓN, con ratios y concentración.',
        models: ['code'],
      },
      {
        title: 'Precios',
        detail: 'Solo precios impresos en cotizaciones vigentes.',
        models: ['spark', 'code'],
      },
    ],
  },
  {
    label: '4 · Oferta',
    steps: [
      {
        title: 'Redactor',
        detail: 'Borrador técnico en el orden del pliego, con [PENDING].',
        models: ['spark'],
      },
      { title: 'Revisor', detail: 'Otro modelo audita el borrador.', models: ['wonder'] },
      {
        title: 'Formularios + F.033',
        detail: 'SNCC y el F.033 oficial pre-llenados; firma y precio quedan para una persona.',
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
      <p className="kicker">Cómo funciona</p>
      <h2>Cuatro modelos de Meta, cada uno con un trabajo</h2>
      <p className="sub">
        De la licitación real a un veredicto honesto y un borrador de oferta. Todo lo que hace cada
        modelo queda en la pestaña Traza de cada análisis.
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
        <h3 className="panel-title">Los modelos</h3>
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
