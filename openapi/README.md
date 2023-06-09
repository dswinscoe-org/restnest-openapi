# Third-party API repository

Downloaded third-party OpenAPI specs (json/yaml) are maintained here to provide the artifacts to create RESTNEST service collections for use in E2E tests.

The ```postman``` folder is integrated from the ```restnest-postman-template``` (See Azure Repo), and provides the functionality to transform openAPI to Postman collections, complete with JSON schema, and upload to Postman ```restnest-postman``` Workspace for use in RESTNEST Scenario tests - see ```restnest-e2e```.

Recognized servers are PROD, SANDBOX, DEV, STAGING so OpenAPI server descriptions should could contain the appropriate key.

Secrets, i.e. apiKey OAuth Bearer Token credentials, etc., are expected to be maintained in GCP secret manager, and a service project configuration is required in ```./postman/package.json``` "restnest:openAPISetupPostman:local" script.