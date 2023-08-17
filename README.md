# RESTful Newman Entity Scenario Tester - OpenAPI 

*`If you're looking for a Postman Collection Runner alternative, to easily develop and maintain complex, E2E user journey tests or FE test data setup and teardown, for unlimited OpenAPI services, then you've come to the right place.`*

Leverages Postman’s powerful SCM and API test capabilities with a unique, data-driven, Node.js-powered approach to generate and transform OpenAPI3 Specs to JSON Schema and Postman artifacts, for use in complex automated E2E testing scenarios that run in Postman Runner and Newman, as well as build pipelines.

Both this git "infrastructure" repo and the public Postman Workspace, [restnest-openapi](https://restnest-openapi.postman.co/workspace/restnest-openapi~f84b6021-ed78-4245-b4ce-fbbba11013c9/overview), which relies on the [Postman API](https://www.postman.com/postman/workspace/postman-public-workspace/collection/12959542-c8142d51-e97c-46b6-bd77-52bb66712c9a), are required to create and manage a Postman "RESTNEST Instance" of workspaces, collections with JSON Schema variables, and environments for all configured stages, i.e. DEV, STAGING, PROD, etc. 

Designed to easily integrate any number of OpenAPI-defined microservice, this systematic approach significantly reduces the overhead and cost of maintaining E2E tests, which are highly dependent on the contracts defined in OpenAPI. As such, all changes in OpenAPI translate to automatic changes in the underlying generated artifacts, which transparently indicate breaking changes, making maintenance of existing tests much more manageable.

## Postman Workflow enhancements

Each integrated OpenAPI services’ requests are automatically generated, augmented in Postman collections, and forked to developer workspaces. Simply by copying and pasting these pre-generated service requests consecutively into scenario folders, the underlying Postman infrastructure handles test states and request flow, greatly simplifying development overhead, and enabling the “out-of-the-box” automation of complex scenario workflows in Postman and Newman, with shared environment variables and full retry, wait and skip request support. RESTNEST Triggers extend this to support suites of scenarios, which can be run consecutively and/or simultaneously locally and in pipelines.   

## Node.js Project Instrumentation

As can be seen in the extensively documented `package.json`, RESTNEST relies on a number of npm packages, but the following are of fundamental importance:

* [Express.js]() - local server, for mocking and coordination
* [Newman]() - command-line collection runner for Postman 
* [Grunt]() - JavaScript Task Runner


## Repo Folders
* **openapi** - Publish OpenAPI Spec transformed collections with Postman API. The `postman` subdirectory is also a template that can be copied to REST service repos for inclusion in CI/CD
* **pipelines** - YAML for Newman scenario test pipelines 
* **restnest-e2e** - Auto-generated e2e test scenario collections and environments - auto-upload to Postman workspace 
* **restnest-postman** - Downloaded auto-generated service Postman collections and environments from Postman Workspace restnest-postman-*
* **scripts** - Framework scripts for setup and background Express mock server as well as Newman
    * `newman` - all Newman support scripts and generated HTML `reports`
    * `nestServer` - Scenario Server support scripts and `triggers` target folder for triggered files
* **Gruntfile.js** - Tasks configured to setup and run workflow suites in Newman and build pipelines

## RESTNEST Instance Setup

To get started, just fork the [restnest-openapi](https://github.com/dswinscoe-org/restnest-openapi) repo, clone a feature branch locally and run a single script. Some initial cloud service setup is also required, e.g. Google Cloud Platform Secret Manager for secret storage. The install script will require a GCP ProjectId to continue.

After the initial creation of the RESTNEST instance, developers can work independently on domain scenarios by repeating the process:

* Create a feature branch of the RESTNEST domain fork and clone to IDE
* Run ```yarn restnest:start```
   * at the prompt, enter your Postman API Key

The above scripts use the branch name to identify the "task number" of the feature branch, so it is expected that feature branches follow the accepted format, e.g. feature/NNNNN/this-is-my-branch.

The `developer` workspace, which carries the `main` workspace name + task nr (e.g. restnest-e2e-domain-123456), has been forked from the main workspace. All scenario development is done in `developer` workspaces and are merged per Postman PR to the `main` workspace.  
