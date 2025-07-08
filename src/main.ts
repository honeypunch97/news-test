import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.init();
  return app.getHttpAdapter().getInstance();
}

// 서버리스 함수로 export
export default async (req: any, res: any) => {
  const server = await bootstrap();
  return server(req, res);
};
