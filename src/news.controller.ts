import { Controller, Get } from '@nestjs/common';
import { NewsService } from './news.service';

@Controller('news')
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  @Get()
  async getNews(): Promise<any[]> {
    // MongoDB에서 뉴스 가져오기 (없으면 API 호출)
    return await this.newsService.getNewsFromMongoDB();
  }

  // 수동으로 뉴스 갱신
  @Get('refresh')
  async refreshNews(): Promise<any[]> {
    return await this.newsService.refreshNews();
  }

  // 서비스 상태 확인
  @Get('status')
  async getStatus() {
    return {
      message: '뉴스 서비스 상태',
      timestamp: new Date(),
      mongodb: 'MongoDB 연결 상태는 로그에서 확인하세요',
    };
  }
}
