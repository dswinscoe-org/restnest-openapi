# Local Secrets Manager

The `secrets.js` looks up secrets locally. This is done by default unless otherwise configured in the following setup scripts, depending on pipeline/local run context.

See the following for local secret implementation details:

- `openapi/postman/scripts/openAPISetupPostman.js`
- `scripts/newman/restnest-e2e-sync-scenario-suite.js`
- `scripts/restnest-postman-sync-repo.js`

NOTE: By default, local secrets are maintained here (not managed in git):

- `restnest-postman/environments/restnest-secrets.postman_globals.json`
- `openapi/postman/environment/restnest-secrets.postman_globals.json`

The respectve `**/*.base.json` files determine expected keys, and are copied to above files on setup
