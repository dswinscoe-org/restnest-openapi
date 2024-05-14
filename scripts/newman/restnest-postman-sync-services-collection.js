/**
 * RESTNEST E2E Services Collection Augmentation and Sync with Postman Repo
 * Create/Update collection's service folder, augmented with query params for use in restnest scenarios
 */
const { resolve } = require('path');
const fs = require('fs');
const { newmanRun, syncArraysOfKeyValueObject } = require('./helper/utils');

// Globals
const repo_collectionsDir = resolve(__dirname, '../../restnest-postman/collections');
const repo_environmentsDir = resolve(__dirname, '../../restnest-postman/environments');
const repo_environmentGlobalsFilePath = resolve(
  repo_environmentsDir,
  'restnest-postman.postman_globals.json'
);
const environmentGlobals = JSON.parse(
  fs.readFileSync(repo_environmentGlobalsFilePath, { encoding: 'UTF8' })
);

function isAdmin() {
  const postman_api_key = environmentGlobals.values.find(
    value => value.key === 'postman-api-key'
  )?.value;
  const postman_api_key_admin = environmentGlobals.values.find(
    value => value.key === 'postman-api-key-admin'
  )?.value;
  if (!(postman_api_key && postman_api_key_admin)) {
    console.error('Required Postman api keys not found');
    process.exit(1);
  }
  return postman_api_key === postman_api_key_admin;
}

