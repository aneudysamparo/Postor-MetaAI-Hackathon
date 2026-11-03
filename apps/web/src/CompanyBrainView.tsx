import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { fetchCompany } from './api';
import type { CompanyBrain } from './api';
import { Chip, Section, formatMoney, formatRdLocal } from './ui';
import type { Tone } from './ui';

// YYYY-MM-DD prefix of an ISO timestamp.
const ISO_DATE_LENGTH = 10;

function record(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function list(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.map((entry) => record(entry));
  }
  return [];
}

function text(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }
  return '—';
}

function certificationTone(status: unknown): Tone {
  const current = status === 'valid';
  if (current) {
    return 'ok';
  }
  return 'bad';
}

// Company Brain profile (INSTRUCCIONES-6): the private, fictional company
// data every agent reads. Read-only here; the source of truth is the profile.
export function CompanyBrainView(): JSX.Element {
  const [company, setCompany] = useState<CompanyBrain | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCompany()
      .then(setCompany)
      .catch((reason: unknown) => setError(String(reason)));
  }, []);

  if (error !== null) {
    return <p className="error">{error}</p>;
  }
  if (company === null) {
    return <p>Loading Company Brain…</p>;
  }
  const profile = company.profile;
  const identity = record(profile.company);
  const financial = record(profile.financial_profile);
  const revenue = record(financial.annual_revenue);
  const certifications = list(record(profile.certifications).individual);
  const gaps = Array.isArray(profile.known_gaps_summary)
    ? (profile.known_gaps_summary as string[])
    : [];
  return (
    <div>
      <p className="kicker">Company Brain · private RAG per company</p>
      <h2>{company.name}</h2>
      <p className="sub">
        <Chip tone="warn">FICTIONAL COMPANY · DEMO</Chip> {text(identity.address)}
      </p>
      <div className="grid2">
        <Section title="Identity">
          <ul className="kv">
            <li>
              <b>RNC (fictional):</b> {text(identity.rnc_fictional)}
            </li>
            <li>
              <b>RPE (fictional):</b> {text(identity.rpe_fictional)}
            </li>
            <li>
              <b>Fundada:</b> {formatRdLocal(text(identity.founded))} ·{' '}
              {text(identity.employee_count)} employees
            </li>
            <li>
              <b>Representative:</b> {text(record(profile.legal_representative).name)}
            </li>
          </ul>
        </Section>
        <Section title="Finances">
          <ul className="kv">
            {Object.entries(revenue).map(([year, amount]) => (
              <li key={year}>
                <b>Revenue {year}:</b> RD$ {formatMoney(Number(amount))}
              </li>
            ))}
            <li>
              <b>Assets / Liabilities:</b> RD$ {formatMoney(Number(financial.total_assets))} / RD${' '}
              {formatMoney(Number(financial.total_liabilities))}
            </li>
            <li>
              <b>Current liquidity:</b> {text(financial.current_liquidity)}
            </li>
          </ul>
        </Section>
      </div>
      <Section title={`Individual certifications (${certifications.length})`}>
        <table>
          <thead>
            <tr>
              <th>Certification</th>
              <th>Titular</th>
              <th>Expires</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {certifications.map((certification, index) => (
              <tr key={index}>
                <td>{text(certification.title)}</td>
                <td>{text(certification.holder)}</td>
                <td>
                  {formatRdLocal(text(certification.expires))}{' '}
                  <Chip tone={certificationTone(certification.status)}>
                    {text(certification.status)}
                  </Chip>
                </td>
                <td className="muted">{text(certification.source)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Section title="Known gaps">
        <ul>
          {gaps.map((gap) => (
            <li key={gap}>{gap}</li>
          ))}
        </ul>
      </Section>
      <Section title={`Indexed documents (${company.documents.length})`}>
        <table>
          <thead>
            <tr>
              <th>Document</th>
              <th>Tipo</th>
              <th>Expires</th>
              <th>Verification</th>
            </tr>
          </thead>
          <tbody>
            {company.documents.map((document) => (
              <tr key={document.id}>
                <td>
                  <code>{document.fileName}</code>
                </td>
                <td>{document.documentType}</td>
                <td>{formatRdLocal(document.expiryDate?.slice(0, ISO_DATE_LENGTH))}</td>
                <td className="muted">{document.verificationStatus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}
