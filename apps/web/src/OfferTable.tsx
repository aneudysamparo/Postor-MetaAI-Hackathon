import type { JSX } from 'react';
import type { EconomicOffer } from './api';
import { Chip, Section } from './ui';
import type { Tone } from './ui';

// SNCC.F.033 economic offer as computed by the API: cost from a DEMO store
// or the company rate card, the company's uniform markup, ITBIS and the
// final unit price, against the tender's reference budget. Shown as a
// proposal: a person validates it before signing.

const STATUS_LABELS: Record<EconomicOffer['status'], { label: string; tone: Tone }> = {
  in_band: { label: 'dentro de la banda objetivo', tone: 'ok' },
  margin_floor: { label: 'margen mínimo aplicado', tone: 'warn' },
  over_budget: { label: 'supera el presupuesto', tone: 'bad' },
  incomplete: { label: 'faltan costos', tone: 'warn' },
  no_budget: { label: 'sin presupuesto publicado', tone: 'neutral' },
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
    <Section title={`SNCC.F.033 — Oferta económica propuesta (${offer.lines.length} líneas)`}>
      <p>
        <Chip tone={status.tone}>{status.label}</Chip>{' '}
        <span className="muted">
          Objetivo: {offer.targetPctOfBudget}% del presupuesto (banda {offer.bandPctOfBudget.min}–
          {offer.bandPctOfBudget.max}%), margen mínimo {offer.minMarginPct}%, ITBIS {offer.itbisPct}
          %.
        </span>
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Ítem</th>
              <th>Descripción</th>
              <th>Unidad</th>
              <th>Cant.</th>
              <th>Costo (fuente)</th>
              <th>Precio unitario</th>
              <th>ITBIS</th>
              <th>Precio unitario final</th>
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
                      · estimado entidad {money(line.estimatedUnitPriceDop)}
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
          <b>Valor total de la oferta:</b> {money(offer.offerTotalDop)}
          {offer.pctOfBudget !== null && offer.budgetDop !== null && (
            <span className="muted">
              {' '}
              · {offer.pctOfBudget}% del presupuesto de {money(offer.budgetDop)}
            </span>
          )}
        </li>
        <li>
          <b>En letras:</b> {offer.amountInWords}
        </li>
        <li>
          <b>Costo total:</b> {money(offer.costTotalDop)}
          {offer.marginPct !== null && (
            <span className="muted"> · margen sobre costo {offer.marginPct}%</span>
          )}
        </li>
        {offer.notes.map((note) => (
          <li key={note} className="muted">
            {note}
          </li>
        ))}
      </ul>
      <p className="banner">
        Precio propuesto por Postor con la política de precios de la empresa (DEMO). Los costos
        vienen de tiendas ficticias y tarifas por hora; una persona valida, firma y sella el F.033.
      </p>
    </Section>
  );
}
