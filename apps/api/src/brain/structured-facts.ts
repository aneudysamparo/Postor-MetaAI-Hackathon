// Structured facts: the profile is the source of truth, so agents receive
// key facts directly instead of hoping retrieval finds them. Deterministic:
// same profile, same facts, same order. Financial math and date thresholds
// in later agents read Company.profile itself, never these rendered strings.
export interface StructuredFact {
  key: string;
  label: string;
  value: string;
  source: string;
  verificationLevel: string;
}

const MAX_STRUCTURED_FACTS = 60;
const UNKNOWN_SOURCE = 'profile';
const UNKNOWN_VERIFICATION = 'unknown';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

function sourceOf(entity: unknown): string {
  if (isRecord(entity) && typeof entity.source === 'string') {
    return entity.source;
  }
  return UNKNOWN_SOURCE;
}

function verificationOf(entity: unknown): string {
  if (isRecord(entity) && typeof entity.verification_level === 'string') {
    return entity.verification_level;
  }
  return UNKNOWN_VERIFICATION;
}

function pushFact(
  facts: StructuredFact[],
  key: string,
  label: string,
  value: string,
  entity: unknown,
): void {
  if (facts.length >= MAX_STRUCTURED_FACTS || value.trim().length === 0) {
    return;
  }
  facts.push({
    key,
    label,
    value,
    source: sourceOf(entity),
    verificationLevel: verificationOf(entity),
  });
}

export function buildStructuredFacts(profile: unknown): StructuredFact[] {
  const facts: StructuredFact[] = [];
  if (!isRecord(profile)) {
    return facts;
  }
  const company = profile.company;
  if (isRecord(company)) {
    pushFact(facts, 'company.legal_name', 'Legal name', toText(company.legal_name), company);
    pushFact(facts, 'company.rnc', 'RNC (fictional)', toText(company.rnc_fictional), company);
    pushFact(facts, 'company.rpe', 'RPE (fictional)', toText(company.rpe_fictional), company);
    pushFact(facts, 'company.founded', 'Founded', toText(company.founded), company);
    pushFact(facts, 'company.headcount', 'Headcount', toText(company.employee_count), company);
    pushFact(facts, 'company.address', 'Address', toText(company.address), company);
  }
  if (Array.isArray(profile.capabilities)) {
    for (const capability of profile.capabilities) {
      if (!isRecord(capability)) {
        continue;
      }
      pushFact(
        facts,
        `capability.${toText(capability.id)}`,
        `Capability: ${toText(capability.label)}`,
        toText(capability.label),
        capability,
      );
    }
  }
  if (Array.isArray(profile.experience)) {
    for (const project of profile.experience) {
      if (!isRecord(project)) {
        continue;
      }
      const value =
        `${toText(project.title)} — ${toText(project.client_fictional)} ` +
        `(${toText(project.contract_value)} ${toText(project.currency)})`;
      pushFact(facts, `project.${toText(project.project_id)}`, 'Past project', value, project);
    }
  }
  if (Array.isArray(profile.team)) {
    pushFact(facts, 'team.count', 'Team members', String(profile.team.length), profile);
    for (const member of profile.team) {
      if (!isRecord(member)) {
        continue;
      }
      pushFact(
        facts,
        `team.${toText(member.name)}`,
        'Team member',
        `${toText(member.name)} — ${toText(member.position)}`,
        member,
      );
    }
  }
  if (Array.isArray(profile.suppliers)) {
    for (const supplier of profile.suppliers) {
      if (!isRecord(supplier)) {
        continue;
      }
      pushFact(
        facts,
        `supplier.${toText(supplier.id)}`,
        'Supplier',
        `${toText(supplier.name)} (${toText(supplier.line)})`,
        supplier,
      );
    }
  }
  if (isRecord(profile.certifications) && Array.isArray(profile.certifications.individual)) {
    for (const cert of profile.certifications.individual) {
      if (!isRecord(cert)) {
        continue;
      }
      const value =
        `${toText(cert.title)} — ${toText(cert.holder)} ` +
        `(expires ${toText(cert.expires)}, ${toText(cert.status)})`;
      pushFact(facts, `cert.${toText(cert.document_id)}`, 'Individual certification', value, cert);
    }
  }
  if (isRecord(profile.compliance)) {
    for (const [key, entry] of Object.entries(profile.compliance)) {
      if (!isRecord(entry)) {
        continue;
      }
      const value = `${toText(entry.status)} (expires ${toText(entry.expires) || 'n/a'})`;
      pushFact(facts, `compliance.${key}`, `Compliance: ${key}`, value, entry);
    }
  }
  if (isRecord(profile.financial_profile)) {
    const financial = profile.financial_profile;
    if (isRecord(financial.annual_revenue)) {
      for (const [year, amount] of Object.entries(financial.annual_revenue)) {
        pushFact(facts, `financial.revenue.${year}`, `Revenue ${year}`, toText(amount), financial);
      }
    }
    pushFact(facts, 'financial.assets', 'Total assets', toText(financial.total_assets), financial);
    pushFact(
      facts,
      'financial.liabilities',
      'Total liabilities',
      toText(financial.total_liabilities),
      financial,
    );
    pushFact(
      facts,
      'financial.liquidity',
      'Current liquidity',
      toText(financial.current_liquidity),
      financial,
    );
  }
  if (Array.isArray(profile.known_gaps_summary)) {
    profile.known_gaps_summary.forEach((gap: unknown, index: number) => {
      pushFact(facts, `gap.${index + 1}`, 'Known gap', toText(gap), profile);
    });
  }
  return facts;
}
