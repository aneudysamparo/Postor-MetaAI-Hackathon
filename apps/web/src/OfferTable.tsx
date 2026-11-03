import type { JSX } from 'react';
import type { EconomicOffer } from './api';
import { Chip, Section } from './ui';
import type { Tone } from './ui';

// SNCC.F.033 economic offer as computed by the API: cost from a DEMO store
// or the company rate card, the company's uniform markup, ITBIS and the
// final unit price, against the tender's reference budget. Shown as a
// proposal: a person validates it before signing.

const STATUS_LABELS: Record<EconomicOffer['status'], { label: string; tone: Tone }> = {
  in_band: { label: 'within the target band', tone: 'ok' },
  margin_floor: { label: 'minimum margin applied', tone: 'warn' },
  over_budget: { label: 'over budget', tone: 'bad' },
  incomplete: { label: 'missing costs', tone: 'warn' },
  no_budget: { label: 'no published budget', tone: 'neutral' },
};

const PENDING = '[PENDING]';

function money(amount: number | null): string {
  if (amount === null) {
    return PENDING;
  }
  return `RD$ ${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function OfferTable({ offer }: { offer: EconomicOffer }): JSX.Element {
  const status = STATUS_LABELS[offer.status];
  return (
    <Section title={`SNCC.F.033 — Proposed economic offer (${offer.lines.length} lines)`}>
      <p>
        <Chip tone={status.tone}>{status.label}</Chip>{' '}
        <span className="muted">
          Target: {offer.targetPctOfBudget}% of the budget (band {offer.bandPctOfBudget.min}–
          {offer.bandPctOfBudget.max}%), minimum margin {offer.minMarginPct}%, ITBIS{' '}
          {offer.itbisPct}
          %.
        </span>
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Description</th>
              <th>Unit</th>
              <th>Cant.</th>
              <th>Cost (source)</th>
              <th>Unit price</th>
              <th>ITBIS</th>
              <th>Final unit price</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {offer.lines.map((line, index) => (
              <tr key={line.itemId ?? index}>
                <td>{index + 1}</td>
                <td>
                  {line.description}
                  {line.tenderPage !== null && (
                    <span className="muted"> · pliego p{line.tenderPage}</span>
                  )}
                  {line.estimatedUnitPriceDop !== null && (
                    <span className="muted">
                      {' '}
                      · entity estimate {money(line.estimatedUnitPriceDop)}
                    </span>
                  )}
                </td>
                <td>{line.unit ?? PENDING}</td>
                <td>{line.quantity ?? PENDING}</td>
                <td className="muted">
                  {money(line.unitCostDop)}
                  {line.costSource !== null && <> · {line.costSource}</>}
                </td>
                <td>{money(line.unitOfferDop)}</td>
                <td>{money(line.itbisDop)}</td>
                <td>{money(line.unitFinalDop)}</td>
                <td>
                  <b>{money(line.lineTotalDop)}</b>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="checks">
        <li>
          <b>Total offer value:</b> {money(offer.offerTotalDop)}
          {offer.pctOfBudget !== null && offer.budgetDop !== null && (
            <span className="muted">
              {' '}
              · {offer.pctOfBudget}% of the {money(offer.budgetDop)} budget
            </span>
          )}
        </li>
        <li>
          <b>In words:</b> {offer.amountInWords}
        </li>
        <li>
          <b>Total cost:</b> {money(offer.costTotalDop)}
          {offer.marginPct !== null && (
            <span className="muted"> · margin over cost {offer.marginPct}%</span>
          )}
        </li>
        {offer.notes.map((note) => (
          <li key={note} className="muted">
            {note}
          </li>
        ))}
      </ul>
      <p className="banner">
        Price proposed by Postor with the company’s pricing policy (DEMO). Costs come from fictional
        stores and hourly rates; a person validates, signs and stamps the F.033.
      </p>
    </Section>
  );
}
