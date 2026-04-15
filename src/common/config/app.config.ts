import * as Joi from 'joi';
import { IAppConfig } from '../interfaces';

export const validationSchema = Joi.object({
  PORT: Joi.number().default(3000),
  TELEGRAM_BOT_TOKEN: Joi.string().required(),
  DATABASE_URL: Joi.string().required(),
  ADMIN_GROUP_ID: Joi.number().required(),
  CARD_NUMBER: Joi.string().required(),
  ADMINS: Joi.string().required(),
});

export default (): IAppConfig => ({
  port: parseInt(process.env.PORT || '3000', 10),
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  databaseUrl: process.env.DATABASE_URL || '',
  adminGroupId: process.env.ADMIN_GROUP_ID || '',
  cardNumber: process.env.CARD_NUMBER || '',
  admins: process.env.ADMINS || '',
});
