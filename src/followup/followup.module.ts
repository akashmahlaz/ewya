import { Module } from '@nestjs/common';
import { FollowUpService } from './followup.service';
import { FollowUpController } from './followup.controller';
import { ContactsModule } from '../contacts/contacts.module';

@Module({
  imports: [ContactsModule],
  controllers: [FollowUpController],
  providers: [FollowUpService],
})
export class FollowUpModule {}
