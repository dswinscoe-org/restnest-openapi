/**
 * Newman script for scenario suite execution
 * Postman-triggered (see Gruntfile.js), mutilple scenarios may be presented for parallel and sequential execution
 */
const fs = require('fs');
const path = require('path');
const {
  newmanRun,
  rewriteJUnitFile,
  syncArraysOfKeyValueObject,
  syncArraysOfAllKeyValueObject,
} = require('./helper/utils');

// Check for program parameters
const scenarios = [];
try {
  console.log('Scenario Parameters', process.argv);
  const scenarioParams = process.argv.filter(param => param.startsWith('--'));
  if (scenarioParams.length === 0) {
    throw new Error('Required parameters are missing');
  }
  scenarioParams.forEach(param => scenarios.push(param.split('=')[1]));
} catch (error) {
  console.error(error);
  process.exit(1);
}

// Run scenario based on folderId
async function runScenario(scenario) {
  const requiredScenarioVariables = ['sourceCollection', 'scenarioFolderId', 'environment'];
  const rootE2E = path.join(__dirname, '../../restnest-e2e');
  const emptyGlobals = { values: [] };

  let summary = {};
  try {
    // Check for all required scenario variables
    const missingVariables = requiredScenarioVariables.filter(variable => !scenario[variable]);
    if (missingVariables.length > 0) {
      throw new Error(`resnest-scenario-suite: missing scenario variable(s): `, missingVariables);
    }

    // Setup Collection
    const collectionPath = path.join(
      rootE2E,
      'collection',
      scenario.sourceCollection,
      'restnest-e2e.postman_collection.json'
    );

    // Setup globals
    const newmanGlobalsPath = path.join(
      __dirname,
      'environment',
      `globals.${scenario.scenarioFolderId}.json`
    );
    fs.writeFileSync(newmanGlobalsPath, JSON.stringify(emptyGlobals, null, 2));

    // Setup environment files
    const iteration = scenario.iteration > 1 ? `-${scenario.iteration}` : '';
    // Fresh environment
    const environmentsE2EPath = path.join(
      rootE2E,
      'environment',
      `${scenario.environment}.postman_environment.json`
    );
    // After-Newman scenario run environment file for import to Postman
    const environmentsE2EScenarioPath = path.join(
      rootE2E,
      'environment',
      `${scenario.environment}-${scenario.scenarioFolderId}.postman_environment.json`
    );
    // Newman runtime environment file
    const newmanEnvironmentPath = path.join(
      __dirname,
      'environment',
      `environment.${scenario.scenarioFolderId}${iteration}.json`
    );
    // Copy previously run scenario's environment as seed, if configured in trigger (see scenarioSeedFolder param)
    if (scenario.scenarioSeedFolderId) {
      const scenarioSeedEnvironmentPath = path.join(
        __dirname,
        'environment',
        `environment.${scenario.scenarioSeedFolderId}.json`
      );
      fs.copyFileSync(scenarioSeedEnvironmentPath, newmanEnvironmentPath);
    } else {
      fs.copyFileSync(environmentsE2EPath, newmanEnvironmentPath);
    }

    // Reports setup
    const newmanReportsPath = path.join(__dirname, 'reports');
    fs.mkdirSync(newmanReportsPath, { recursive: true });
    const reportsPathHTML = path.join(
      newmanReportsPath,
      `${scenario.scenarioFolderId}${iteration}.html`
    );
    const reportsPathXML = path.join(
      newmanReportsPath,
      `${scenario.scenarioFolder.replace(/\s/g, '').replace(/\//g, '.')}-${
        scenario.scenarioFolderId
      }-${scenario.timestampStart}${iteration}.xml`
    );

    // Trigger filepath for scenario run configuration, statistics
    const triggerFilePath = path.join(
      __dirname,
      '../nestServer',
      'triggers',
      `${scenario.triggerId}-${scenario.timestampStart}${iteration}.json`
    );

    // Prep Newman scenario run
    const environment = JSON.parse(fs.readFileSync(newmanEnvironmentPath, { encoding: 'UTF8' }));
    const collection = JSON.parse(fs.readFileSync(collectionPath, { encoding: 'UTF8' }));
    collection.info.description = `**Folder:** [${scenario.scenarioFolder}](${scenario.triggeredTestReport}?log=true)`;

    // Get/Save trigger environment scenarioMode query parameters
    const scenarioEnvParams = Object.keys(scenario).filter(key => key.startsWith('scenarioMode/'));
    if (scenarioEnvParams) {
      scenarioEnvParams.forEach(param => {
        environment.values.push({ key: param, value: scenario[param] });
      });
    }

    // Newman run
    const consoleLog = [];
    console.log(
      `\nScenario running${scenario.wait ? ' synchronously' : ' async'}: `,
      JSON.stringify(scenario, null, 2),
      '...'
    );
    const options = {
      bail: false,
      color: 'on',
      collection: collection,
      environment: environment,
      globals: require(newmanGlobalsPath),
      globalVar: [{ key: 'triggerFilePath', value: triggerFilePath }],
      folder: scenario.scenarioFolderId,
      iterationCount: 1,
      reporters: ['htmlextra', 'junit'],
      reporter: {
        htmlextra: { export: reportsPathHTML },
        junit: { export: reportsPathXML },
      },
    };
    summary = await newmanRun(options, false, consoleLog);

    // Write final trigger file
    persistTriggerRunFile(triggerFilePath, scenario, consoleLog);
    // Rewrite XUnit file
    rewriteJUnitFile(reportsPathXML);
    // Persist summary globals / environment
    persistEnvironment(newmanEnvironmentPath, environmentsE2EScenarioPath, summary);
    persistGlobals(newmanGlobalsPath, summary);

    console.log('\nScenario complete: ', JSON.stringify(scenario, null, 2));
  } catch (error) {
    console.error(error);
  }

  // helpers
  // Sync summary globals and persist
  function persistTriggerRunFile(triggerFilePath, scenario, consoleLog) {
    scenario.timestampStop = Date.now();
    scenario.durationSeconds = Math.round((Date.now() - scenario.timestampStart) / 1000);
    scenario.mem = memCheck();
    scenario.consoleLog = consoleLog;
    fs.writeFileSync(triggerFilePath, JSON.stringify(scenario, null, 2));
  }
  function persistGlobals(newmanGlobalsPath, summary) {
    if (summary.globals) {
      const globals = JSON.parse(fs.readFileSync(newmanGlobalsPath, { encoding: 'UTF8' }));
      syncArraysOfAllKeyValueObject(summary.globals.values, globals.values);
      fs.writeFileSync(newmanGlobalsPath, JSON.stringify(globals, null, 2));
    }
  }
  function persistEnvironment(newmanEnvironmentPath, environmentsE2EScenarioPath, summary) {
    if (summary.environment) {
      const env = JSON.parse(fs.readFileSync(newmanEnvironmentPath, { encoding: 'UTF8' }));
      syncArraysOfKeyValueObject(summary.environment.values, env.values);
      fs.writeFileSync(newmanEnvironmentPath, JSON.stringify(env, null, 2));
      // Change environment name to include folder id, and write back to restnest-e2e/environment
      env.name = path.basename(environmentsE2EScenarioPath, '.json').split('.').slice(0, -1).join('.');
      fs.writeFileSync(environmentsE2EScenarioPath, JSON.stringify(env, null, 2));
    }
  }
  // return usages in megabytes(MB)
  function memCheck() {
    const mem = {};
    for (const [key, value] of Object.entries(process.memoryUsage())) {
      mem[key] = `${value / 1000000}MB`;
    }
    return mem;
  }
}

