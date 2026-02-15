import { Controller, Get, Put, Body, UseGuards, Request, NotFoundException } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  photoUrl?: string;
}

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('me')
  async getProfile(@Request() req): Promise<any> {
    const user = await this.usersService.findById(req.user.userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      photoUrl: user.photoUrl,
      subscriptionTier: user.subscriptionTier,
      apiCallsCount: user.apiCallsCount,
      lastApiCall: user.lastApiCall,
      isActive: user.isActive,
    };
  }

  @Put('me')
  async updateProfile(@Request() req, @Body() body: UpdateProfileDto): Promise<any> {
    const user = await this.usersService.findById(req.user.userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (body.name) user.name = body.name;
    if (body.photoUrl) user.photoUrl = body.photoUrl;

    const updated = await user.save();
    return {
      id: updated._id.toString(),
      email: updated.email,
      name: updated.name,
      photoUrl: updated.photoUrl,
      subscriptionTier: updated.subscriptionTier,
    };
  }

  @Get('me/stats')
  async getStats(@Request() req): Promise<any> {
    const stats = await this.usersService.getApiCallStats(req.user.userId);
    return stats;
  }
}
