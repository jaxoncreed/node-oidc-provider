const url = require('url');

const attention = require('../helpers/attention');
const bodyParser = require('../shared/selective_body');
const views = require('../views');
const instance = require('../helpers/weak_cache');
const epochTime = require('../helpers/epoch_time');
const noCache = require('../shared/no_cache');

const parseBody = bodyParser('application/x-www-form-urlencoded');

module.exports = function devInteractions(provider) {
  /* eslint-disable no-multi-str */
  attention.warn('a quick start development-only feature devInteractions is enabled, \
you are expected to disable these interactions and provide your own');
  /* eslint-enable */

  instance(provider).configuration().interactionUrl = async function interactionUrl(ctx) {
    return url.parse(ctx.oidc.urlFor('interaction', { grant: ctx.oidc.uuid })).pathname;
  };

  return {
    get: [
      noCache,
      async function interactionRender(ctx, next) {
        ctx.oidc.uuid = ctx.params.grant;
        const details = await provider.interactionDetails(ctx.req);
        const client = await provider.Client.find(details.params.client_id);
        ctx.assert(client, 400);

        const {
          userCodeInputSource,
          userCodeConfirmSource,
          features: { deviceFlow: { charset } },
        } = instance(provider).configuration();

        const action = url.parse(ctx.oidc.urlFor('submit', { grant: details.uuid })).pathname;
   
        const locals = {
          action,
          client,
          returnTo: details.returnTo,
          params: details.params,
        };

        switch (details.interaction.reason) {
          case 'consent_prompt':
          case 'client_not_authorized':
          case 'native_client_prompt':
            await userCodeConfirmSource(ctx, views.interaction(locals));
            break;
          default:
            await userCodeInputSource(ctx, views.login(locals));
        }

        ctx.type = 'html';

        await next();
      },
    ],
    post: [
      noCache,
      parseBody,
      async function interactionSubmit(ctx, next) {
        ctx.oidc.uuid = ctx.params.grant;
        switch (ctx.oidc.body.view) { // eslint-disable-line default-case
          case 'login':
            await provider.interactionFinished(ctx.req, ctx.res, {
              login: {
                account: ctx.oidc.body.login,
                remember: !!ctx.oidc.body.remember,
                ts: epochTime(),
              },
              consent: {},
            });
            break;
          case 'interaction':
            await provider.interactionFinished(ctx.req, ctx.res, { consent: {} });
            break;
        }

        await next();
      },
    ],
  };
};
