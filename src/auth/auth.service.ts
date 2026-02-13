import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { AuthResponseDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  private googleClient: OAuth2Client;

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private usersService: UsersService,
  ) {
    this.googleClient = new OAuth2Client(
      this.configService.get('GOOGLE_CLIENT_ID'),
    );
  }

  async googleLogin(idToken: string): Promise<AuthResponseDto> {
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: this.configService.get('GOOGLE_CLIENT_ID'),
      });

      const payload = ticket.getPayload();
      if (!payload) {
        throw new UnauthorizedException('Invalid Google token');
      }

      const { sub: googleId, email, name, picture } = payload;

      const user = await this.usersService.updateOrCreate(googleId, {
        googleId,
        email,
        name,
        photoUrl: picture,
      });

      const accessToken = this.jwtService.sign({
        sub: user._id.toString(),
        email: user.email,
      });

      return {
        accessToken,
        user: {
          id: user._id.toString(),
          email: user.email,
          name: user.name,
          photoUrl: user.photoUrl,
          subscriptionTier: user.subscriptionTier,
        },
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid Google authentication');
    }
  }

  async validateUser(userId: string): Promise<any> {
    return this.usersService.findById(userId);
  }
}
