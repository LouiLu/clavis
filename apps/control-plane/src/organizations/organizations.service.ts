import { Injectable, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { MembershipRole, RecordStatus } from '@prisma/client';
import { PrismaService } from '../prisma.service';

export interface CreateMemberInput {
  email: string;
  display_name: string;
  role: MembershipRole;
  password: string;
}

export interface UpdateMemberInput {
  role?: MembershipRole;
  status?: RecordStatus;
}

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  listForUser(userId: string) {
    return this.prisma.organization.findMany({
      where: { memberships: { some: { userId, status: 'active' } } },
      include: { memberships: { include: { user: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  listMembers(organizationId: string) {
    return this.prisma.membership.findMany({
      where: { organizationId },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createMember(organizationId: string, actorUserId: string, input: CreateMemberInput) {
    const organization = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    const passwordHash = await argon2.hash(input.password);
    const user = await this.prisma.user.upsert({
      where: { email: input.email },
      update: {
        displayName: input.display_name,
      },
      create: {
        email: input.email,
        displayName: input.display_name,
        passwordHash,
        userType: 'internal',
        status: 'active',
        identities: {
          create: {
            provider: 'local',
            providerSubject: input.email,
            emailVerified: true,
          },
        },
      },
    });

    const membership = await this.prisma.membership.upsert({
      where: {
        userId_organizationId_role: {
          userId: user.id,
          organizationId,
          role: input.role,
        },
      },
      update: { status: 'active' },
      create: {
        userId: user.id,
        organizationId,
        role: input.role,
        status: 'active',
      },
      include: { user: true },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        action: 'member.created',
        targetType: 'membership',
        targetId: membership.id,
        metadata: { email: user.email, role: membership.role },
      },
    });

    return membership;
  }

  async updateMember(organizationId: string, memberId: string, actorUserId: string, input: UpdateMemberInput) {
    const existing = await this.prisma.membership.findFirst({
      where: { id: memberId, organizationId },
    });
    if (!existing) {
      throw new NotFoundException('Member not found');
    }

    const membership = await this.prisma.membership.update({
      where: { id: memberId },
      data: {
        role: input.role,
        status: input.status,
      },
      include: { user: true },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        action: 'member.updated',
        targetType: 'membership',
        targetId: membership.id,
        metadata: { role: membership.role, status: membership.status },
      },
    });

    return membership;
  }
}
