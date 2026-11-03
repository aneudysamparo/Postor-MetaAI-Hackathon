/**
 * Single point of contact with the Meta Model API.
 *
 * WIRE-FORMAT ASSUMPTION (to verify live once META_API_KEY is available):
 * the gateway is OpenAI-compatible, so reasoning and vision calls go to
 * POST {META_BASE_URL}/chat/completions with Bearer auth. If the live
 * account answers differently, only `buildChatRequest` and `readChatResponse`
 * must change — agent code stays untouched.
 *
 * Cost control: callers send fragments, never full documents. Every call
 * returns the token usage and duration so the Trace view can show them.
 */
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { loadMetaModelsConfig } from './meta-models.config';

export interface ChatUsage {
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface JsonCompletion<T> {
  data: T;
  usage: ChatUsage;
  modelRequested: string;
  modelReturned: string | null;
  durationMs: number;
  rawResponse: string | null;
}

export interface ImageAnalysis {
  text: string;
  usage: ChatUsage;
  modelRequested: string;
  modelReturned: string | null;
  durationMs: number;
}

export interface JsonCompletionRequest<T> {
  systemPrompt: string;
  taskPrompt: string;
  schema: z.ZodType<T>;
  model?: string;
}

export interface ImageAnalysisRequest {
  imageUrl: string;
  taskPrompt: string;
  model?: string;
}

export interface RegionHint {
  label: string;
}

export interface SegmentRegionsRequest {
  imageUrl: string;
  hint: RegionHint;
}

export interface VisualRegion {
  label: string;
  box: { x: number; y: number; width: number; height: number };
  // Pixel size of the image the box refers to (as reported by sam-3.1).
  imageWidth: number;
  imageHeight: number;
  confidence: number | null;
}

const CHAT_COMPLETIONS_PATH = '/chat/completions';
const RESPONSES_PATH = '/responses';
const DEFAULT_SAM_MODEL = 'sam-3.1';
const SAM_BOX_PATTERN = /<\|box;x1=(\d+);y1=(\d+);x2=(\d+);y2=(\d+);w=(\d+);h=(\d+)\|>/g;

export interface SegmentationResult {
  regions: VisualRegion[];
  modelRequested: string;
  modelReturned: string | null;
  durationMs: number;
}

// Pure parser for the sam-3.1 special-token lane (unit-tested). Boxes come
// in pixels of the image that was sent, together with that image's size.
export function parseSamBoxes(lane: string, label: string): VisualRegion[] {
  const regions: VisualRegion[] = [];
  for (const match of lane.matchAll(SAM_BOX_PATTERN)) {
    const [x1, y1, x2, y2, width, height] = match.slice(1).map(Number);
    if (
      [x1, y1, x2, y2, width, height].some((value) => value === undefined || Number.isNaN(value))
    ) {
      continue;
    }
    regions.push({
      label,
      box: {
        x: x1 as number,
        y: y1 as number,
        width: (x2 as number) - (x1 as number),
        height: (y2 as number) - (y1 as number),
      },
      imageWidth: width as number,
      imageHeight: height as number,
      confidence: null,
    });
  }
  return regions;
}

// Responses API: output[] -> content[] -> output_text.text, concatenated.
function readResponsesText(raw: Record<string, unknown>): string {
  const output = raw.output;
  if (!Array.isArray(output)) {
    return '';
  }
  const texts: string[] = [];
  for (const item of output) {
    if (!isRecord(item) || !Array.isArray(item.content)) {
      continue;
    }
    for (const part of item.content as unknown[]) {
      if (isRecord(part) && typeof part.text === 'string') {
        texts.push(part.text);
      }
    }
  }
  return texts.join('');
}
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_SERVER_ERROR_FLOOR = 500;
const JSON_MIME_TYPE = 'application/json';

export class MetaAuthError extends Error {}
export class MetaTimeoutError extends Error {}
export class MetaResponseError extends Error {}

interface ChatChoice {
  message?: { content?: unknown };
}

interface ChatResponseBody {
  choices?: ChatChoice[];
  model?: unknown;
  usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
}

function toNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function toNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

type FetchFn = typeof fetch;

@Injectable()
export class MetaModelService {
  // The HTTP client is injectable so tests can stub the network edge.
  public constructor(private readonly httpFetch: FetchFn = fetch) {}

