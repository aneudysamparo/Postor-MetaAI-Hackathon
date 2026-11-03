import { Global, Module } from '@nestjs/common';
import { DocumentGuardService } from './document-guard.service';
import { MetaModelService } from './meta-model.service';

// Factory on purpose: MetaModelService takes an optional fetch override for
// tests, and a defaulted constructor param would make Nest try to resolve
// `Function` as a provider. The factory keeps DI out of that decision.
@Global()
@Module({
  providers: [
    { provide: MetaModelService, useFactory: () => new MetaModelService() },
    { provide: DocumentGuardService, useFactory: () => new DocumentGuardService() },
  ],
  exports: [MetaModelService, DocumentGuardService],
})
export class ModelsModule {}
