import { Controller, Get } from '@nestjs/common';
import { HealthResponseSchema } from '@postor/contracts';

@Controller('health')
export class HealthController {
  @Get()
  public check(): unknown {
    return HealthResponseSchema.parse({ status: 'ok' });
  }
}