// Iterate all scenarios and run
async function runSuiteScenarios(scenarios) {
  try {
    scenariosPrep(scenarios);
    if (scenarios.length > 0) {
      for (const scenario of scenarios) {
        if (scenario.wait) {
          await runScenario(scenario);
        } else {
          runScenario(scenario);
        }
      }
    } else {
      throw new Error('No scenarios found to run');
    }
  } catch (error) {
    console.error(error);
  }

  // helpers
  // Prep scenarios by trigger timestampStart, with iterations support
  function scenariosPrep(scenarios) {
    if (scenarios.length > 0) {
      const scenariosLength = scenarios.length;
      let index = 0;
      let timestampMap = [];
      do {
        const scenario = scenarios.shift(-1);
        const triggerFilepath = path.join(__dirname, '../../', scenario);
        const triggerJSON = JSON.parse(fs.readFileSync(triggerFilepath, 'UTF8'));
        if (triggerJSON.scenarioFolderId) {
          let iterations = parseInt(triggerJSON.iterations || 1);
          do {
            const iterationJSON = { ...triggerJSON };
            const iteration = iterations > 1 ? `-${iterations}` : '';
            iterationJSON.triggeredTestReport = `${iterationJSON.triggeredTestReport}${iteration}`;
            iterationJSON.iteration = iterations;
            // Only wait (run synchronous) on last iteration
            if (iterationJSON.iteration > 1) {
              delete iterationJSON.wait;
            }
            timestampMap.push({
              timestamp: `${iterationJSON.timestampStart}${iteration}`,
              json: iterationJSON,
            });
            persistRunIterationFile(iterationJSON, iteration);
          } while (--iterations > 0);
        }
      } while (++index < scenariosLength);
      timestampMap = sortVariablesByKey(timestampMap, 'timestamp');
      timestampMap.forEach(item => {
        scenarios.push(item.json);
      });
    }
    function persistRunIterationFile(scenario, iteration) {
      const triggerFilePath = path.join(
        __dirname,
        '../nestServer',
        'triggers',
        `${scenario.triggerId}-${scenario.timestampStart}${iteration}.json`
      );
      fs.writeFileSync(triggerFilePath, JSON.stringify(scenario, null, 2));
    }
    function sortVariablesByKey(vars, key) {
      vars.sort(function (a, b) {
        return a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0;
      });
      return vars;
    }
  }
}

// main
runSuiteScenarios(scenarios);
