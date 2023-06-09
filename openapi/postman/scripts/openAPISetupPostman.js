#!/usr/bin/env node
const Converter = require('openapi-to-postmanv2');
const { resolve } = require('path');
const fs = require('fs');
const yaml = require('js-yaml');
const toJsonSchema = require('@openapi-contrib/openapi-schema-to-json-schema');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const { program } = require('commander');

/**
 * Service Repo-dependent configuration
 * Assumes existence of de-referenced spec file for ALL service endpoints, e.g. openapi/generatedSpec/spec.yaml
 * - see openapi/generate-openapi.js for no-reference spec generation
 */
program
  .option('--gcpAccount <value>', 'Google Cloud account')
  .option('--serviceName <value>', 'Repo Service Name')
  .option('--openApiFolder <value>', 'OpenAPI folder relative to this file')
  .option('--noRefSpecFolder <value>', 'No-Reference Spec Folder')
  .option('--noRefSpecName <value>', 'No-Reference Spec Filename')
  .option(
    '--serviceApiKeyLookupName <value>',
    'Optional service API key name for lookup',
    'e2e_apikey'
  )
  .option('--headerApiKeyName <value>', 'Optional request header API key name', 'X-apikey')
  .option(
    '--serviceClientIdLookupName <value>',
    'Optional service OAUth clientid name for lookup',
    'e2e_client_id'
  )
  .option(
    '--serviceClientSecretLookupName <value>',
    'Optional service OAuth clientSecret name for lookup',
    'e2e_client_secret'
  )
  .parse(process.argv);

const {
  gcpAccount,
  globalNoRefSpecPath,
  serviceName,
  serviceApikeyLookupName,
  headerApiKeyName,
  serviceClientIdLookupName,
  serviceClientSecretLookupName,
} = prepServiceConfiguration(program.opts());
const serviceDescription = `## OpenAPI-generated collection for ${serviceName} E2E tests`;

// Collection/Environment paths from template (publishes to restnest-postman Postman Workspace)
// see openapi/postman/environment/restnest-postman.postman_globals.base.json
const gitLastMergeHash = process.env.GIT_LAST_MERGE_HASH || '';
const gitLastMergeHashSuffix = gitLastMergeHash ? `-${gitLastMergeHash}` : `-${Date.now()}-0`;
const collectionDir = resolve(__dirname, '../collection');
const environmentDir = resolve(__dirname, '../environment');
const globalsBasePath = resolve(environmentDir, 'restnest-postman.postman_globals.base.json');
const globalsPath = resolve(environmentDir, 'restnest-postman.postman_globals.json');
const collectionFile = resolve(
  collectionDir,
  `${serviceName}${gitLastMergeHashSuffix}.postman_collection.json`
);

/**
 * Prep service configuration
 * @returns Object - service configuration
 */
function prepServiceConfiguration(options) {
  if (
    !(
      options.gcpAccount &&
      options.serviceName &&
      options.openApiFolder &&
      options.noRefSpecFolder &&
      options.noRefSpecName
    )
  ) {
    console.error('Missing required parameters');
    process.exit(1);
  }
  const openApiFolder = resolve(__dirname, options.openApiFolder);
  const globalNoRefSpecFolder = resolve(openApiFolder, options.noRefSpecFolder);
  const globalNoRefSpecPath = resolve(globalNoRefSpecFolder, options.noRefSpecName);
  return {
    gcpAccount: options.gcpAccount,
    globalNoRefSpecPath: globalNoRefSpecPath,
    serviceName: options.serviceName,
    serviceApikeyLookupName: options.serviceApiKeyLookupName,
    headerApiKeyName: options.headerApiKeyName,
    serviceClientIdLookupName: options.serviceClientIdLookupName,
    serviceClientSecretLookupName: options.serviceClientSecretLookupName,
  };
}

/**
 * Create Postman collection and transform according to schemas / responses
 * Collection generated for publishing in Postman workspace (see prepPostmanPublish)
 */
