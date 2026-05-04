import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { PrismaService } from '../prisma.service';

@UseGuards(AuthGuard)
@Controller('v1/audit-logs')
export class AuditLogController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list() {
    const rows = await this.prisma.auditLog.findMany({
      take: 100,
      orderBy: { createdAt: 'desc' },
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        organization_id: row.organizationId,
        actor_user_id: row.actorUserId,
        action: row.action,
        target_type: row.targetType,
        target_id: row.targetId,
        metadata: row.metadata,
        created_at: row.createdAt.toISOString(),
      })),
    };
  }
}
