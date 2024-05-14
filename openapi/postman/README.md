# Postman OpenAPI Publishing

See `package.json` for all available scripts:

- `yarn restnest:generate` for complete publish process
  - download, dereference and transform OpenAPI specs to Postman collection/env and upload to `Postman Repo`
- `yarn restnest:generate-openapi` to dereference all specs in config folder to generated-specs folder
- `yarn restnest:openAPISetupPostman:local` to generate Postman Repo artefacts locally for a single service
  - See `restnest:openAPISetupPostman:local` for the diverse configuration parameters, i.e. workspaceId, etc.
- ...

**Expected folder structure :**

- openapi (see folder configuration parameter above)
  - config (source specs, as json or yaml)
  - generated-specs (de-referenced specs - see see folder configuration parameter above)
  - postman (**template** - see NOTE below)
    - collection (ServicePublish Collection and evtl. generated service collection)
    - environment (Postman globals for publish - apikey retrieved via gcp)
    - pipeline (yaml)
    - scripts (collection generation and Newman publish)
    - package.json, ...

`scripts/openAPISetupPostman.js` is configured to read source OpenAPI specs and schemas from configured `generatedSpec` folder, and auto-generates the `collection/*.postman_collection.json` and `environment/restnest-postman.postman_globals.json` files for publish.

All schemas are written in the above Postman collection as collection variables and published, along with the service environments (DEV, SANDBOX, etc.) to the Postman restnest-postman workspace via Newman, using naming convention `[serviceName]-<timestamp-commithash>`.

Once published, the service may be forked along with all other RESTNEST-capable services, for use in multi-service test scenarios in the Postman restnest-e2e workspace.

IMPORTANT: Pre-requisite for openAPISetupPostman.js is the availability of de-referenced OpenAPI specs, complete with request and response schema in YAML format. See scripts `generate-swagger-parser.js`

NOTE: This folder can also be copied to a "postman" sub-directory of a service repo's "openapi" source folder. Root folder configuration required, e.g. default `--openApiFolder '../../../openapi/'` in `yarn restnest:openAPISetupPostman:local:*` call, relative to script `openapi/postman/scripts/openAPISetupPostman.js`.