// Copy service collection endpoints to restnest collection service-named folders and augment
function augmentCollectionWithServices() {
  try {
    // Lookup restnest / service collections in globals
    const allCollections = sortVariablesByKey(
      environmentGlobals.values.find(value => value.key === 'all_repo_collections').value,
      'name'
    );
    const restnestCollectionName = environmentGlobals.values.find(
      value => value.key === 'e2e_restnest_collection_name'
    ).value;
    const restnestServicesCollectionName = environmentGlobals.values.find(
      value => value.key === 'e2e_restnest_services_collection_name'
    ).value;

    // Get most recent services collection
    const restnestCollectionInfo = allCollections.filter(collection =>
      collection.name.startsWith(restnestServicesCollectionName)
    )[0];
    const restnestServicesCollectionFilePath = resolve(
      repo_collectionsDir,
      `${restnestCollectionInfo.name}.postman_collection.json`
    );
    const restnestCollection = JSON.parse(
      fs.readFileSync(restnestServicesCollectionFilePath, 'utf-8')
    );

    // Iterate Repo service collections
    restnestCollection.variable = [];
    const serviceCollections = allCollections.filter(
      collection =>
        !(
          collection.name === restnestCollectionName ||
          collection.name.startsWith(restnestServicesCollectionName)
        )
    );
    serviceCollections.forEach(service => {
      const collectionFilePath = resolve(
        repo_collectionsDir,
        `${service.name}.postman_collection.json`
      );
      const serviceCollection = JSON.parse(fs.readFileSync(collectionFilePath, 'utf-8'));
      // Remove -timestamp-commitHash for simple service name
      const serviceNameSplit = service.name.split('-');
      const serviceTimestamp = serviceNameSplit.splice(-2, 2).join('-');
      const serviceName = serviceNameSplit.join('-');
      //Add a service folder with all requests to the restenest collection, if not found
      const collectionServiceFolder = restnestCollection.item.find(
        item => item.name === serviceName
      );
      // Service folder new
      if (!collectionServiceFolder) {
        restnestCollection.item.push({
          name: serviceName,
          item: [],
          description: `${service.name}, endpoints augmented for use as RESTNEST workstep`,
        });
        // Update service folder description for PR check
      } else {
        const serviceCollection = restnestCollection.item.find(item => item.name === serviceName);
        serviceCollection.description = `${service.name}, endpoints augmented for use as RESTNEST workstep`;
      }
      // Augment endpoints with scenario query params and add referenced collection variables
      restnestCollection.item.find(item => item.name === serviceName).item = sortVariablesByKey(
        augmentEndpoints(serviceCollection, serviceName),
        'name'
      );
      restnestCollection.variable = [
        ...restnestCollection.variable,
        ...sortVariablesByKey(
          augmentServiceSchemas(serviceCollection, serviceName, serviceTimestamp),
          'key'
        ),
      ];
    });

    // Save collection new service collection locally and in globals (for upload)
    const restnestCollectionNewName = `${restnestServicesCollectionName}-${Date.now()}-0`;
    const restnestCollectionNewPath = resolve(
      repo_collectionsDir,
      `${restnestCollectionNewName}.postman_collection.json`
    );
    restnestCollection.info.name = restnestCollectionNewName;
    delete restnestCollection.info._postman_id;
    delete restnestCollection.info.updatedAt;
    fs.writeFileSync(restnestCollectionNewPath, JSON.stringify(restnestCollection, null, 2));

    // Update collection in globals file
    environmentGlobals.values.find(
      value => value.key === `e2e_restnest_services_collection`
    ).value = restnestCollection;
    fs.writeFileSync(repo_environmentGlobalsFilePath, JSON.stringify(environmentGlobals, null, 2));
  } catch (error) {
    console.error('Problems encountered by services collection augmentation', error);
    process.exit(1);
  }

  // Copy service schemas to restnest collection variables
  function augmentServiceSchemas(serviceCollection, serviceName, serviceTimestamp) {
    const augmentedSchemas = [];

    // Create map of all endpoints
    const endpointMap = {};
    const filteredServiceVars = serviceCollection.variable.filter(
      variable =>
        !(
          variable.key.includes('/path/') ||
          variable.key.includes('/query/') ||
          variable.key.startsWith('environment/')
        )
    );
    filteredServiceVars.forEach(variable => {
      const varKeySplit = splitOnRequestResponse(variable.key);
      endpointMap[varKeySplit[0]] = {};
    });

    // Fill endpointMap with collated request/response types
    // change name to endpoint/op/service, e.g. endpoint/entity/get/serviceName
    // TODO: update _source/*
    filteredServiceVars.forEach(variable => {
      const { key: schemaKey, value: schemaValue } = variable;
      const varKeySplit = splitOnRequestResponse(schemaKey);
      const schemaKeyNew = varKeySplit[0];
      const payloadType = varKeySplit.length > 1 ? varKeySplit[1].substring(1) : '';
      if (endpointMap[schemaKeyNew]) {
        const newPayload = payloadType
          ? { [payloadType]: JSON.parse(schemaValue.replace(/\\"/g, '"')) }
          : JSON.parse(schemaValue.replace(/\\"/g, '"'));
        endpointMap[schemaKeyNew] = {
          ...endpointMap[schemaKeyNew],
          ...newPayload,
        };
      }
    });

    // Loop endpointMap and fill augmentedSchemas
    Object.entries(endpointMap).forEach(([key, value]) => {
      augmentedSchemas.push({
        key: `${key}/${serviceName}`,
        value: JSON.stringify(value).replace(/"/g, '"'),
      });
    });
    return augmentedSchemas;

    // helpers
    function splitOnRequestResponse(key) {
      return key
        .replace(/\/request/, '#/request')
        .replace(/\/response\//, '#/response/')
        .split('#');
    }
  }

  // Augment service endpoints with restnest parameters for use in scenario worksteps
  function augmentEndpoints(serviceCollection, serviceName) {
    const requestParamBaseExtList = [
      { name: '_endpoint', desc: 'Service endpoint (REQUIRED)' },
      { name: '_expectCode', desc: 'Expected HTTP Return Code' },
      { name: '_retries', desc: 'Number of retries' },
      { name: '_wait', desc: 'Wait in ms' },
      { name: '_flatten', desc: 'Flatten response - boolean (default true)' },
    ];
    const mockRequestParamExtList = [
      {
        name: '_localeMock',
        desc: '{{mock_locale_*}} Faker Locale (default en). See {{$$*}} fakers, {{$$format.*}} formatters in globals. Use Scenarios Pre-Request setFormatters() function to create new $$formats.',
      },
      {
        name: '_objectMock',
        desc: 'Endpoint request mock, e.g. {{entity/op/request/[example]/serviceName}}',
      },
      { name: '_mock', desc: '<field mock, with dotted field name>' },
    ];
    // Loop all serviceCollection endpoints
    const augmentedEndpoints = [];
    const auth = serviceCollection.auth;
    serviceCollection.item[0].item.forEach(endpoint => {
      // Delete endpoint id, else Postman database error on POST/PUT (no PUT on main) because of copy
      delete endpoint.id;

      // Add collection authorization to all endpoints
      endpoint.request.auth = auth;

      // Add base parameters for all request methods
      const queryParams = endpoint.request.url.query || [];
      const queryMethod = endpoint.request.method.toLowerCase();
      const queryPath = endpoint.request.url.path.join('/');
      const queryBody = endpoint.request.body?.raw;
      requestParamBaseExtList.forEach(param => {
        const paramValue =
          param.name === '_endpoint' ? `{{${queryPath}/${queryMethod}/${serviceName}}}` : '';
        queryParams.push({
          key: param.name,
          value: paramValue,
          description: param.desc,
          disabled: true,
        });
      });
      // Add additional faker/format query variables based on schema
      if (queryBody) {
        mockRequestParamExtList.forEach(param => {
          if (param.name !== '_mock') {
            queryParams.push({
              key: param.name,
              value: '',
              description: param.desc,
              disabled: true,
            });
          } else {
            const schemaPath = `${queryPath}/${queryMethod}/request`;
            const schemaString = (
              serviceCollection.variable.find(value => value.key === schemaPath) || { value: '{}' }
            ).value.replace(/\\"/g, '"');
            const schema = JSON.parse(schemaString);
            if (Object.keys(schema).length === 0) {
              console.warn(`❗ Schema not found for ${schemaPath} - assuming no body`);
            } else {
              let schemaFieldList = [];
              // allOf Handling - merge all properties
              if (schema.allOf) {
                schema.allOf.forEach(subschema => {
                  const fieldList = [];
                  schemaFieldMockList(subschema.properties, fieldList);
                  schemaFieldList = [...schemaFieldList, ...fieldList];
                });
              } else 
              // Preface all oneOf properties with index
              if (schema.oneOf) {
                schema.oneOf.forEach((schema, schemaIndex) => {
                  const fieldList = [];
                  schemaFieldMockList(schema.properties, fieldList);
                  fieldList.forEach((property, propertyIndex) => {
                    fieldList[propertyIndex].key = `_${schemaIndex}.${property.key.substring(1)}`;
                  });
                  schemaFieldList = [...schemaFieldList, ...fieldList];
                });
              } else
              if (schema.properties) {
                schemaFieldMockList(schema.properties, schemaFieldList);
              }
              queryParams.push(...schemaFieldList);
            }
          }
        });
      }
      endpoint.request.url.query = queryParams;
      augmentedEndpoints.push(endpoint);
    });

    return augmentedEndpoints;

    // helpers

    // Walk the scehma and create dotted-path variables
    function schemaFieldMockList(schema, fieldList, flatPath = '') {
      Object.keys(schema).forEach(key => {
        if (schema[key].properties) {
          schemaFieldMockList(
            schema[key].properties,
            fieldList,
            flatPath + (flatPath === '' ? key : `.${key}`)
          );
        } else if (schema[key].type || schema[key].oneOf) {
          const field = flatPath === '' ? '' : `${flatPath}.`;
          fieldList.push({
            key: `_${field}${key}_mock`,
            value: '',
            description: JSON.stringify(schema[key]).replace(/"/g, '"'),
            disabled: true,
          });
        }
      });
    }
  }

  // sort
  function sortVariablesByKey(vars, key) {
    vars.sort(function (a, b) {
      return a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0;
    });
    return vars;
  }
}

// Upload / Cleanup Postman Repo services collections
async function runRepoCollection(folder) {
  const collectionPath = resolve(repo_collectionsDir, 'WorkspaceSync.postman_collection.json');
  try {
    const summary = await runCollection(folder);
    if (summary) {
      const globals = JSON.parse(
        fs.readFileSync(repo_environmentGlobalsFilePath, { encoding: 'UTF8' })
      );
      syncArraysOfKeyValueObject(summary.globals.values, globals.values);
      fs.writeFileSync(repo_environmentGlobalsFilePath, JSON.stringify(globals, null, 2));
      console.log(`\n ✅ -> ${folder} completed.\n`);
    } else {
      throw new Error('Could not persist globals because of missing collection run');
    }
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
  // helpers
  async function runCollection(folder) {
    const options = {
      bail: true,
      color: 'on',
      collection: require(collectionPath),
      globals: JSON.parse(fs.readFileSync(repo_environmentGlobalsFilePath, { encoding: 'UTF8' })),
      folder: folder,
      iterationCount: 1,
    };
    const isReporting = false; // change for debugging
    if (isReporting) {
      options.reporters = ['cli'];
    }
    return await newmanRun(options);
  }
}

async function main() {
  if (isAdmin()) {
    augmentCollectionWithServices();
    await runRepoCollection('Repo-Upload');
    await runRepoCollection('Repo-Clean');
  } else {
    console.log('\n ✅ -> Skipped services collection sync to Postman Repo (admin required).\n');
  }
}
main();