  public async completeJson<T>(request: JsonCompletionRequest<T>): Promise<JsonCompletion<T>> {
    const startedAt = Date.now();
    const config = loadMetaModelsConfig();
    const model = request.model ?? config.defaultModel;
    const firstBody = this.buildChatRequest(model, request.systemPrompt, request.taskPrompt, true);
    const firstRaw = await this.postChatWithRetry(config, firstBody);
    const firstParsed = this.parseJsonPayload<T>(firstRaw, request.schema);
    if (firstParsed.success) {
      return this.toCompletion(request, model, firstRaw, firstParsed.data, startedAt);
    }
    const correctionPrompt =
      `${request.taskPrompt}\n\nYour previous response was not valid JSON: ` +
      `${firstParsed.error}. Respond again with ONLY valid JSON, no prose.`;
    const retryBody = this.buildChatRequest(model, request.systemPrompt, correctionPrompt, true);
    const retryRaw = await this.postChatWithRetry(config, retryBody);
    const retryParsed = this.parseJsonPayload<T>(retryRaw, request.schema);
    if (retryParsed.success) {
      return this.toCompletion(request, model, retryRaw, retryParsed.data, startedAt);
    }
    throw new MetaResponseError(
      `The model did not return valid JSON after one correction retry: ${retryParsed.error}`,
    );
  }

