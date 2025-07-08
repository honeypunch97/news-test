import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Cron, CronExpression } from '@nestjs/schedule';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { MongoDbService } from './database/mongodb.service';

@Injectable()
export class NewsService implements OnModuleInit {
  private readonly logger = new Logger(NewsService.name);
  private newsData: any[] = [];

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly mongoDbService: MongoDbService,
  ) {}

  // 서버 시작시 뉴스 가져오기
  async onModuleInit() {
    this.logger.log('🚀 뉴스 서비스 초기화 시작');

    // MongoDB 연결 대기
    await this.waitForMongoConnection();

    this.logger.log('📰 초기 뉴스 데이터 수집 시작');
    await this.fetchNaverNews();
  }

  // MongoDB 연결 대기
  private async waitForMongoConnection() {
    this.logger.log('⏳ MongoDB 연결 대기 중...');
    let attempts = 0;
    const maxAttempts = 30; // 최대 30초 대기

    while (!this.mongoDbService.isMongoConnected() && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 1000)); // 1초 대기
      attempts++;
    }

    if (this.mongoDbService.isMongoConnected()) {
      this.logger.log('✅ MongoDB 연결 확인 완료');
    } else {
      this.logger.warn(
        '⚠️ MongoDB 연결 대기 시간 초과 - 메모리 모드로 계속 진행',
      );
    }
  }

  // 매 정각마다 실행 (0분 0초)
  @Cron(CronExpression.EVERY_HOUR)
  async fetchNaverNews() {
    this.logger.log('🕐 매 정각마다 네이버 뉴스 API 호출 시작');
    const category = ['한국', '속보', '특보', '사회', 'IT'];

    const clientId = this.configService.get('NAVER_CLIENT_ID');
    const clientSecret = this.configService.get('NAVER_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      this.logger.error('❌ 네이버 API 키가 설정되지 않았습니다.');
      return;
    }

    const newsData: any[] = [];

    try {
      // 네이버 뉴스 API 호출
      for (const item of category) {
        this.logger.log(`📡 "${item}" 카테고리 뉴스 수집 중...`);
        const response: any = await firstValueFrom(
          this.httpService.get(
            'https://openapi.naver.com/v1/search/news.json',
            {
              params: {
                query: item,
                display: 10,
                start: 1,
                sort: 'date',
              },
              headers: {
                'X-Naver-Client-Id': clientId,
                'X-Naver-Client-Secret': clientSecret,
              },
            },
          ),
        );
        newsData.push(...response.data.items);
      }

      this.newsData = newsData;
      this.logger.log(`📊 네이버 뉴스 ${this.newsData.length}건 수집 완료`);

      // MongoDB에 뉴스 데이터 저장
      await this.saveNewsToMongoDB(newsData);
    } catch (error) {
      this.logger.error('❌ 네이버 뉴스 API 호출 실패:', error.message);
    }
  }

  // MongoDB에 뉴스 데이터 저장
  private async saveNewsToMongoDB(newsData: any[]) {
    try {
      const db = this.mongoDbService.getDatabase();
      if (!db) {
        this.logger.warn('⚠️ MongoDB 연결이 없어 뉴스 저장을 건너뜁니다.');
        return;
      }

      const collection = db.collection('news');

      // 기존 뉴스 데이터 삭제 (중복 방지)
      await collection.deleteMany({});

      // 새 뉴스 데이터 저장
      if (newsData.length > 0) {
        const newsWithTimestamp = newsData.map((news) => ({
          ...news,
          createdAt: new Date(),
          updatedAt: new Date(),
        }));

        await collection.insertMany(newsWithTimestamp);
        this.logger.log(`💾 MongoDB에 뉴스 ${newsData.length}건 저장 완료`);
      }
    } catch (error) {
      this.logger.error('❌ MongoDB 뉴스 저장 실패:', error.message);
    }
  }

  // MongoDB에서 뉴스 가져오기
  async getNewsFromMongoDB(): Promise<any[]> {
    try {
      const db = this.mongoDbService.getDatabase();
      if (!db) {
        this.logger.warn(
          '⚠️ MongoDB 연결이 없어 메모리에서 뉴스를 반환합니다.',
        );
        return this.newsData;
      }

      const collection = db.collection('news');
      const news = await collection.find({}).toArray();
      this.logger.log(`📖 MongoDB에서 뉴스 ${news.length}건 조회`);
      return news;
    } catch (error) {
      this.logger.error('❌ MongoDB 뉴스 조회 실패:', error.message);
      return this.newsData; // 실패시 메모리 데이터 반환
    }
  }

  getNews(): any[] {
    return this.newsData;
  }
}
