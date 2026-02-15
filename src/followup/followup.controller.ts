import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { FollowUpService } from './followup.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  GenerateFollowUpDto,
  FollowUpResponseDto,
  BatchFollowUpDto,
  BatchFollowUpResponseDto,
} from './dto/followup.dto';

@Controller('followup')
@UseGuards(JwtAuthGuard)
export class FollowUpController {
  constructor(private followUpService: FollowUpService) {}

  @Post('generate')
  async generateFollowUp(
    @Request() req,
    @Body() generateFollowUpDto: GenerateFollowUpDto,
  ): Promise<FollowUpResponseDto> {
    return this.followUpService.generateFollowUp(req.user.userId, generateFollowUpDto);
  }

  @Post('batch')
  async batchFollowUp(
    @Request() req,
    @Body() batchDto: BatchFollowUpDto,
  ): Promise<BatchFollowUpResponseDto> {
    return this.followUpService.generateBatchFollowUp(req.user.userId, batchDto);
  }
}
