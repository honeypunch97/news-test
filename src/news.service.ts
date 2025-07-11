import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { createClient } from 'redis';

@Injectable()
export class NewsService {
  private readonly logger = new Logger(NewsService.name);
  private readonly CACHE_DURATION_SECONDS = 30 * 60; // 30분
  private readonly CACHE_KEY = 'news-data';
  private redis: any;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  // Redis 클라이언트 연결 (필요시 생성)
  private async getRedisClient() {
    if (!this.redis) {
      try {
        this.redis = createClient({
          url: this.configService.get('REDIS_URL') || undefined,
        });
        await this.redis.connect();
        this.logger.log('✅ Redis 클라이언트 연결 성공');
      } catch (error) {
        this.logger.error('❌ Redis 클라이언트 연결 실패:', error.message);
        throw error;
      }
    }
    return this.redis;
  }

  // 네이버 뉴스 API 호출 (병렬 처리)
  async fetchNaverNews(): Promise<any[]> {
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

      const cacheData = {
        news: newsData,
        lastUpdated: new Date().toISOString(),
        count: newsData.length,
      };

      // Redis에 캐시 저장 (30분)
      try {
        const redis = await this.getRedisClient();
        await redis.setEx(
          this.CACHE_KEY,
          this.CACHE_DURATION_SECONDS,
          JSON.stringify(cacheData),
        );
        this.logger.log(
          `📊 네이버 뉴스 ${newsData.length}건 수집 완료 → Redis 캐시 저장`,
        );
      } catch (redisError) {
        this.logger.error('❌ Redis 캐시 저장 실패:', redisError.message);
      }

      return newsData;
    } catch (error) {
      this.logger.error('❌ 네이버 뉴스 API 호출 실패:', error.message);
      return [];
    }
  }

  // 뉴스 가져오기 (Redis 캐시 확인 후 필요시 갱신)
  async getNews(): Promise<any[]> {
    try {
      // Redis에서 캐시 확인
      const redis = await this.getRedisClient();
      const cachedDataString = await redis.get(this.CACHE_KEY);

      if (cachedDataString) {
        const cachedData = JSON.parse(cachedDataString);

        if (cachedData && cachedData.news) {
          const lastUpdated = new Date(cachedData.lastUpdated);
          const now = new Date();
          const timeDiff = Math.round(
            (now.getTime() - lastUpdated.getTime()) / (1000 * 60),
          );

          this.logger.log(
            `⚡ Redis 캐시에서 뉴스 반환 (${timeDiff}분 전 수집, ${cachedData.count}건)`,
          );
          return cachedData.news;
        }
      }

      this.logger.log('🆕 Redis 캐시 없음 - 새로운 뉴스 데이터 수집');
      return await this.fetchNaverNews();
    } catch (error) {
      this.logger.error('❌ Redis 캐시 확인 실패:', error.message);
      this.logger.log('🔄 캐시 실패로 인한 API 직접 호출');
      return await this.fetchNaverNews();
    }
  }

  // 수동으로 뉴스 갱신
  async refreshNews(): Promise<any[]> {
    this.logger.log('🔄 뉴스 수동 갱신 시작 - 캐시 무시하고 새로 가져오기');
    return await this.fetchNaverNews();
  }

  // 캐시 상태 확인
  async getCacheStatus() {
    try {
      const redis = await this.getRedisClient();
      const cachedDataString = await redis.get(this.CACHE_KEY);

      if (!cachedDataString) {
        return {
          hasCache: false,
          lastUpdated: null,
          newsCount: 0,
          cacheAge: null,
          needsUpdate: true,
        };
      }

      const cachedData = JSON.parse(cachedDataString);
      const lastUpdated = new Date(cachedData.lastUpdated);
      const now = new Date();
      const cacheAge = Math.round(
        (now.getTime() - lastUpdated.getTime()) / (1000 * 60),
      );
      const needsUpdate = cacheAge >= 30; // 30분

      return {
        hasCache: true,
        lastUpdated: lastUpdated.toLocaleString(),
        newsCount: cachedData.count,
        cacheAge: `${cacheAge}분`,
        needsUpdate,
      };
    } catch (error) {
      this.logger.error('❌ Redis 캐시 상태 확인 실패:', error.message);
      return {
        hasCache: false,
        error: error.message,
        needsUpdate: true,
      };
    }
  }
}
