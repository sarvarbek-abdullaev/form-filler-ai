import { Context, Scenes } from 'telegraf';

export interface AppSession extends Scenes.WizardSessionData {
  userName?: string;
  userEmail?: string;
  mode?: 'edit_name' | 'edit_email';
  isAuth?: boolean;
}

export interface AppContext extends Context {
  scene: Scenes.SceneContextScene<AppContext, AppSession>;
  wizard: Scenes.WizardContextWizard<AppContext>;
}
