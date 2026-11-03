import type { JSX } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router';
import { AccessGate } from './AccessGate';
import { CompanyBrainView } from './CompanyBrainView';
import { Feed } from './Feed';
import { Ficha } from './Ficha';
import { HowItWorks } from './HowItWorks';
import { StoresView } from './StoresView';

// Routes (Spanish, like the UI labels):
//   /oportunidades                      feed
//   /oportunidades/:code/:tab?          ficha of one tender, tab in the URL
//   /company-brain                      company profile
//   /como-funciona                      the pipeline and its Meta models
export const OPPORTUNITIES_PATH = '/oportunidades';
export const COMPANY_BRAIN_PATH = '/company-brain';
export const HOW_IT_WORKS_PATH = '/como-funciona';
export const STORES_PATH = '/tiendas';

function navClass({ isActive }: { isActive: boolean }): string {
  if (isActive) {
    return 'nav active';
  }
  return 'nav';
}

export function App(): JSX.Element {
  return <AccessGate>{(access) => <Shell userKeyRequired={access.userKeyRequired} />}</AccessGate>;
}

function Shell({ userKeyRequired }: { userKeyRequired: boolean }): JSX.Element {
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
          <NavLink to={STORES_PATH} className={navClass}>
            Tiendas (DEMO)
          </NavLink>
          <NavLink to={HOW_IT_WORKS_PATH} className={navClass}>
            Cómo funciona
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
          <Route
            path={`${OPPORTUNITIES_PATH}/:code`}
            element={<Ficha userKeyRequired={userKeyRequired} />}
          />
          <Route
            path={`${OPPORTUNITIES_PATH}/:code/:tab`}
            element={<Ficha userKeyRequired={userKeyRequired} />}
          />
          <Route path={COMPANY_BRAIN_PATH} element={<CompanyBrainView />} />
          <Route path={HOW_IT_WORKS_PATH} element={<HowItWorks />} />
          <Route path={STORES_PATH} element={<StoresView />} />
          <Route path="*" element={<Navigate to={OPPORTUNITIES_PATH} replace />} />
        </Routes>
      </main>
    </div>
  );
}
