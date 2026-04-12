import { MiddlewareFn } from 'telegraf';
import { AppContext } from '../telegram.context';

const AUTH_SCENE_ID = 'AUTH_SCENE';

export const authGuard: MiddlewareFn<AppContext> = async (ctx, next) => {
  const isAuth = Boolean(ctx.scene.session?.isAuth);

  // Scene might be undefined in some updates
  const currentSceneId = ctx.scene?.current?.id;

  // Allow access to auth scene
  if (!isAuth && currentSceneId !== AUTH_SCENE_ID) {
    await ctx.reply('🔐 Please authenticate first');
    return ctx.scene.enter(AUTH_SCENE_ID);
  }

  return next();
};
