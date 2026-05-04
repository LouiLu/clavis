import { Controller, Get, UnauthorizedException, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/types';
import { PrismaService } from '../prisma.service';

@Controller('v1/me')
export class MeController {
  constructor(private readonly prisma: PrismaService) {}

  @UseGuards(AuthGuard)
  @Get()
  async getMe(@CurrentUser() user: AuthenticatedUser) {
    const record = await this.prisma.user.findUnique({
      where: { id: user.id },
      include: {
        identities: true,
        memberships: { include: { organization: true } },
      },
    });
    if (!record) {
      throw new UnauthorizedException();
    }
    return {
      id: record.id,
      email: record.email,
      display_name: record.displayName,
      user_type: record.userType,
      status: record.status,
      organizations: record.memberships.map((membership) => ({
        id: membership.organization.id,
        name: membership.organization.name,
        role: membership.role,
      })),
    };
  }
}
