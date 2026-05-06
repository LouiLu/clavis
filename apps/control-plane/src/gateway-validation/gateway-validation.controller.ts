import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { GatewayValidationService } from './gateway-validation.service';

@Controller('internal/v1/api-keys')
export class GatewayValidationController {
  constructor(private readonly validation: GatewayValidationService) {}

  @Post('validate')
  validate(@Body() body: { api_key?: string; service_slug?: string; method?: string; path?: string }) {
    if (!body.api_key || !body.service_slug) {
      throw new BadRequestException('api_key and service_slug are required');
    }
    return this.validation.validate({
      api_key: body.api_key,
      service_slug: body.service_slug,
      method: body.method,
      path: body.path,
    });
  }

  @Post('lookup')
  lookup(@Body() body: { api_key?: string }) {
    if (!body.api_key) {
      throw new BadRequestException('api_key is required');
    }
    return this.validation.lookup(body.api_key);
  }
}
