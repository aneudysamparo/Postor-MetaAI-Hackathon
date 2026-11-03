import { Injectable } from '@nestjs/common';
import { AnalystWindowOutput, AnalystWindowOutputSchema } from '@postor/contracts';
import { MetaModelService } from '../../models/meta-model.service';
import { BaseAgent } from '../base/base-agent';

export interface AnalystPageInput {
  page: number;
  text: string;
  quality: string;
}

export interface AnalystWindowInput {
  documentLabel: string;
  fileName: string;
  startPage: number;
  endPage: number;
  pages: AnalystPageInput[];
}

// Agent 2 (PRD section 7): turns one document window into structured
// requirements. Windows carry ABSOLUTE page numbers and per-page quality
// flags, so citations stay exact and garbled pages yield low-confidence
// drafts instead of inventions.
@Injectable()
export class TenderAnalystAgent extends BaseAgent<AnalystWindowInput, AnalystWindowOutput> {
  protected readonly agentName = 'tender_analyst';
  protected readonly agentRole = 'Tender Analyst Agent';
  protected readonly taskName = 'extract';
  protected readonly promptVersion = 'tender-analyst-v1';
  protected readonly outputSchema = AnalystWindowOutputSchema;

  public constructor(metaModel: MetaModelService) {
    super(metaModel);
  }

  protected buildTaskPrompt(input: AnalystWindowInput): string {
    const pages = input.pages
      .map((page) => `--- page ${page.page} [extraction: ${page.quality}] ---\n${page.text}`)
      .join('\n\n');
    return [
      `Extract every bidding requirement from this excerpt of ${input.documentLabel}`,
      `(${input.fileName}, absolute pages ${input.startPage}-${input.endPage}).`,
      '',
      pages,
      '',
      'Tasks:',
      '1. Extract administrative, legal, technical, and economic requirements.',
      '2. Capture submission, visit, question, and award deadlines on each requirement.',
      '3. Capture guarantees, certifications, and mandatory conditions.',
      '4. Flag requirements whose omission could disqualify the bid.',
      '5. Record contradictions between passages instead of resolving them.',
      '6. Give every requirement: faithful original text, plain explanation,',
      '   category (one of: administrative, legal, technical, economic),',
      '   mandatory flag, ABSOLUTE page number, section heading when visible,',
      '   consequence of non-compliance, deadline, and confidence 0-1.',
      '',
      'Citation rules:',
      '- Page numbers MUST be the absolute numbers printed above, never window-relative.',
      '- Pages flagged scanned or poor may hold missing or garbled text: lower',
      '  confidence and say so in plainExplanation instead of guessing.',
      '- Never invent requirements or turn a recommendation into an obligation.',
    ].join('\n');
  }
}
