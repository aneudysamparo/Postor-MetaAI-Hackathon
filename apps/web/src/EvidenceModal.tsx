import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import type { VisualEvidence } from '@postor/contracts';
import { documentFileUrl, fetchEvidence } from './api';
import type { EvidenceDetail } from './api';
import { PageView } from './PageView';
import { Chip } from './ui';

export type EvidenceTarget =
  | {
      kind: 'requirement';
      artifactId: string;
      evidenceId: string;
      title: string;
      originalText: string;
    }
  | { kind: 'visual'; item: VisualEvidence };

const METHOD_LABELS: Record<string, string> = {
  text: 'capa de texto',
  vision: 'lectura visual (Muse Spark)',
  sam_region: 'región SAM 3.1 + lectura visual',
};

// Opens a citation: which original document, which page, how it was read,
// what the page says, and a link that opens the ORIGINAL file at that page.
export function EvidenceModal({
  target,
  onClose,
}: {
  target: EvidenceTarget;
  onClose: () => void;
}): JSX.Element {
  const [detail, setDetail] = useState<EvidenceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (target.kind !== 'requirement') {
      return;
    }
    fetchEvidence(target.artifactId, target.evidenceId)
      .then(setDetail)
      .catch((reason: unknown) => setError(String(reason)));
  }, [target]);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <button className="link" onClick={onClose}>
          ✕ Cerrar
        </button>
        {target.kind === 'requirement' && (
          <div>
            <h3 className="panel-title">{target.title}</h3>
            <p className="muted">Texto del requisito, tal como aparece en el pliego:</p>
            <pre>{target.originalText}</pre>
            {error !== null && <p className="error">{error}</p>}
            {detail !== null && (
              <div>
                <p>
                  <b>{detail.document.fileName}</b> · página {detail.evidence.page} de{' '}
                  {detail.document.pageCount}{' '}
                  <Chip>{METHOD_LABELS[detail.evidence.method] ?? detail.evidence.method}</Chip>{' '}
                  {detail.pagePreview !== null && (
                    <Chip tone="neutral">calidad {detail.pagePreview.quality}</Chip>
                  )}
                </p>
                {detail.pagePreview !== null && (
                  <div>
                    <p className="muted">Inicio de la página extraída:</p>
                    <pre>{detail.pagePreview.text}</pre>
                  </div>
                )}
                <PageView documentId={detail.document.id} page={detail.evidence.page} />
                <a
                  className="btn"
                  href={documentFileUrl(detail.document.id, detail.evidence.page)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir original en la página {detail.evidence.page}
                </a>
              </div>
            )}
          </div>
        )}
        {target.kind === 'visual' && (
          <div>
            <h3 className="panel-title">
              {target.item.fileName} · página {target.item.page}
            </h3>
            <p>
              <Chip>{METHOD_LABELS[target.item.method] ?? target.item.method}</Chip>{' '}
              <Chip tone="neutral">calidad {target.item.pageQuality}</Chip>{' '}
              {target.item.requiresHumanReview && <Chip tone="warn">requiere revisión humana</Chip>}
            </p>
            <p className="muted">{target.item.note}</p>
            {target.item.reading !== null && (
              <div>
                <p>{target.item.reading.summary}</p>
                <ul>
                  {target.item.reading.keyFacts.map((fact) => (
                    <li key={fact}>{fact}</li>
                  ))}
                </ul>
              </div>
            )}
            <PageView
              documentId={target.item.documentId}
              page={target.item.page}
              regions={target.item.regions}
            />
            <a
              className="btn"
              href={documentFileUrl(target.item.documentId, target.item.page)}
              target="_blank"
              rel="noreferrer"
            >
              Abrir original en la página {target.item.page}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
