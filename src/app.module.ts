import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { NewsController } from './news.controller';
import { NewsService } from './news.service';
import { MongoDbService } from './database/mongodb.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    HttpModule,
  ],
  controllers: [AppController, NewsController],
  providers: [AppService, NewsService, MongoDbService],
})
export class AppModule {}
