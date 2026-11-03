import { useState } from 'react';
import type { JSX } from 'react';
import type { VisualRegionBox } from '@postor/contracts';
import { pageImageUrl } from './api';

const PERCENT = 100;

// One label per SAM concept, in Spanish for the UI.
const CONCEPT_LABELS: Record<string, string> = {
  'handwritten signature': 'signature / initials',
  logo: 'institutional logo',
};

function percent(value: number, total: number): string {
  return `${(value / total) * PERCENT}%`;
}

// The cited page of the ORIGINAL PDF with the regions sam-3.1 localized,
// drawn as boxes in percentages of the image SAM saw, so they line up at any
// display width. Hidden when the document is not a PDF.
export function PageView({
  documentId,
  page,
  regions = [],
}: {
  documentId: string;
  page: number;
  regions?: VisualRegionBox[];
}): JSX.Element | null {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return null;
  }
  const labels = [...new Set(regions.map((region) => region.label))];
  return (
    <div>
      <div className="page-view">
        <img
          src={pageImageUrl(documentId, page)}
          alt={`Page ${page} of the original document`}
          onError={() => setFailed(true)}
        />
        {regions.map((region, index) => (
          <div
            key={`${region.label}-${index}`}
            className="sam-box"
            title={`${CONCEPT_LABELS[region.label] ?? region.label} · x ${region.x}, y ${region.y} (${region.width}×${region.height}px)`}
            style={{
              left: percent(region.x, region.imageWidth),
              top: percent(region.y, region.imageHeight),
              width: percent(region.width, region.imageWidth),
              height: percent(region.height, region.imageHeight),
            }}
          />
        ))}
      </div>
      {regions.length > 0 && (
        <p className="muted">
          SAM 3.1 located {regions.length} region(s):{' '}
          {labels.map((label) => CONCEPT_LABELS[label] ?? label).join(', ')}. Pixel coordinates of
          the rendered page; hover over each box.
        </p>
      )}
    </div>
  );
}
