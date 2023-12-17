/** Scenario Utility
 *  Global, Collection variable lookup, etc., collection differ, etc.
 */
const path = require('path');
const diff = require('deep-diff');
const { faker } = require('@faker-js/faker');
const { query } = require('express');

/* E2E Globals */
const e2e_baseName = 'restnest-e2e';
const e2e_globalsPath = path.join(
  __dirname,
  `../../restnest-e2e/environment/${e2e_baseName}.postman_globals.base.json`
);
const restnestE2EBaseGobals = require(e2e_globalsPath);

/* E2E Collections */
const e2e_collectionPath = path.join(__dirname, '../../restnest-e2e/collection');
const e2e_collection_name = restnestE2EBaseGobals.values.find(
  variable => variable.key === 'e2e_restnest_collection_name'
).value;
const e2e_service_collection_name = restnestE2EBaseGobals.values.find(
  variable => variable.key === 'e2e_restnest_service_collection_name'
).value;

const e2e_main_collectionPath = path.join(
  e2e_collectionPath,
  `main/${e2e_collection_name}.postman_collection.json`
);
const e2e_main_service_collectionPath = path.join(
  e2e_collectionPath,
  `main/${e2e_service_collection_name}.postman_collection.json`
);
const e2e_dev_collectionPath = path.join(
  e2e_collectionPath,
  `developer/${e2e_collection_name}.postman_collection.json`
);
const e2e_dev_service_collectionPath = path.join(
  e2e_collectionPath,
  `developer/${e2e_service_collection_name}.postman_collection.json`
);

const main_collection = safeRequire(e2e_main_collectionPath);
const main_service_collection = safeRequire(e2e_main_service_collectionPath);
const dev_collection = safeRequire(e2e_dev_collectionPath);
const dev__service_collection = safeRequire(e2e_dev_service_collectionPath);

let currentCollection; // collection cache
let currentServiceCollection; // service collection cache
let globals = {}; // globals cache, stored per endpoint for concurrency

/**
 * Get globals cache
 * @param {*} queryParams
 * @returns globals
 */
module.exports.getMetaGlobals = function (queryParams) {
  let metaGlobals = [];
  if ('_workstep_endpoint' in queryParams) {
    metaGlobals = globals[queryParams['_workstep_endpoint']] || [];
  } else {
    metaGlobals = globals.triggers || [];
  }
  return metaGlobals;
};

/**
 * Create globals for Postman worksteps and triggers (see Triggers pre-request)
 * Performs collection lookup and returns workstep-essential meta-data (worksteps, scenarios, request example responses (static mocks), etc.)
 * @param {object} queryParams
 */
module.exports.syncWorkstepMetaGlobals = function (queryParams) {
  ({currentCollection, currentServiceCollection} = determineCurrentCollections(currentCollection, currentServiceCollection, queryParams.postman_request_id));

  // Workstep parameters
  let metaGlobals = [];
  const requiredQueryParams = [
    '_workstep_id',
    '_workstep_name',
    '_workstep_endpoint',
    '_workstep_service',
  ];
  // For Scenarios workstep, ensure all required parameters are present
  if (requiredQueryParams.filter(param => !(param in queryParams)).length === 0) {
    metaGlobals = [...generateWorkstepGlobals(queryParams)];
    if (queryParams._workstep_faker) {
      metaGlobals = [...metaGlobals, ...generateFakerGlobals()];
    }
    globals[queryParams['_workstep_endpoint']] = metaGlobals;
  // For Triggers, load all scenarios into globals
  } else {
    const scenarios = findAllScenarios(currentCollection.item[0]);
    const scenariosMap = {};
    scenarios.forEach(scenario => {
      if (!scenariosMap[scenario.folder]) {
        scenariosMap[scenario.folder] = scenario.folderId;
      }
    });
    metaGlobals = [...Object.entries(scenariosMap).map(([key, value]) => ({ key: key, value: value }))];
    globals['triggers'] = metaGlobals
  }
  return metaGlobals;
};

/**
 * Create globals for workstep, based on parameters
 * @param {object} workstepParams
 */
