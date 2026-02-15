import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
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
    const logger = new Logger('AuthService');
    logger.log(`googleLogin called, idToken length: ${idToken?.length}`);
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: this.configService.get('GOOGLE_CLIENT_ID'),
      });
      logger.log('Token verified successfully');

      const payload = ticket.getPayload();
      if (!payload) {
        throw new UnauthorizedException('Invalid Google token');
      }

      const { sub: googleId, email, name, picture } = payload;
      logger.log(`Google user: ${email}, googleId: ${googleId}`);

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
      logger.error(`Google auth error: ${error.message}`);
      logger.error(`Error details: ${JSON.stringify(error.response?.data || error)}`);
      throw new UnauthorizedException(`Invalid Google authentication: ${error.message}`);
    }
  }

  async validateUser(userId: string): Promise<any> {
    return this.usersService.findById(userId);
  }
}
