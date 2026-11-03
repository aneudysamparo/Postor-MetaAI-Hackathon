import type { JSX } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router';
import { CompanyBrainView } from './CompanyBrainView';
import { Feed } from './Feed';
import { Ficha } from './Ficha';

// Routes (Spanish, like the UI labels):
//   /oportunidades                      feed
//   /oportunidades/:code/:tab?          ficha of one tender, tab in the URL
//   /company-brain                      company profile
export const OPPORTUNITIES_PATH = '/oportunidades';
export const COMPANY_BRAIN_PATH = '/company-brain';

function navClass({ isActive }: { isActive: boolean }): string {
  if (isActive) {
    return 'nav active';
  }
  return 'nav';
}

export function App(): JSX.Element {
  return (
    <div className="shell">
      <aside className="side">
        <h1 className="brand">Postor Bids</h1>
        <p className="brand-sub">Del pliego a tu oferta completa</p>
        <nav>
          <NavLink to={OPPORTUNITIES_PATH} className={navClass}>
            Oportunidades
          </NavLink>
          <NavLink to={COMPANY_BRAIN_PATH} className={navClass}>
            Company Brain
          </NavLink>
        </nav>
        <p className="side-foot">
          Licitaciones reales del portal DGCP · empresa ficticia (NovaTech, DEMO) · la oferta la
          revisa, firma y presenta una persona.
        </p>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<Navigate to={OPPORTUNITIES_PATH} replace />} />
          <Route path={OPPORTUNITIES_PATH} element={<Feed />} />
          <Route path={`${OPPORTUNITIES_PATH}/:code`} element={<Ficha />} />
          <Route path={`${OPPORTUNITIES_PATH}/:code/:tab`} element={<Ficha />} />
          <Route path={COMPANY_BRAIN_PATH} element={<CompanyBrainView />} />
          <Route path="*" element={<Navigate to={OPPORTUNITIES_PATH} replace />} />
        </Routes>
      </main>
    </div>
  );
}
