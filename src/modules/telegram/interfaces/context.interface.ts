import { Scenes } from 'telegraf';

export interface BotSession extends Scenes.WizardSession<Scenes.WizardSessionData> {
  userId?: number;
  userName?: string;
  userEmail?: string;
  mode?: 'edit_name' | 'edit_email';
  isAuth?: boolean;
  topUpAmount?: number;
}

export interface BotContext extends Scenes.WizardContext {
  session: BotSession;
}
