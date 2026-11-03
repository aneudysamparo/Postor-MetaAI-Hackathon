import { Global, Module } from '@nestjs/common';
import { MetaModelService } from './meta-model.service';

@Global()
@Module({
  providers: [MetaModelService],
  exports: [MetaModelService],
})
export class ModelsModule {}
