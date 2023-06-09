/**
 * RESTNEST E2E Collection Augmentation
 * Prepare and update Scenarios workstep requests with most recent service endpoint/schemas information, in prep for upload
 *
 * NOTE: On initial creation, the augmented restnest-e2e collection is updated in main workspace's restnest-e2e collection,
 * so it can be forked to the developer workspace, otherwise developer workspace collection is augmented to capture service changes
 */
const { resolve } = require('path');
const fs = require('fs');

// Augment E2E Collection Sceanrios workstep requests with latest service info from restnest-e2e-services collection
module.exports.augmentCollectionWithServices = function (
  restnestCollection,
  restnestServiceCollection
) {
  // Globals
  const repo_environmentsDir = resolve(__dirname, '../../restnest-postman/environments');
  const repo_environmentGlobalsFilePath = resolve(
    repo_environmentsDir,
    'restnest-postman.postman_globals.json'
  );
  const environmentGlobals = JSON.parse(
    fs.readFileSync(repo_environmentGlobalsFilePath, { encoding: 'UTF8' })
  );
  const requiredServices = environmentGlobals.values.find(
    value => value.key === 'required_service_repo_collections'
  ).value;

  // Augment collection with service collection
  augmentCollection(restnestCollection, restnestServiceCollection, requiredServices);
  augmentCollectionTriggers(restnestCollection);
  return restnestCollection;

  // Augment Triggers/Scenarios
  function augmentCollectionTriggers(restnestCollection) {
    const triggerRequest = {
      name: '',
      request: {
        method: 'POST',
        header: [],
        body: {
          mode: 'raw',
          raw: '{{triggerBody}}',
          options: {
            raw: {
              language: 'json',
            },
          },
        },
        url: {
          raw: 'localhost:3000/trigger/{{triggerId}}_scenario',
          host: ['localhost'],
          port: '3000',
          path: ['trigger', '{{triggerId}}_scenario'],
          query: [
            {
              key: 'iterations',
              value: '0',
              disabled: true,
              description: 'integer, Scenario iteration count',
            },
            {
              key: 'wait',
              value: 'false',
              disabled: true,
              description: 'booelan, false = Async (default), true = Synchronous',
            },
            {
              key: 'scenarioSeedFolder',
              value: '',
              disabled: true,
              description: 'string, scenario folder name for environment seeding',
            },
          ],
        },
        description: 'Scenarios Folder Trigger',
      },
      response: [],
    };

    const scenariosEvent = [
      {
        listen: 'prerequest',
        script: {
          type: 'text/javascript',
          exec: [
            'pm.expect(pm.variables.has("triggerBody"), \'Should have been set in Triggers pre-request\').to.be.true',
            '',
            '// Add source collection to trigger',
            'const triggerBody = JSON.parse(pm.variables.get("triggerBody"))',
            "triggerBody['sourceCollection'] = 'developer'",
            'pm.variables.set("triggerBody", JSON.stringify(triggerBody))',
            '',
            '// Check for meta data',
            "if (!pm.globals.has('scenarioServerId')) {",
            '  (eval(globals.helper_Triggers)).scenarioServerCheck();',
            '}',
          ],
        },
      },
    ];

    // Triggers/Scenarios folder setup
    const triggers = restnestCollection.item[1];
    let triggerScenarios = triggers.item.find(folder => folder.name === 'Scenarios');
    if (!triggerScenarios) {
      triggers.item.push({
        name: 'Scenarios',
        item: [],
        event: scenariosEvent,
        description: 'Auto-generated Triggers for all configured Scenarios',
      });
      triggers.item = sortItemsByName(triggers.item);
      triggerScenarios = triggers.item.find(folder => folder.name === 'Scenarios');
    }

    // Map all scenario requests
    const scenarios = findAllScenarios(restnestCollection.item[0]);
    const scenariosMap = {};
    scenarios.forEach(scenario => {
      if (!scenariosMap[scenario.folder]) {
        scenariosMap[scenario.folder] = scenario.folderId;
      }
    });

    // Add triggers to Triggers/Scenarios folder
    triggerScenarios.item = [];
    Object.keys(scenariosMap).forEach(key => {
      const trigger = { ...triggerRequest };
      trigger.name = key;
      triggerScenarios.item.push(trigger);
    });

    // helpers
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
            requests.push({ request: scenarios, folder: folderKey, folderId: folderId });
          }
          // Iterate sub folders
          else if (!scenarios.request) {
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
    function sortItemsByName(items) {
      items.sort(function (a, b) {
        return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
      });
      return items;
    }
  }

  // Augment ScenariosFolder requests, replacing method, url, etc.
  // Ignore non-endpoint requests, which will be treated as "Raw" requests
  function augmentCollection(restnestCollection, restnestServiceCollection, requiredServices) {
    // Delete the collection variables (Postman only updates Initial value PUT!)
    delete restnestCollection.variable;
    // Filter for Scenarios & Triggers only (delete others!)
    restnestCollection.item = restnestCollection.item.filter(
      folder => folder.name in { Scenarios: true, Triggers: true }
    );

    // Update description
    updateDescription(restnestCollection, restnestServiceCollection);

    // Traverse the scenario folders
    // Create service map for Scenarios request update
    const serviceCollectionEndpointMap = getServiceMap(restnestServiceCollection, requiredServices);
    updateScenarioRequestsForRESTNEST(restnestCollection.item[0].item);

    // helpers
    // Update collection description with service name
    function updateDescription(restnestCollection, restnestServiceCollection) {
      const serviceNameFooter = `---\n\n${restnestServiceCollection.info.name}\n\n---`;
      const serviceNameFooterSplit = serviceNameFooter.split('\n');
      const descSplit = restnestCollection.info.description.split('\n');
      if (
        descSplit[descSplit.length - 1] === '---' &&
        descSplit[descSplit.length - serviceNameFooterSplit.length] === '---'
      ) {
        descSplit.splice(
          descSplit.length - serviceNameFooterSplit.length,
          serviceNameFooterSplit.length
        );
      }
      restnestCollection.info.description = descSplit.concat(serviceNameFooterSplit).join('\n');
    }

    // Create service map from serviceCollection
    function getServiceMap(restnestServiceCollection, requiredServices) {
      const serviceCollectionEndpointMap = {};
      restnestServiceCollection.item.forEach(folder => {
        // Map Service collection endpoints for scenario request augment/update
        if (folder.name in requiredServices) {
          folder.item.forEach(endpoint => {
            const mapKey = `${endpoint.name.replace(/[{}]/g, '')}/${folder.name}`;
            serviceCollectionEndpointMap[mapKey] = endpoint;
          });
        }
      });
      return serviceCollectionEndpointMap;
    }

    // Iterate, augment & update all scenario requests
    function updateScenarioRequestsForRESTNEST(item) {
      item.forEach(item => {
        if (item.item) {
          updateScenarioRequestsForRESTNEST(item.item);
        } else if (item.request?.url) {
          // Augment service endpoints only
          const isServiceEndpoint =
            'query' in item.request.url &&
            item.request.url.query.find(queryVar => queryVar.key === '_endpoint');
          if (isServiceEndpoint) {
            updateScenarioRequest(item, serviceCollectionEndpointMap);
          }
        }
      });
    }
    // Update scenario request
    function updateScenarioRequest(item, serviceCollectionEndpointMap) {
      const standardRequestTest = {
        listen: 'test',
        script: {
          exec: [
            '/**',
            ' * Mandatory test block (auto-generated) format',
            ' * On edit, ensure:',
            ' *  - All test code contained in this single if block',
            ' *  - Parameter for testsToRun() matches pm.test(s) count',
            ' *  - All pm.test() end with pm.expect((eval(globals.helper_Scenarios)).testCompleted()).to.be.true;',
            ' *  - Test block ends with (eval(globals.helper_Scenarios)).testsRan();',
            ' */',
            'if ((eval(globals.helper_Scenarios)).testsToRun(1)) {',
            '    const response = (eval(globals.helper_Scenarios)).lastResponse();',
            '    pm.test(`${pm.info.requestName} (${pm.globals.get("workstep_mode")}): response retreived`, () => {',
            '        pm.expect(response, `${pm.info.requestName} (${pm.globals.get("workstep_mode")}): response not in environment`).to.not.be.undefined;',
            '        pm.expect((eval(globals.helper_Scenarios)).testCompleted()).to.be.true;',
            '    });',
            '    // Mandatory test completion - must be after all tests',
            '    (eval(globals.helper_Scenarios)).testsRan();',
            '}',
          ],
          type: 'text/javascript',
        },
      };
      const disabledScriptComment = '//!!DISABLED!!//';

      // Check if endpoint still available
      const endpointName = item.request.url.query
        .find(queryVar => queryVar.key === '_endpoint')
        ?.value.replace(/[{}]/g, '');
      const endpoint = endpointName ? serviceCollectionEndpointMap[endpointName] : endpointName;
      if (endpoint) {
        const endpointClone = JSON.parse(JSON.stringify(endpoint));
        adaptRequestForRESTNEST(endpointClone); // Always fresh
        copyRequest(endpointClone, item); // Copy endpoint request and events to item
      } else {
        unadaptRequestForRESTNEST(item, endpointName);
      }

      // helpers
      // Adapt request method, url, params and scripts for RESTNEST
      function adaptRequestForRESTNEST(item) {
        // requests method
        item.request.method = '{{M}}';
        // baseurl
        const urlSplit = item.request.url.raw.split('/');
        urlSplit[0] = '{{workstep}}';
        item.request.url.raw = urlSplit.join('/');
        item.request.url.host[0] = urlSplit[0];
        // enable query params
        item.request.url.query = item.request.url.query.map(queryVar => ({
          ...queryVar,
          ...{
            disabled:
              queryVar.key in { _endpoint: 0, _expectCode: 0 } ? false : queryVar.disabled || true,
          },
        }));
        // Add default scripts
        item.event = [];
        item.event.push(standardRequestTest);
      }
      // Endpoint not found: unadapt request method/baseUrl, all params disabled, script commented (raw)
      function unadaptRequestForRESTNEST(item, endpointName) {
        const endpointNameSplit = endpointName.split('/');
        const method = endpointNameSplit[endpointNameSplit.length - 2].toUpperCase();
        // original request method
        item.request.method = method;
        // reset to baseurl
        const urlSplit = item.request.url.raw.split('/');
        urlSplit[0] = '{{baseUrl}}';
        item.request.url.raw = urlSplit.join('/');
        item.request.url.host[0] = urlSplit[0];
        // disable all RESTNEST query params
        item.request.url.query = item.request.url.query.map(queryVar => ({
          ...queryVar,
          ...{ disabled: queryVar.key.startsWith('_') ? true : queryVar.disabled || false },
        }));
        // comment/disable events
        item.event = item.event?.map(event => {
          if ((event.listen === 'test' || event.listen === 'prerequest') && event.script?.exec) {
            event.script.exec = event.script.exec.map(line => `${disabledScriptComment}${line}`);
          }
          return event;
        });
      }
      // Copy endpoint to workstep item and overwrite with item variables
      function copyRequest(endpoint, item) {
        item.request.method = endpoint.request.method;
        item.request.url.raw = endpoint.request.url.raw;
        item.request.url.host = endpoint.request.url.host;
        item.request.url.query = combineArrays(item.request.url.query, endpoint.request.url.query);
        item.request.url.variable = combineArrays(
          item.request.url.variable,
          endpoint.request.url.variable,
          endpoint.request.url.path.reduce((prev, curr) => {
            prev[curr] = true;
            return prev;
          }, {})
        );
        // If exist, uncomment scripts if formerly disabled
        if (item.event) {
          item.event = item.event.map(event => {
            if (
              (event.listen === 'test' || event.listen === 'prerequest') &&
              event.script?.exec &&
              event.script.exec[0].startsWith(disabledScriptComment)
            ) {
              event.script.exec = event.script.exec.map(
                line => `${line.replace(disabledScriptComment, '')}`
              );
            }
            return event;
          });
          // Use default
        } else {
          item.event = endpoint.event;
        }

        // Combine Query/Path Variables (ignore variables no longer in path)
        function combineArrays(itemVars, endpointVars, pathsMap) {
          if (itemVars && endpointVars) {
            const itemsMap = mapItems(itemVars);
            const endpointsMap = mapItems(endpointVars);
            // Overwrite endpointVars with itemVars
            endpointVars = endpointVars.map(param => {
              itemsParam = itemsMap[param.key];
              // Request Path Variables
              if (pathsMap && itemsParam) {
                param = { ...param, ...{ value: itemsParam.value } };
                // Request Query Params
              } else {
                if (itemsParam)
                  param = {
                    ...param,
                    ...{ value: itemsParam.value, disabled: !itemsParam.value },
                  };
              }
              delete param.id;
              return param;
            });
            // Combine with items not in endpoints (ignore variables no longer in path)
            // Note, if variable ignored, value will be lost (but visible in change compare)
            const extraItemVars = itemVars.filter(
              param =>
                (!pathsMap || (pathsMap && `:${param.key}` in pathsMap)) && !endpointsMap[param.key]
            );
            itemVars = [...endpointVars, ...extraItemVars];
          }
          return itemVars;
        }
        function mapItems(items) {
          return items.reduce((prev, current, index) => {
            prev[current.key] = current;
            return prev;
          }, {});
        }
      }
    }
  }
};
