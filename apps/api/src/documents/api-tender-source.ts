import { Injectable } from '@nestjs/common';
import { NormalizedTender, TenderSource } from './tender-source';

// Production path: the external procurement API behind the same DTOs.
// Not wired in the demo; LocalTenderSource serves the fixtures instead.
// Select with TENDER_SOURCE=api once this class is implemented.
@Injectable()
export class ApiTenderSource implements TenderSource {
  public listTenders(): Promise<NormalizedTender[]> {
    return Promise.reject(
      new Error('ApiTenderSource is not wired: the demo runs on LocalTenderSource.'),
    );
  }

  public getTender(caseKey: string): Promise<NormalizedTender> {
    return Promise.reject(
      new Error(`ApiTenderSource is not wired: cannot load tender ${caseKey}.`),
    );
  }
}
