import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

function setupSwagger(app: NestExpressApplication) {
  const config = new DocumentBuilder()
    .setTitle('Form Filler AI')
    .setVersion('1.0')
    .addTag('google gemini')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('/', app, document);
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  setupSwagger(app);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
