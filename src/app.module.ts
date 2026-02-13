import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ContactsModule } from './contacts/contacts.module';
import { SearchModule } from './search/search.module';
import { FollowUpModule } from './followup/followup.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI'),
      }),
      inject: [ConfigService],
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => [
        {
          ttl: configService.get<number>('RATE_LIMIT_TTL') || 60,
          limit: configService.get<number>('RATE_LIMIT_MAX') || 100,
        },
      ],
      inject: [ConfigService],
    }),
    AuthModule,
    UsersModule,
    ContactsModule,
    SearchModule,
    FollowUpModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
