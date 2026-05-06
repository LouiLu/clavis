import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  record(input: {
    organizationId?: string;
    actorUserId?: string;
    action: string;
    targetType: string;
    targetId: string;
    metadata?: unknown;
  }) {
    return this.prisma.auditLog.create({
      data: {
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        metadata: input.metadata === undefined ? undefined : (input.metadata as object),
      },
    });
  }
}
