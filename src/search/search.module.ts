import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SearchHistory, SearchHistorySchema } from '../schemas/search-history.schema';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';
import { UsersModule } from '../users/users.module';
import { ContactsModule } from '../contacts/contacts.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SearchHistory.name, schema: SearchHistorySchema },
    ]),
    UsersModule,
    ContactsModule,
  ],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
