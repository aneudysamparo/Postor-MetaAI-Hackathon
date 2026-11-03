import { Module } from '@nestjs/common';
import { ApiTenderSource } from './api-tender-source';
import { DocumentIngestionService } from './document-ingestion.service';
import { DocxTextExtractor } from './docx-text-extractor';
import { LocalTenderSource, resolveDefaultTendersDir } from './local-tender-source';
import { PdfPageRenderer } from './pdf-page-renderer';
import { PdfTextExtractor } from './pdf-text-extractor';
import { TENDER_SOURCE } from './tender-source';

const API_SOURCE_NAME = 'api';

@Module({
  providers: [
    PdfTextExtractor,
    PdfPageRenderer,
    DocxTextExtractor,
    DocumentIngestionService,
    {
      provide: TENDER_SOURCE,
      useFactory: () => {
        const mode = (process.env.TENDER_SOURCE ?? '').trim().toLowerCase();
        if (mode === API_SOURCE_NAME) {
          return new ApiTenderSource();
        }
        return new LocalTenderSource(resolveDefaultTendersDir());
      },
    },
  ],
  exports: [
    TENDER_SOURCE,
    DocumentIngestionService,
    PdfTextExtractor,
    PdfPageRenderer,
    DocxTextExtractor,
  ],
})
export class DocumentsModule {}
