import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { fetchStores } from './api';
import type { StoresResponse } from './api';
import { Chip, Section } from './ui';

// "Tiendas (DEMO)": the fictional supplier catalogs and the company's
// pricing policy — the only sources the economic offer (F.033) prices from.

function money(amount: number): string {
  return `RD$ ${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function StoresView(): JSX.Element {
  const [data, setData] = useState<StoresResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetchStores()
      .then(setData)
      .catch((fetchError: unknown) => setError(String(fetchError)));
  }, []);
  if (error !== null) {
    return <p className="error">{error}</p>;
  }
  if (data === null) {
    return <p className="muted">Cargando tiendas…</p>;
  }
  const policy = data.policy;
  return (
    <div>
      <p className="kicker">Tiendas (DEMO)</p>
      <h2>De dónde salen los precios de la oferta</h2>
      <p className="sub">
        Tiendas y precios ficticios (sin ITBIS). El agente de precios elige el producto vigente más
        barato que cumple cada ítem del pliego; el código verifica que el precio exista en el
        catálogo y calcula la oferta con la política de la empresa.
      </p>
      <Section title="Política de precios de NovaTech (DEMO)">
        <p>{policy.rationale}</p>
        <p className="muted">
          ITBIS {policy.itbis_pct}% · objetivo {policy.offer_target_pct_of_budget}% del presupuesto
          · banda {policy.offer_band_pct_of_budget.min}–{policy.offer_band_pct_of_budget.max}% ·
          margen mínimo {policy.min_margin_pct}%
        </p>
        <ul className="checks">
          {policy.service_rates.map((rate) => (
            <li key={rate.role}>
              <b>{rate.role}:</b> {money(rate.rate_dop_per_hour)} por hora
            </li>
          ))}
        </ul>
      </Section>
      {data.stores.map((store) => (
        <Section key={store.id} title={`${store.id} · ${store.name}`}>
          <p>
            <Chip tone="neutral">{store.line}</Chip>{' '}
            <span className="muted">
              vigente hasta {store.valid_until} · {store.notes}
            </span>
          </p>
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Producto</th>
                <th>Unidad</th>
                <th>Precio (sin ITBIS)</th>
                <th>Existencia</th>
              </tr>
            </thead>
            <tbody>
              {store.products.map((product) => (
                <tr key={product.sku}>
                  <td>
                    <code>{product.sku}</code>
                  </td>
                  <td>{product.name}</td>
                  <td>{product.unit}</td>
                  <td>{money(product.price_dop)}</td>
                  <td>{product.stock ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      ))}
    </div>
  );
}