  public async analyzeImage(request: ImageAnalysisRequest): Promise<ImageAnalysis> {
    const startedAt = Date.now();
    const config = loadMetaModelsConfig();
    const model = request.model ?? config.defaultModel;
    const body = {
      model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: request.taskPrompt },
            { type: 'image_url', image_url: { url: request.imageUrl } },
          ],
        },
      ],
    };
    const raw = await this.postChatWithRetry(config, body);
    const text = this.readFirstChoiceText(raw);
    if (text === null) {
      throw new MetaResponseError('The model response carried no readable text.');
    }
    return {
      text,
      usage: this.readUsage(raw),
      modelRequested: model,
      modelReturned: toNullableString(raw.model),
      durationMs: Date.now() - startedAt,
    };
  }

  // sam-3.1 localizes regions ONLY (it never reads text). It is called
  // through the Responses API with ONE short concept phrase ("handwritten
  // signature", "logo") plus the image. Verified live 2026-11-03: the answer
  // is a special-token lane in output_text, one
  // `<|box;x1=..;y1=..;x2=..;y2=..;w=..;h=..|><|mask;...|>` group per
  // instance (pixel coordinates of the image sent). An empty lane means "no
  // instance of that concept", never an error. Masks are ignored: Postor
  // cites boxes.
  public async segmentRegions(request: SegmentRegionsRequest): Promise<SegmentationResult> {
    const startedAt = Date.now();
    const config = loadMetaModelsConfig();
    const model = (process.env.META_MODEL_SAM ?? '').trim() || DEFAULT_SAM_MODEL;
    const raw = await this.postWithRetry(config, RESPONSES_PATH, {
      model,
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: request.hint.label },
            { type: 'input_image', image_url: request.imageUrl },
          ],
        },
      ],
    });
    const lane = readResponsesText(raw);
    return {
      regions: parseSamBoxes(lane, request.hint.label),
      modelRequested: model,
      modelReturned: toNullableString(raw.model),
      durationMs: Date.now() - startedAt,
    };
  }

  private buildChatRequest(
    model: string,
    systemPrompt: string,
    taskPrompt: string,
    jsonOnly: boolean,
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: taskPrompt },
      ],
    };
    if (jsonOnly) {
      body.response_format = { type: 'json_object' };
    }
    return body;
  }

  private parseJsonPayload<T>(
    raw: ChatResponseBody,
    schema: z.ZodType<T>,
  ): { success: true; data: T } | { success: false; error: string } {
    const text = this.readFirstChoiceText(raw);
    if (text === null) {
      return { success: false, error: 'empty model response' };
    }
    let decoded: unknown;
    try {
      decoded = JSON.parse(text) as unknown;
    } catch (parseError) {
      const detail = parseError instanceof Error ? parseError.message : String(parseError);
      return { success: false, error: `unparseable JSON (${detail})` };
    }
    const validated = schema.safeParse(decoded);
    if (validated.success) {
      return { success: true, data: validated.data };
    }
    return { success: false, error: `schema mismatch (${validated.error.message})` };
  }

  private toCompletion<T>(
    _request: JsonCompletionRequest<T>,
    model: string,
    raw: ChatResponseBody,
    data: T,
    startedAt: number,
  ): JsonCompletion<T> {
    return {
      data,
      usage: this.readUsage(raw),
      modelRequested: model,
      modelReturned: toNullableString(raw.model),
      durationMs: Date.now() - startedAt,
      rawResponse: this.readFirstChoiceText(raw),
    };
  }

  private readFirstChoiceText(raw: ChatResponseBody): string | null {
    const choices = raw.choices;
    if (choices === undefined || choices.length === 0) {
      return null;
    }
    const content = choices[0].message?.content;
    if (typeof content === 'string') {
      return content;
    }
    return null;
  }

  private readUsage(raw: ChatResponseBody): ChatUsage {
    const usage = raw.usage;
    if (!isRecord(usage)) {
      return { inputTokens: null, outputTokens: null };
    }
    return {
      inputTokens: toNullableNumber(usage.prompt_tokens),
      outputTokens: toNullableNumber(usage.completion_tokens),
    };
  }

  private async postChatWithRetry(
    config: ReturnType<typeof loadMetaModelsConfig>,
    body: Record<string, unknown>,
  ): Promise<ChatResponseBody> {
    return this.postWithRetry(config, CHAT_COMPLETIONS_PATH, body) as Promise<ChatResponseBody>;
  }

  // Same transport rules for every endpoint: retry once on 429/5xx/network,
  // never on 401/403, 120 s timeout per attempt.
  private async postWithRetry(
    config: ReturnType<typeof loadMetaModelsConfig>,
    path: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    let attempt = 0;
    for (;;) {
      attempt += 1;
      try {
        return await this.postOnce(config, path, body);
      } catch (error) {
        if (this.isAuthError(error) || attempt >= config.maxAttempts) {
          throw error;
        }
      }
    }
  }

  private async postOnce(
    config: ReturnType<typeof loadMetaModelsConfig>,
    path: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await this.httpFetch(`${config.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': JSON_MIME_TYPE,
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(config.timeoutMs),
      });
    } catch (networkError) {
      throw new MetaTimeoutError(
        `Meta request failed before a response arrived: ${this.errorDetail(networkError)}`,
      );
    }
    if (response.status === HTTP_TOO_MANY_REQUESTS) {
      throw new MetaResponseError('Meta rate limit hit (HTTP 429). The call was retried once.');
    }
    if (response.status >= HTTP_SERVER_ERROR_FLOOR) {
      throw new MetaResponseError(
        `Meta server error (HTTP ${response.status}). The call was retried once.`,
      );
    }
    if (!response.ok) {
      const bodyText = await this.readBodyText(response);
      throw new MetaAuthError(`Meta rejected the request (HTTP ${response.status}): ${bodyText}`);
    }
    const decoded: unknown = await response.json();
    if (!isRecord(decoded)) {
      throw new MetaResponseError('Meta returned a non-object payload.');
    }
    return decoded;
  }

  private isAuthError(error: unknown): boolean {
    return error instanceof MetaAuthError;
  }

  private async readBodyText(response: Response): Promise<string> {
    try {
      const text = await response.text();
      return text.length > 0 ? text : '(empty body)';
    } catch (bodyError) {
      return `(unreadable body: ${this.errorDetail(bodyError)})`;
    }
  }

  private errorDetail(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }
}
