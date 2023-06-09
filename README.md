# RESTNEST-openapi

If you're looking for a Postman Collection Runner alternative, to easily develop and maintain complex, multi-service, E2E user journey tests or FE test data setup and teardown, then you've come to the right place.   

The RESTful Newman Entity Sceanrio Tester for OpenAPI (RESTNEST-openapi) is a data-driven Javascript framework for generating and transforming OpenAPI 3 Specs to JSON Schema and Postman collections for use in complex automated E2E testing sceanrios that run in Postman Runner and Newman, as well as build pipelines. Designed to be easily integrated with any OpenAPI-defined microservice, the framework relies on code generation to reduce the overhead and cost of maintaining E2E tests, which are highly dependent on the contracts defined in OpenAPI. As such, all changes in OpenAPI translate to changes in the underlying generated artifacts, which transparantly indicate breaking changes, making maintenance of existing tests much more manageable.

## Instrumentation

With this data-driven design, the RESTNEST framework provides all the necessary configuration, via Javascript and JSON generation and transformation, for the integration of industry standard API, REST and build tools, to enable creation, and low-cost maintenance of E2E tests of business workflows:   

* Postman - API platform for building and using APIs
    * Collection Runner 
    * Workflow and Chai testing
* Node.js - Javascript runtime for 
    * Express.js - local server, for mocking and coordination
    * Newman - command-line collection runner for Postman 
    * Grunt - JavaScript Task Runner

## Generation Process

Javascript generation scripts, which automatically produce the raw JSON Schema and Postman artifacts, are run during microservice development. These artifacts are further refined in RESTNEST to produce easily-imported Postman Collection and Environments and related Software Control-manageable artifacts that are leveraged in creating JSON-based E2E Testing Sceanrios:

```OpenAPI -> Javscript Generator -> collections/environments uploaded to restnest-postman workspace ->```

```-> yarn restnest:start -> dev workspace (restnest-e2e-taskNr) generated for development -> Postman PR merged ->```

```-> restnest-e2e main workspace downloaded via Postman API and used for Newman / Grunt-based build pipelines -> reporting```

Because of the nature the data-driven design, most artifacts are generated (e.g, collections, etc.), so RESTNEST Testers can concenrate solely on creating scenarios **exclusively** in Postman with simple copy & paste, workflow configuration.

## RESTNEST support folder structure

### Repo
* **openapi** - Publish OpenAPI Spec transormed cvollections with Postman API
* **pipelines** - YAML for Newman scenario test piplines 
* **restnest-e2e** - Auto-generated e2e test scenario collections and environments - auto-upload to Postman workspace 
* **restnest-postman** - Downloaded auto-generated service Postman collections and environments from Postman Workspace restnest-postman
* **scripts** - Framework scripts for setup and background Express mock server as well as Newman
* **Gruntfile.js** - Tasks configured to setup and run workflow suites in Newman and build pipelines

## Testing Setup

To create a personal repo, simply clone this feature branch and enter following commands:

* Create a feature branch of this repo and clone to IDE
* Run ```yarn restnest:start```
   * at the prompt, enter your Postman API Key

The above scripts use the branch name to identify the DevOps task number of the feature branch, so it is expected that feature branches follow the accepted format, e.g. feature/123456-this-is-my-branch.

The personal devlopmenet workspace, which carries the main workspace name + task nr (e.g. restnest-e2e-123456), should have been forked from the main. All scenario development is done in personal workspaces, which are merged per Postman PR to the main workspace.  
