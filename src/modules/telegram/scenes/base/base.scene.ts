import { Ctx, Message, Next, On, Start } from 'nestjs-telegraf';
import { SCENES } from '../../config';

import type { BotContext } from '../../interfaces';

export abstract class BaseScene {
  async onStart(ctx: BotContext) {
    await ctx.scene.enter(ctx.session.userId ? SCENES.DASHBOARD : SCENES.AUTH);
  }

  @Start()
  async start(ctx: BotContext) {
    await this.onStart(ctx);
  }

  @On('text')
  async onBaseText(
    @Ctx() ctx: BotContext,
    @Message('text') text: string,
    @Next() next: () => Promise<void>,
  ) {
    if (text === '/restart') {
      return this.onStart(ctx);
    }

    return next();
  }
}
