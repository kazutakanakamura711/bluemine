import { ValidationPipe } from '@nestjs/common';
import { config } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { fileURLToPath } from 'node:url';
import { AppModule } from './app.module.js';

config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true, //リクエストJSONをDTOクラスとして扱えるようにする
      whitelist: true, //DTOクラスに定義されていないプロパティは無視する
      forbidNonWhitelisted: true, //DTOクラスに定義されていないプロパティがある場合は400エラーを返す
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Bluemine API')
    .setDescription('Bluemine の REST API 仕様')
    .setVersion('1.0')
    .addTag('Health')
    .addTag('Projects')
    .addTag('Auth')
    // Swagger の Authorize から Supabase の access token を渡せるようにする。
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description:
        'Supabase Auth から取得した access_token の値を入力してください（Bearer の接頭辞は不要です）。',
    })
    .build();
  const documentFactory = () =>
    SwaggerModule.createDocument(app, swaggerConfig);

  // useGlobalPrefix により Swagger UI は /api/docs で公開される。
  SwaggerModule.setup('docs', app, documentFactory, {
    useGlobalPrefix: true,
  });

  await app.listen(process.env.API_PORT ?? 3001);
}
await bootstrap();
