import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { fetchStores } from './api';
import type { StoresResponse } from './api';
import { Chip, Section } from './ui';

// "Stores (DEMO)": the fictional supplier catalogs and the company's
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
    return <p className="muted">Loading stores…</p>;
  }
  const policy = data.policy;
  return (
    <div>
      <p className="kicker">Stores (DEMO)</p>
      <h2>Where the offer prices come from</h2>
      <p className="sub">
        Fictional stores and prices (without ITBIS). The pricing agent picks the cheapest valid
        product that meets each pliego item; code checks the price exists in the catalog and
        computes the offer with the company’s policy.
      </p>
      <Section title="NovaTech pricing policy (DEMO)">
        <p>{policy.rationale}</p>
        <p className="muted">
          ITBIS {policy.itbis_pct}% · target {policy.offer_target_pct_of_budget}% of the budget ·
          band {policy.offer_band_pct_of_budget.min}–{policy.offer_band_pct_of_budget.max}% ·
          minimum margin {policy.min_margin_pct}%
        </p>
        <ul className="checks">
          {policy.service_rates.map((rate) => (
            <li key={rate.role}>
              <b>{rate.role}:</b> {money(rate.rate_dop_per_hour)} per hour
            </li>
          ))}
        </ul>
      </Section>
      {data.stores.map((store) => (
        <Section key={store.id} title={`${store.id} · ${store.name}`}>
          <p>
            <Chip tone="neutral">{store.line}</Chip>{' '}
            <span className="muted">
              valid until {store.valid_until} · {store.notes}
            </span>
          </p>
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Product</th>
                <th>Unit</th>
                <th>Price (without ITBIS)</th>
                <th>Stock</th>
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
