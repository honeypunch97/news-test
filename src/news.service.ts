import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class NewsService {
  private readonly logger = new Logger(NewsService.name);
  private newsData: any[] = [];
  private lastUpdated: Date | null = null;
  private readonly CACHE_DURATION_MS = 60 * 60 * 1000; // 1시간

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

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

      // 메모리에 저장 및 시간 업데이트
      this.newsData = newsData;
      this.lastUpdated = new Date();

      this.logger.log(
        `📊 네이버 뉴스 ${newsData.length}건 수집 완료 (${this.lastUpdated.toLocaleString()})`,
      );

      return newsData;
    } catch (error) {
      this.logger.error('❌ 네이버 뉴스 API 호출 실패:', error.message);
      return [];
    }
  }

  // 뉴스 가져오기 (캐시 확인 후 필요시 갱신)
  async getNews(): Promise<any[]> {
    const now = new Date();

    // 데이터가 없거나 1시간 이상 지났는지 확인
    const needsUpdate =
      !this.lastUpdated ||
      this.newsData.length === 0 ||
      now.getTime() - this.lastUpdated.getTime() >= this.CACHE_DURATION_MS;

    if (needsUpdate) {
      if (!this.lastUpdated) {
        this.logger.log('🆕 첫 번째 뉴스 데이터 수집');
      } else {
        const timeDiff = Math.round(
          (now.getTime() - this.lastUpdated.getTime()) / (1000 * 60),
        );
        this.logger.log(`🔄 캐시 만료 (${timeDiff}분 경과) - 뉴스 데이터 갱신`);
      }

      await this.fetchNaverNews();
    } else {
      const timeDiff = Math.round(
        (now.getTime() - this.lastUpdated.getTime()) / (1000 * 60),
      );
      this.logger.log(
        `⚡ 캐시된 뉴스 반환 (${timeDiff}분 전 수집, ${this.newsData.length}건)`,
      );
    }

    return this.newsData;
  }

  // 수동으로 뉴스 갱신
  async refreshNews(): Promise<any[]> {
    this.logger.log('🔄 뉴스 수동 갱신 시작');
    return await this.fetchNaverNews();
  }

  // 캐시 상태 확인
  getCacheStatus() {
    if (!this.lastUpdated) {
      return {
        hasData: false,
        lastUpdated: null,
        newsCount: 0,
        cacheAge: 0,
        needsUpdate: true,
      };
    }

    const now = new Date();
    const lastUpdatedTime = this.lastUpdated!;
    const cacheAge = Math.round(
      (now.getTime() - lastUpdatedTime.getTime()) / (1000 * 60),
    );
    const needsUpdate = cacheAge >= 60; // 60분

    return {
      hasData: this.newsData.length > 0,
      lastUpdated: lastUpdatedTime.toLocaleString(),
      newsCount: this.newsData.length,
      cacheAge: `${cacheAge}분`,
      needsUpdate,
    };
  }
}
