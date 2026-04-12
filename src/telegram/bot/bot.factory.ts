import { Telegraf, Scenes, session } from 'telegraf';
import { AppContext } from '../telegram.context';
import { authScene } from '../scenes/auth.scene';
import { dashboardScene } from '../scenes/dashboard.scene';
import { authGuard } from '../middlewares/auth.guard';

export const createBot = (token: string) => {
  const bot = new Telegraf<AppContext>(token);

  const stage = new Scenes.Stage<AppContext>([authScene, dashboardScene]);

  bot.use(session());
  bot.use(stage.middleware());

  bot.start(async (ctx) => {
    if (ctx.scene.session.userEmail) {
      return ctx.scene.enter('DASHBOARD_SCENE');
    }

    return ctx.scene.enter('AUTH_SCENE');
  });

  bot.use(authGuard);

  return bot;
};
