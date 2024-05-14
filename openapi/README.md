# Third-party API repository

Downloaded third-party OpenAPI specs (json/yaml) are maintained here to provide the artifacts to create RESTNEST service collections for use in E2E tests.

The `postman` folder, which can also be copied to an OpenAPI-based, mono-repo service, provides the functionality to transform openAPI to Postman collections, complete with JSON schema, and upload to Postman `restnest-postman` Workspace for use in RESTNEST Scenario tests - see `restnest-e2e`.

Recognized servers are PROD, SANDBOX, DEV, STAGING so OpenAPI server descriptions must contain the appropriate key, as well as text identifying authorization, i.e. apikey, oauth.

Secrets, i.e. apiKey OAuth Bearer Token credentials, etc., are initially prompted or retrieved from a secret manager (see scripts/gcp) for local storage (see openapi/postman/environment/restnest-secrets.postman_globals.base.json) and saved in the generated Postman environments.

Additional service project configuration is required in `./postman/package.json` "restnest:openAPISetupPostman:local" script.