async function createCollection() {
  // Initial Postman Collection Object - will be augmented
  const collection = {
    info: {
      name: `${serviceName}${gitLastMergeHashSuffix}`,
      description: serviceDescription,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    item: [
      {
        name: 'endpoint',
        description:
          '### Endpoint Folder\n\nThis folder contains generated requests for all of the OpenAPI-declared endpoints of the current service.\n\nContents of this folder, as well as all other collection requests **should not be changed** in Postman, since these changes will be overwritten on the next import.',
        item: [],
      },
    ],
    auth: {},
    variable: [],
  };

  // Create directory for collection
  if (!fs.existsSync(collectionDir)) {
    fs.mkdirSync(collectionDir);
  }

  // Create collection object from global, de-referenced, generated spec
  let converted = false;
  const openapiData = yaml.load(fs.readFileSync(globalNoRefSpecPath));
  Converter.convert(
    { type: 'json', data: yaml.load(fs.readFileSync(globalNoRefSpecPath)) },
    { requestNameSource: 'URL', exampleParametersResolution: 'Schema' },
    (err, conversionResult) => {
      if (err || !conversionResult.result) {
        console.error(
          `OpenAPI spec conversion error: ${globalNoRefSpecPath}`,
          err || !conversionResult.result
        );
      } else
        try {
          createCollectionItems(collection, conversionResult.output[0].data);
          createCollectionInfo(collection, openapiData);
          createCollectionSecurity(collection, openapiData);
          createCollectionServers(collection, openapiData);
          createCollectionVariables(collection, openapiData);
          console.log(
            `\n ✅ -> OpenAPI spec ${globalNoRefSpecPath} converted for Postman collection`
          );
          converted = true;
        } catch (error) {
          console.error(
            `\n ✅ -> OpenAPI spec ${globalNoRefSpecPath} could not be converted`,
            error
          );
        }
    }
  );

  // Transform and write collection
  if (converted) {
    fs.writeFileSync(collectionFile, JSON.stringify(transform(collection), null, 2));
    console.log(`\n ✅ -> Postman collection ${collectionFile} generated`);
  } else {
    console.error('Postman Collection could not be generated!');
    process.exit(1);
  }

  // Helpers
  // Create request items list based on converted OpenAPI specs above
  function createCollectionItems(collection, collectionData) {
    collectionData.item.forEach(item => {
      addCollectionItem(collection, item);
    });
    // Sort requests
    collection.item[0].item.sort(function (a, b) {
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    });
    // helpers
    function addCollectionItem(collection, item) {
      if (item.item) {
        item.item.forEach(item => {
          addCollectionItem(collection, item);
        });
      } else {
        collection.item[0].item.push(item);
      }
    }
  }

  // Add Collection Info
  function createCollectionInfo(collection, specJSON) {
    const {
      info: {
        title: specTitle = '',
        version: specVersion = '',
        description: specDesc = '',
        contact: { name: specCName = '', url: specCURL = '', email: specEMail = '' },
      },
    } = specJSON;
    collection.info.description =
      `${collection.info.description}\n### ${specTitle}\n` +
      `${specDesc}\n**Version:** ${specVersion}\n\n**Contact Name:** ${specCName}\n**URL:** ${specCURL}\n**EMail:** ${specEMail}`;
  }

  // Add Collection Servers
  function createCollectionServers(collection, specJSON) {
    const expectedStages = {
      'PR-1': true,
      PR1: true,
      DEV: true,
      SANDBOX: true,
      STAGING: true,
      PROD: true,
    };
    const expectedAuth = { apiKey: [], oauth2: [] };
    // Check for expected stage and auth in server description
    specJSON.servers.forEach(server => {
      const serverDescSplit = server.description.split(' ');
      const serverAuth = serverDescSplit.find(word => word in expectedAuth) || 'apiKey';
      const serverStage = serverDescSplit.find(word => word in expectedStages);
      if (serverAuth && serverStage) {
        expectedAuth[serverAuth].push({ stage: serverStage, url: server.url });
      }
    });
    // Write environments based on authType (adapt for postman naming: bearer = oauth2, apikey = apiKey)
    const authType =
      collection.auth?.type === 'bearer'
        ? 'oauth2'
        : collection.auth?.type === 'apikey'
        ? 'apiKey'
        : collection.auth?.type;
    if (authType && expectedAuth[authType].length > 0) {
      expectedAuth[authType].forEach(server => {
        collection.variable.push({
          key: `environment/${server.stage}`,
          value: server.url,
          type: 'string',
        });
      });
    } else {
      throw new Error('Server descriptions do not contain recognized stage or authorization type');
    }
  }

  // Add collection Authorization - OpenAPI securitySchem
  function createCollectionSecurity(collection, specJSON) {
    // Supported Auth Types in OpenAPI spec
    const authApiKey = {
      type: 'apikey',
      apikey: [
        {
          key: 'key',
          value: headerApiKeyName,
          type: 'string',
        },
        {
          key: 'value',
          value: '{{X-apikey}}',
          type: 'string',
        },
      ],
    };
    const authOAuth = {
      type: 'bearer',
      bearer: [
        {
          key: 'token',
          value: '{{accessToken}}',
          type: 'string',
        },
      ],
    };

    // Read Spec, determine type and add to collection
    if (specJSON.security && specJSON.components?.securitySchemes) {
      // Select first security scheme
      const componentName = Object.keys(specJSON.security[0])[0];
      const component = specJSON.components.securitySchemes[componentName];
      const componentType = component.type;
      switch (componentType) {
        case 'oauth2':
          collection.auth = authOAuth;
          break;
        case 'apiKey':
        default:
          collection.auth = authApiKey;
          break;
      }
    } else {
      collection.auth = authApiKey;
    }
  }

  function createCollectionVariables(collection, specJSON) {
    // Add collection variables with JSON Schema mappings for all requests, parameters and responses
    getPathSchemaList(specJSON).forEach(variable => {
      collection.variable.push({ key: variable.path, value: variable.schema, type: 'string' });
    });
    // Sort variables
    collection.variable.sort(function (a, b) {
      return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    });

    // helpers
    // Traverse all specs and map schemas to paths
    function getPathSchemaList(spec) {
      const pathSchemaList = [];
      Object.keys(spec.paths).forEach(path => {
        pathSchemaList.push(...getEndpointSchemas(spec.paths[path], path));
      });
      return pathSchemaList;
    }

    // Return list of schemas, e.g, [{path: '<path>', schema: <schema object>},...]
    function getEndpointSchemas(endpoint, endpointPath) {
      const schemas = [];
      // Get all operations, e.g. POST, GET, etc.
      const opKeys = Object.keys(endpoint).filter(key => typeof endpoint[key] === 'object');
      opKeys.forEach(opKey => {
        const op = opKey === 'parameters' ? { [opKey]: endpoint[opKey] } : endpoint[opKey];
        Object.entries(op).forEach(([opElement, operation]) => {
          const endpointFullPath = `${endpointPath.substring(1)}/${opKey}`
            .replace(/{/g, ':')
            .replace(/}/g, '');
          switch (opElement) {
            case 'requestBody': {
              const schema = operation.content['application/json'].schema;
              schemas.push({
                path: `${endpointFullPath}/request`,
                schema: getSchema(schema),
              });
              break;
            }
            case 'parameters': {
              operation.forEach((param, index) => {
                const schema = { ...param.schema };
                schemas.push({
                  path: `${endpointFullPath}/${param.in}/${index}`,
                  schema: getSchema(schema),
                });
              });
              break;
            }
            case 'responses': {
              Object.entries(operation).forEach(([code, response]) => {
                const schema = response.content['application/json'].schema;
                schemas.push({
                  path: `${endpointFullPath}/response/${code}`,
                  schema: getSchema(schema),
                });
              });
              break;
            }
          }
        });
      });

      return schemas;
    }

    // Return schema from yaml json
    function getSchema(yamlJSON) {
      const jsonSchema = toJsonSchema(yamlJSON, { keepNotSupported: ['example'] });
      return JSON.stringify(jsonSchema).replace(/"/g, '\\"');
    }
  }

  // Transform collection for use in Postman/Newman
  function transform(collection) {
    // Remove deprecated collection ids
    removeAllIds(collection);

    // Change endpoint names, bodies
    collection.item[0].item.forEach(item => {
      const itemNameElements = item.name.split('/');
      itemNameElements.shift();
      const newName = `${itemNameElements.join('/')}/${item.request.method.toLowerCase()}`;
      item.name = newName;
      item.request.name = newName;
      if (item.request.body) {
        item.request.body.raw = `{{${item.name}/request}}`;
      }
      item.request.url.query.forEach((query, index) => {
        query.value = ''; // variable option: `{{${item.name}/query/${index}}}`;
        query.disabled = true;
      });
      item.request.url.variable.forEach((variable, index) => {
        variable.value = ''; // variable option: `{{${item.name}/path/${index}}}`;
      });
      // Prune, since schemas in variables
      if (item.response) {
        delete item.response;
      }
    });
    return collection;

    // helpers
    // Remove all collecton ids
    function removeAllIds(node) {
      Object.keys(node).forEach(key => {
        if (key === 'id') {
          delete node[key];
        } else if (node[key] && typeof node[key] === 'object') {
          removeAllIds(node[key]);
        }
      });
    }
  }
}

/**
 * Prepare globals with collection/enviroments for use as payload in Postman API create/update collection and environments
 * NOTE: Gets postman api key, x-api-key, oauth and writes local globals file for ./newman/uploadCollection.js
 * see openapi/postman/environment/restnest-postman.postman_globals.base.json
 */
async function prepPostmanPublish() {
  try {
    fs.copyFileSync(globalsBasePath, globalsPath);
    const globals = require(globalsPath);
    const collection = require(collectionFile);
    const isCollectionAuthApiKey = collection.auth?.type === 'apikey';
    const isCollectionAuthBearer = collection.auth?.type === 'bearer';
    const projectId = gcpAccount;
    const client = new SecretManagerServiceClient();
    const keys = {};
    keys.postman_api_key = await accessSecretVersion('postman_apikey', projectId, client);
    keys.e2e_apikey = isCollectionAuthApiKey
      ? await accessSecretVersion(serviceApikeyLookupName, projectId, client)
      : '';
    keys.e2e_client_id = isCollectionAuthBearer
      ? await accessSecretVersion(serviceClientIdLookupName, projectId, client)
      : '';
    keys.e2e_client_secret = isCollectionAuthBearer
      ? await accessSecretVersion(serviceClientSecretLookupName, projectId, client)
      : '';
    fillGlobal(globals, collection, keys, isCollectionAuthApiKey, isCollectionAuthBearer);
  } catch (error) {
    console.error('Postman publish preperation failed', error);
    process.exit(1);
  }

  // helpers
  async function accessSecretVersion(name, projectId, client) {
    const secretPath = `projects/${projectId}/secrets/${name}/versions/latest`;
    const [secretVersion] = await client.accessSecretVersion({
      name: secretPath,
    });
    if (!secretVersion?.payload?.data) {
      throw new Error(`Secret retrieval failed - Name: ${name}`);
    }
    return (secretVersion?.payload?.data || '').toString();
  }

  function fillGlobal(globals, collection, keys, isCollectionAuthApiKey, isCollectionAuthBearer) {
    const environments = createEnvironments(collection, keys, isCollectionAuthApiKey, isCollectionAuthBearer);
    globals.values.forEach(value => {
      if (value.key === 'postman-api-key') {
        value.value = keys.postman_api_key;
      } else if (value.key === 'service_name') {
        value.value = `${serviceName}${gitLastMergeHashSuffix}`;
      } else if (value.key === 'service_collection') {
        value.value = collection;
      } else if (value.key === 'service_environments') {
        value.value = environments;
      }
    });
    fs.writeFileSync(globalsPath, JSON.stringify(globals, null, 2));
    console.log(`\n ✅ -> Postman collection prepared for upload to workspace`);
  }

  // Create service environments variable based on OpenAPI Server Config
  function createEnvironments(collection, keys, isCollectionAuthApiKey, isCollectionAuthBearer) {
    const environments = collection.variable.filter(variable =>
      variable.key.startsWith('environment/')
    );
    const environmentsList = [];
    environments.forEach(env => {
      const envName = env.key.split('/')[1];
      const envObj = {
        name: envName,
        values: [
          {
            key: 'baseUrl',
            value: env.value,
          },
          {
            key: 'securitySchemeType',
            value: collection.auth.type,
          },
        ],
      };
      if (isCollectionAuthApiKey) {
        envObj.values.push({
          key: 'X-apikey',
          value: keys.e2e_apikey,
          type: 'secret',
        });
      }
      if (isCollectionAuthBearer) {
        envObj.values.push(
          {
            key: 'clientId',
            value: keys.e2e_client_id,
            type: 'secret',
          },
          {
            key: 'clientSecret',
            value: keys.e2e_client_secret,
            type: 'secret',
          },
          {
            key: 'accessToken',
            value: '',
            type: 'secret',
          },
          {
            key: 'accessTokenExpire',
            value: '',
          }
        );
      }
      environmentsList.push(envObj);
    });
    return environmentsList;
  }
}

async function main() {
  createCollection();
  prepPostmanPublish();
}
main();
