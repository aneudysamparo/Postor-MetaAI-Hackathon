import { useState } from 'react';
import type { JSX } from 'react';
import { CompanyBrainView } from './CompanyBrainView';
import { Feed } from './Feed';
import { Ficha } from './Ficha';

type View =
  { name: 'feed' } | { name: 'brain' } | { name: 'ficha'; opportunityId: string; code: string };

export function App(): JSX.Element {
  const [view, setView] = useState<View>({ name: 'feed' });
  const navClass = (active: boolean): string => {
    if (active) {
      return 'nav active';
    }
    return 'nav';
  };
  return (
    <div className="shell">
      <aside className="side">
        <h1 className="brand">Postor Bids</h1>
        <p className="brand-sub">Del pliego a tu oferta completa</p>
        <nav>
          <button
            className={navClass(view.name === 'feed')}
            onClick={() => setView({ name: 'feed' })}
          >
            Oportunidades
          </button>
          <button
            className={navClass(view.name === 'brain')}
            onClick={() => setView({ name: 'brain' })}
          >
            Company Brain
          </button>
          {view.name === 'ficha' && <button className="nav active">{view.code}</button>}
        </nav>
        <p className="side-foot">
          Licitaciones reales del portal DGCP · empresa ficticia (NovaTech, DEMO) · la oferta la
          revisa, firma y presenta una persona.
        </p>
      </aside>
      <main className="main">
        {view.name === 'feed' && (
          <Feed onOpen={(opportunityId, code) => setView({ name: 'ficha', opportunityId, code })} />
        )}
        {view.name === 'brain' && <CompanyBrainView />}
        {view.name === 'ficha' && (
          <Ficha opportunityId={view.opportunityId} onBack={() => setView({ name: 'feed' })} />
        )}
      </main>
    </div>
  );
}