function generateWorkstepGlobals(workstepParams) {
  let workstepGlobals = [];

  // With developer/main collection, generate workstep endpoint/schemas global key/values
  loadAllWorksteps(currentCollection, workstepGlobals);
  loadSchemas(currentServiceCollection, workstepParams, workstepGlobals);
  return workstepGlobals;

  // helpers
  // Add workstep names and IDs to globals
  function loadAllWorksteps(collection, globals) {
    const scenarios = findAllScenarios(collection.item[0]).filter(scenario => !!scenario.request);

    // Walk through all scenario worksteps
    let worksteps = [];
    let workstepResponses = [];
    const workStepTemplate = { folder: '', requestName: '', requestId: '' };
    scenarios.forEach(scenario => {

      // Add workstep for each scenario request
      const workstep = { ...workStepTemplate };
      workstep.folder = scenario.folder;
      workstep.requestName = scenario.request.name;
      workstep.requestId = scenario.request.id;
      worksteps.push(workstep);

      // Add workstep example responses for current workstep
      if (scenario.request.id.endsWith(workstepParams['_workstep_id'])) {
        const objectMock = scenario.request.request.url.query.find(
          variable => variable.key === '_objectMock'
        );
        if (objectMock && objectMock.value) {
          workstepResponses.push({
            key: `objectMock`,
            value: objectMock.value.replace(/[{}]/g, ''),
          });
        }
        scenario.request.response.forEach(response => {
          workstepResponses.push({
            key: `${workstepParams['_workstep_endpoint']}/request/${response.name}/${workstepParams['_workstep_service']}`,
            value: response.body,
          });
        });
      }
    });

    // Return filtered worksteps for current request folder (based on _workstep_id / request.id partial match)
    const currWorkstep = worksteps.filter(workstep =>
      workstep.requestId === workstepParams['_workstep_id']
    );
    if (currWorkstep.length !== 1) {
      throw new Error(
        `_workstep_id "${workstepParams['_workstep_id']}" not found in local collection: trigger quickSync or syncCollections and retry`
      );
    }

    // Filter for current folder requests
    worksteps = worksteps
      .filter(workstep => workstep.folder === currWorkstep[0].folder)
    globals.push({ key: 'workstep_id', value: workstepParams['_workstep_id'] });
    globals.push({ key: 'worksteps', value: worksteps });
    globals.push({ key: 'workstep_responses', value: workstepResponses });
  }

  // Add all workstep schemas to globals
  function loadSchemas(collection, workstepParams, globals) {
    const workstepServiceKey = `${workstepParams['_workstep_endpoint']}/${workstepParams['_workstep_service']}`;
    const workstepSchemas = collection.variable.filter(
      service => service.key === workstepServiceKey
    );
    const serviceSchemas =
      workstepSchemas.length === 1 ? JSON.parse(workstepSchemas[0].value) : undefined;

    if (!serviceSchemas) {
      throw new Error(`mocker: No service schema found for _endpoint ${workstepServiceKey}`);
    }
    globals.push({ key: 'workstep_schemas', value: serviceSchemas });
  }
}

/**
 * Generate Faker field and locale globals
 */
function generateFakerGlobals() {
  // Return global fakers and create function lookup map
  let fakerGlobals = [];
  const globalFakers = [];
  const fakerTypes = Object.keys(faker).filter(key => faker[key]['faker']);
  fakerTypes.forEach(fakerType => {
    fakerNames = Object.keys(faker[fakerType]).filter(
      fakerName => typeof faker[fakerType][fakerName] === 'function'
    );
    fakerNames.forEach(fakerName => {
      const fakerValue = `$$faker.${fakerType}.${fakerName}()$$`; // Wrapped in $$ for mixed text
      globalFakers.push({ key: `$$${fakerType}.${fakerName}`, value: fakerValue });
    });
  });
  fakerGlobals = [...fakerGlobals, ...globalFakers];

  // Return faker locales for configure
  const fakerLocales = Object.keys(faker.locales);
  const globalLocales = [];
  fakerLocales.forEach(locale => {
    globalLocales.push({ key: `mock_locale_${locale}`, value: locale });
  });
  fakerGlobals = [...fakerGlobals, ...globalLocales];
  return fakerGlobals;
}

// Helpers
// Collection may be missing, e.g. no dev collection in readonly or build pipeline run
function safeRequire(filepath) {
  try {
    const req = require(filepath);
    return req;
  } catch (e) {
    return {};
  }
}

// Determine collection: assume developer if not main 
function determineCurrentCollections(currentCollection, currentSeviceCollection, requestId) {
  // Determine if current collection used with current workstep_id (unique to collection)
  if (!currentCollection) {
    const isServerRestarted = !requestId;
    const isMainCollection = !isServerRestarted && findRequestById(main_collection.item, requestId).length > 0;
    currentCollection = isMainCollection ? main_collection : dev_collection;
    currentServiceCollection = isMainCollection ? main_service_collection : dev__service_collection;
    console.log(
      '\n\n\x1b[32m%s\x1b[0m',
      `*** ScenarioServer sourcing restnest-e2e/collection/${
        currentCollection === main_collection ? 'main' : 'developer'
      }/restnest-e2e.postman_collection.json ***`
    );
  }
  return {currentCollection: currentCollection, currentServiceCollection: currentServiceCollection};

  // helpers
  // Search collection requests for requestId (workstep_id/trigger_id) and return matches (1)
  function findRequestById(items, id, matches = []) {
    if (items && matches.length === 0) {
      if (Array.isArray(items)) {
        items.forEach(item => {
          findRequestById(item, id, matches);
        });
      } else if (typeof items == 'object') {
        if (items?.id === id) {
          matches.push(items);
        } else {
          Object.keys(items).forEach(key => {
            findRequestById(items[key], id, matches);
          });
        }
      }
    }
    return matches;
  }
}

// Find all scenario requests and return as array
function findAllScenarios(scenarios, requests = [], folderKey = '', folderId = '') {
  if (scenarios) {
    if (Array.isArray(scenarios)) {
      scenarios.forEach(item => {
        findAllScenarios(item, requests, folderKey, folderId);
      });
    } else if (typeof scenarios == 'object') {
      // Add RESTNEST request to list
      if (scenarios.request?.method === '{{M}}') {
        requests.push({ request: scenarios, folder: folderKey, folderId: folderId }); // scenarios is item here
      } else
      // Iterate sub folders
      if (!scenarios.request) {
        Object.keys(scenarios).forEach(key => {
          if (folderKey > '' && scenarios.name) {
            requests.push({ folder: `${folderKey}/${scenarios.name}`, folderId: scenarios.id });
          }
          const currFolderKey = folderKey + `${folderKey === '' ? '' : '/'}${scenarios.name}`;
          findAllScenarios(scenarios[key], requests, currFolderKey, scenarios.id);
        });
      }
    }
  }
  return requests;
}