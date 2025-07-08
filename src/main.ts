import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

let app: any;

async function getApp() {
  if (!app) {
    app = await NestFactory.create(AppModule);
    await app.init();
  }
  return app;
}

// CommonJS 방식으로 export
module.exports = async (req: any, res: any) => {
  const nestApp = await getApp();
  return nestApp.getHttpAdapter().getInstance()(req, res);
};

// 로컬 개발용
if (require.main === module) {
  NestFactory.create(AppModule).then((app) => {
    app.listen(process.env.PORT ?? 3000);
  });
}
