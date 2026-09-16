import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get()
  getRoot() {
    return {
      name: 'Mini Job Queue API',
      status: 'ok',
      endpoints: ['/health', '/jobs'],
    };
  }

  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      uptime: parseFloat(process.uptime().toFixed(2)),
    };
  }
}
