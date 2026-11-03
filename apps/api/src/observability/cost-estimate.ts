// Cost estimate per model call (PRD section 21, AC-OBS): tokens x configured
// rates. It is always labeled an ESTIMATE: the Meta account's real billing
// is not exposed by the API response, so rates come from the environment.
export interface CostRates {
  inputUsdPerMillionTokens: number;
  outputUsdPerMillionTokens: number;
  // "env" when both rates were configured, "placeholder" otherwise: the UI
  // must say the figure uses placeholder rates.
  source: 'env' | 'placeholder';
}

export interface CallCost {
  tokensIn: number;
  tokensOut: number;
  estimatedCostUsd: number;
}

// Placeholder rates used only when META_COST_* are unset. They are not a
// published Meta price; they exist so the trace shows an order of magnitude.
const PLACEHOLDER_INPUT_USD_PER_MTOK = 0.5;
const PLACEHOLDER_OUTPUT_USD_PER_MTOK = 1.5;
const TOKENS_PER_MILLION = 1_000_000;
const COST_DECIMALS = 6;

function readRate(env: NodeJS.ProcessEnv, name: string): number | null {
  const raw = (env[name] ?? '').trim();
  if (raw.length === 0) {
    return null;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    return null;
  }
  return value;
}

export function loadCostRates(env: NodeJS.ProcessEnv = process.env): CostRates {
  const input = readRate(env, 'META_COST_INPUT_USD_PER_MTOK');
  const output = readRate(env, 'META_COST_OUTPUT_USD_PER_MTOK');
  if (input !== null && output !== null) {
    return { inputUsdPerMillionTokens: input, outputUsdPerMillionTokens: output, source: 'env' };
  }
  return {
    inputUsdPerMillionTokens: PLACEHOLDER_INPUT_USD_PER_MTOK,
    outputUsdPerMillionTokens: PLACEHOLDER_OUTPUT_USD_PER_MTOK,
    source: 'placeholder',
  };
}

export function estimateCallCost(
  tokensIn: number | null,
  tokensOut: number | null,
  rates: CostRates,
): CallCost {
  const inputTokens = tokensIn ?? 0;
  const outputTokens = tokensOut ?? 0;
  const raw =
    (inputTokens * rates.inputUsdPerMillionTokens +
      outputTokens * rates.outputUsdPerMillionTokens) /
    TOKENS_PER_MILLION;
  return {
    tokensIn: inputTokens,
    tokensOut: outputTokens,
    estimatedCostUsd: Number(raw.toFixed(COST_DECIMALS)),
  };
}
