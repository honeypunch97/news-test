import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
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

  // 서버 시작시 뉴스 가져오기 (서버리스에서는 생략)
  async onModuleInit() {
    this.logger.log('🚀 뉴스 서비스 초기화 시작');
    // 서버리스 환경에서는 초기 뉴스 수집 생략
    // await this.fetchNaverNews();
  }

  // 네이버 뉴스 API 호출 (병렬 처리로 최적화)
  async fetchNaverNews() {
    this.logger.log('🕐 네이버 뉴스 API 호출 시작');
    const category = ['한국', '속보', '특보', '사회', 'IT'];

    const clientId = this.configService.get('NAVER_CLIENT_ID');
    const clientSecret = this.configService.get('NAVER_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      this.logger.error('❌ 네이버 API 키가 설정되지 않았습니다.');
      return [];
    }

    try {
      // 병렬로 모든 카테고리 API 호출
      this.logger.log(
        `📡 ${category.length}개 카테고리 뉴스 병렬 수집 시작...`,
      );

      const promises = category.map((item) =>
        firstValueFrom(
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
              timeout: 5000, // 5초 타임아웃
            },
          ),
        ),
      );

      const responses = await Promise.all(promises);
      const newsData = responses.flatMap((response) => response.data.items);

      this.newsData = newsData;
      this.logger.log(`📊 네이버 뉴스 ${this.newsData.length}건 수집 완료`);

      // MongoDB에 뉴스 데이터 저장 (비동기로 처리)
      this.saveNewsToMongoDB(newsData).catch((error) =>
        this.logger.error('❌ 백그라운드 MongoDB 저장 실패:', error.message),
      );

      return newsData;
    } catch (error) {
      this.logger.error('❌ 네이버 뉴스 API 호출 실패:', error.message);
      return [];
    }
  }

  // MongoDB에 뉴스 데이터 저장 (최신 50개만 유지)
  private async saveNewsToMongoDB(newsData: any[]) {
    try {
      const db = this.mongoDbService.getDatabase();
      if (!db) {
        this.logger.warn('⚠️ MongoDB 연결이 없어 뉴스 저장을 건너뜁니다.');
        return;
      }

      const collection = db.collection('news');

      // 새 뉴스 데이터 저장
      if (newsData.length > 0) {
        const newsWithTimestamp = newsData.map((news) => ({
          ...news,
          createdAt: new Date(),
          updatedAt: new Date(),
        }));

        // 기존 데이터 삭제 후 새 데이터 추가
        await collection.deleteMany({});
        await collection.insertMany(newsWithTimestamp);

        this.logger.log(`💾 MongoDB에 뉴스 ${newsData.length}건 저장 완료`);
      }
    } catch (error) {
      this.logger.error('❌ MongoDB 뉴스 저장 실패:', error.message);
    }
  }

  // MongoDB에서 뉴스 가져오기 (빠른 응답을 위해 최적화)
  async getNewsFromMongoDB(): Promise<any[]> {
    try {
      // MongoDB 연결 대기 시간 단축 (3초)
      const isConnected = await this.waitForMongoConnection(3);

      if (!isConnected) {
        this.logger.warn('⚠️ MongoDB 연결 실패. 바로 네이버 API 호출합니다.');
        return await this.fetchNaverNews();
      }

      const db = this.mongoDbService.getDatabase();
      if (!db) {
        this.logger.warn(
          '⚠️ MongoDB 연결이 없습니다. 새로운 뉴스를 가져옵니다.',
        );
        return await this.fetchNaverNews();
      }

      // MongoDB 조회 타임아웃 설정
      const collection = db.collection('news');
      const news = await collection.find({}).maxTimeMS(3000).toArray(); // 3초 타임아웃

      this.logger.log(`📖 MongoDB에서 뉴스 ${news.length}건 조회`);

      // MongoDB에 데이터가 없으면 새로 가져오기
      if (news.length === 0) {
        this.logger.log(
          '📭 MongoDB에 뉴스가 없습니다. 새로운 뉴스를 가져옵니다.',
        );
        return await this.fetchNaverNews();
      }

      return news;
    } catch (error) {
      this.logger.error('❌ MongoDB 뉴스 조회 실패:', error.message);
      // 실패시 새로운 뉴스 가져오기
      return await this.fetchNaverNews();
    }
  }

  // MongoDB 연결 대기 (시간 단축)
  private async waitForMongoConnection(
    maxSeconds: number = 3,
  ): Promise<boolean> {
    this.logger.log(`⏳ MongoDB 연결 확인 중... (최대 ${maxSeconds}초)`);
    let attempts = 0;
    const maxAttempts = maxSeconds;

    while (!this.mongoDbService.isMongoConnected() && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 1000)); // 1초 대기
      attempts++;
    }

    if (this.mongoDbService.isMongoConnected()) {
      this.logger.log('✅ MongoDB 연결 확인 완료');
      return true;
    } else {
      this.logger.warn(`⚠️ MongoDB 연결 대기 시간 초과 (${maxSeconds}초)`);
      return false;
    }
  }

  // 수동으로 뉴스 갱신
  async refreshNews(): Promise<any[]> {
    this.logger.log('🔄 뉴스 수동 갱신 시작');
    return await this.fetchNaverNews();
  }

  getNews(): any[] {
    return this.newsData;
  }
}
