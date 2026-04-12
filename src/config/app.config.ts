import * as Joi from 'joi';
import { AppConfig } from './app.config.interface';

export const validationSchema = Joi.object({
  PORT: Joi.number().default(3000),
  TELEGRAM_BOT_TOKEN: Joi.string().required(),
});

export default (): AppConfig => ({
  port: parseInt(process.env.PORT || '3000', 10),
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
});
