import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service.js';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'API の稼働状態を取得する' })
  @ApiOkResponse({
    description: 'API が稼働している',
    schema: {
      example: { status: 'ok' },
    },
  })
  getHealth() {
    return this.healthService.getHealth();
  }
}
