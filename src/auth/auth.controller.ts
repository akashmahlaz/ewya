import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';
import { GoogleAuthDto, AuthResponseDto } from './dto/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('google')
  async googleAuth(@Body() googleAuthDto: GoogleAuthDto): Promise<AuthResponseDto> {
    return this.authService.googleLogin(googleAuthDto.idToken);
  }
}
