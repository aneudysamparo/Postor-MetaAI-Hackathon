// Deterministic financial math for the compliance step. Ratios and the
// concentration figure come straight from Company.profile numbers — the
// model interprets them, it never computes them. Pure: unit-testable.
export interface FinancialCheck {
  // total_assets / total_liabilities, 2 decimals (null when inputs missing).
  solvency: number | null;
  // current_liquidity as profiled (null when missing).
  liquidity: number | null;
  // total_liabilities / equity, 2 decimals (null when inputs missing).
  debt: number | null;
  // Latest annual_revenue year, DOP (null when missing).
  annualRevenueDop: number | null;
  // Tender amount / annual revenue, 4 decimals (null when either missing).
  concentrationRatio: number | null;
}

const RATIO_DECIMALS = 2;
const CONCENTRATION_DECIMALS = 4;
const PERCENT_SCALE = 100;

function roundTo(value: number, decimals: number): number {
  return Number(value.toFixed(decimals));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toPositiveNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}

function latestRevenue(profile: Record<string, unknown>): number | null {
  const financial = profile.financial_profile;
  if (!isRecord(financial)) {
    return null;
  }
  const revenue = financial.annual_revenue;
  if (!isRecord(revenue)) {
    return null;
  }
  const years = Object.keys(revenue).sort();
  const latestYear = years[years.length - 1];
  if (latestYear === undefined) {
    return null;
  }
  return toPositiveNumber(revenue[latestYear]);
}

export function buildFinancialCheck(
  profile: unknown,
  tenderAmountDop: number | null,
): FinancialCheck {
  const empty: FinancialCheck = {
    solvency: null,
    liquidity: null,
    debt: null,
    annualRevenueDop: null,
    concentrationRatio: null,
  };
  if (!isRecord(profile)) {
    return empty;
  }
  const financial = profile.financial_profile;
  if (!isRecord(financial)) {
    return empty;
  }
  const assets = toPositiveNumber(financial.total_assets);
  const liabilities = toPositiveNumber(financial.total_liabilities);
  const equity = toPositiveNumber(financial.equity);
  const liquidity = toPositiveNumber(financial.current_liquidity);
  const annualRevenueDop = latestRevenue(profile);
  const solvency =
    assets !== null && liabilities !== null ? roundTo(assets / liabilities, RATIO_DECIMALS) : null;
  const debt =
    liabilities !== null && equity !== null ? roundTo(liabilities / equity, RATIO_DECIMALS) : null;
  const tenderAmount = tenderAmountDop !== null ? toPositiveNumber(tenderAmountDop) : null;
  const concentrationRatio =
    tenderAmount !== null && annualRevenueDop !== null
      ? roundTo(tenderAmount / annualRevenueDop, CONCENTRATION_DECIMALS)
      : null;
  return { solvency, liquidity, debt, annualRevenueDop, concentrationRatio };
}

// Renders the check as prompt context: numbers plus what they mean, so the
// model judges financial requirements against exact figures.
export function renderFinancialContext(check: FinancialCheck): string {
  const lines = [
    `Solvency (assets/liabilities): ${check.solvency ?? 'unknown'}`,
    `Liquidity (current): ${check.liquidity ?? 'unknown'}`,
    `Debt (liabilities/equity): ${check.debt ?? 'unknown'}`,
    `Annual revenue (latest year, DOP): ${check.annualRevenueDop ?? 'unknown'}`,
  ];
  if (check.concentrationRatio !== null) {
    const percent = roundTo(check.concentrationRatio * PERCENT_SCALE, RATIO_DECIMALS);
    lines.push(`This tender equals ${percent}% of annual revenue (concentration risk).`);
  } else {
    lines.push('Tender-to-revenue concentration: unknown (amount or revenue missing).');
  }
  return lines.join('\n');
}
