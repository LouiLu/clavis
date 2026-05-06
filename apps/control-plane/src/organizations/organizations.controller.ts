import { BadRequestException, Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { MembershipRole, RecordStatus } from '@prisma/client';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/types';
import { CreateMemberInput, OrganizationsService, UpdateMemberInput } from './organizations.service';

const membershipRoles: MembershipRole[] = ['platform_admin', 'org_admin', 'service_admin', 'developer', 'viewer'];
const recordStatuses: RecordStatus[] = ['active', 'disabled'];

@UseGuards(AuthGuard)
@Controller('v1/organizations')
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    const organizations = await this.organizations.listForUser(user.id);
    return {
      items: organizations.map((organization) => ({
        id: organization.id,
        name: organization.name,
        organization_type: organization.organizationType,
        status: organization.status,
        members: organization.memberships.map((membership) => this.serializeMembership(membership)),
      })),
    };
  }

  @Get(':organizationId/members')
  async listMembers(@Param('organizationId') organizationId: string) {
    const members = await this.organizations.listMembers(organizationId);
    return { items: members.map((membership) => this.serializeMembership(membership)) };
  }

  @Post(':organizationId/members')
  async createMember(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: Partial<CreateMemberInput>,
  ) {
    if (!body.email || !body.display_name || !body.password || !body.role) {
      throw new BadRequestException('email, display_name, password, and role are required');
    }
    if (!membershipRoles.includes(body.role)) {
      throw new BadRequestException('role is invalid');
    }
    const membership = await this.organizations.createMember(organizationId, user.id, {
      email: body.email,
      display_name: body.display_name,
      password: body.password,
      role: body.role,
    });
    return this.serializeMembership(membership);
  }

  @Patch(':organizationId/members/:memberId')
  async updateMember(
    @Param('organizationId') organizationId: string,
    @Param('memberId') memberId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: Partial<UpdateMemberInput>,
  ) {
    if (body.role !== undefined && !membershipRoles.includes(body.role)) {
      throw new BadRequestException('role is invalid');
    }
    if (body.status !== undefined && !recordStatuses.includes(body.status)) {
      throw new BadRequestException('status is invalid');
    }
    const membership = await this.organizations.updateMember(organizationId, memberId, user.id, {
      role: body.role,
      status: body.status,
    });
    return this.serializeMembership(membership);
  }

  private serializeMembership(membership: {
    id: string;
    role: MembershipRole;
    status: RecordStatus;
    user: { id: string; email: string; displayName: string; status: string };
  }) {
    return {
      id: membership.id,
      role: membership.role,
      status: membership.status,
      user: {
        id: membership.user.id,
        email: membership.user.email,
        display_name: membership.user.displayName,
        status: membership.user.status,
      },
    };
  }
}
