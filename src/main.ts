import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // CORS 설정
  app.enableCors({
    origin: [
      'http://localhost:3030',
      'http://localhost:5173',
      'https://dsign.zigdding.com',
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  await app.init();
  return app.getHttpAdapter().getInstance();
}

// 서버리스 함수로 export
export default async (req: any, res: any) => {
  const server = await bootstrap();
  return server(req, res);
};

// 로컬 개발용
if (require.main === module) {
  NestFactory.create(AppModule).then((app) => {
    app.listen(process.env.PORT ?? 3000);
  });
}
