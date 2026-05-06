import { Body, Controller, Get, Post, UnauthorizedException, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/types';
import { PrismaService } from '../prisma.service';
import { MeService } from './me.service';

@Controller('v1/me')
export class MeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly me: MeService,
  ) {}

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

  @UseGuards(AuthGuard)
  @Post('change-password')
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { current_password?: string; new_password?: string },
  ) {
    if (!body.current_password || !body.new_password) {
      return { ok: false, error: 'current_password and new_password are required' };
    }
    return this.me.changePassword(user.id, body.current_password, body.new_password);
  }

  @UseGuards(AuthGuard)
  @Post('profile')
  async updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { display_name?: string },
  ) {
    if (!body.display_name) {
      return { ok: false, error: 'display_name is required' };
    }
    return this.me.updateProfile(user.id, body.display_name);
  }
}
