import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface StoredPagePreview {
  page?: unknown;
  quality?: unknown;
  preview?: unknown;
}

// Opens one evidence row: which document, which page, how it was read, and a
// short preview of the extracted page so reviewers can confirm the citation.
@Controller('artifacts')
export class EvidenceController {
  public constructor(private readonly prisma: PrismaService) {}

  @Get(':id/evidence/:evidenceId')
  public async open(@Param('id') id: string, @Param('evidenceId') evidenceId: string) {
    const evidence = await this.prisma.artifactEvidence.findUnique({
      where: { id: evidenceId },
    });
    if (evidence === null || evidence.artifactId !== id) {
      throw new NotFoundException(`Unknown evidence ${evidenceId} on artifact ${id}.`);
    }
    const document = await this.prisma.tenderDocument.findUnique({
      where: { id: evidence.documentId },
    });
    if (document === null) {
      throw new NotFoundException(`Evidence points at missing document ${evidence.documentId}.`);
    }
    return {
      evidence,
      document: {
        id: document.id,
        fileName: document.fileName,
        pageCount: document.pageCount,
      },
      pagePreview: this.pagePreviewOf(document.extraction, evidence.page),
    };
  }

  private pagePreviewOf(
    extraction: unknown,
    page: number,
  ): { text: string; quality: string } | null {
    if (typeof extraction !== 'object' || extraction === null) {
      return null;
    }
    const pages = (extraction as { pages?: StoredPagePreview[] }).pages;
    if (!Array.isArray(pages)) {
      return null;
    }
    const match = pages.find((entry) => entry.page === page);
    if (match === undefined) {
      return null;
    }
    const text = typeof match.preview === 'string' ? match.preview : '';
    const quality = typeof match.quality === 'string' ? match.quality : 'unknown';
    return { text, quality };
  }
}
