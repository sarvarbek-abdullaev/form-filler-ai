import { Scenes } from 'telegraf';

export interface BotSession extends Scenes.WizardSession<Scenes.WizardSessionData> {
  userId?: number;
  phone?: string;
  name?: string;
  mode?: 'edit_name' | 'edit_email';
  isAuth?: boolean;
  topUpAmount?: number;
  jobName?: string;
  jobEntries?: number;
  jobFormUrl?: string;
  jobIsMultiPage?: boolean;
}

export interface BotContext extends Scenes.WizardContext {
  session: BotSession;
}
