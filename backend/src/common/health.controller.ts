import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  getHealth() {
    return {
      status: 'ok',
      uptime: parseFloat(process.uptime().toFixed(2)),
    };
  }
}
