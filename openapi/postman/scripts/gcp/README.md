# Google Cloud Platform - Secret Manager

The `postmanApiKeyCheck.js` looks up secrets in GCP Secret Manager. Additional cloud platforms, ie. Azure Key Vault, can also be easily intergatted for use in setup scripts.

See the following for implementation details:

- openapi/postman/scripts/openAPISetupPostman.js
- scripts/newman/restnest-e2e-sync-scenario-suite.js
- scripts/restnest-postman-sync-repo.js

NOTE: By default, local secrets are maintained here (not managed in git):

- `restnest-postman/environments/restnest-secrets.postman_globals.json`
- `openapi/postman/environment/restnest-secrets.postman_globals.json`

The respectve `**/*.base.json` files determine expected keys, and are copied to above files on setup
