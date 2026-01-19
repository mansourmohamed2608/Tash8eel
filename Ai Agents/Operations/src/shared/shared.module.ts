import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AdminApiKeyGuard } from './guards/admin-api-key.guard';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [AdminApiKeyGuard, ConfigService],
  exports: [AdminApiKeyGuard, ConfigService],
})
export class SharedModule {}
