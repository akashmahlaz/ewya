import { Controller, Post, Body, Logger } from '@nestjs/common';
import { AuthService } from './auth.service';
import { GoogleAuthDto, AuthResponseDto } from './dto/auth.dto';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private authService: AuthService) {}

  @Post('google')
  async googleAuth(@Body() googleAuthDto: GoogleAuthDto): Promise<AuthResponseDto> {
    this.logger.log(`Google auth request received. idToken length: ${googleAuthDto.idToken?.length || 0}`);
    this.logger.log(`idToken starts with: ${googleAuthDto.idToken?.substring(0, 30)}...`);
    try {
      const result = await this.authService.googleLogin(googleAuthDto.idToken);
      this.logger.log(`Auth success for user: ${result.user.email}`);
      return result;
    } catch (error) {
      this.logger.error(`Auth failed: ${error.message}`, error.stack);
      throw error;
    }
  }
}
