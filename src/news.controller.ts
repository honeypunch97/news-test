import { Controller, Get } from '@nestjs/common';
import { NewsService } from './news.service';

@Controller('news')
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  @Get()
  async getNews(): Promise<any[]> {
    // 메모리에서 뉴스 가져오기 (캐시 확인 후 필요시 갱신)
    return await this.newsService.getNews();
  }

  // 수동으로 뉴스 갱신
  @Get('refresh')
  async refreshNews(): Promise<any[]> {
    return await this.newsService.refreshNews();
  }

  // 캐시 상태 확인
  @Get('status')
  async getStatus() {
    return {
      service: '메모리 기반 뉴스 서비스',
      cache: this.newsService.getCacheStatus(),
      timestamp: new Date().toLocaleString(),
    };
  }
}
