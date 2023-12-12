const { resolve } = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const uuid = uuidv4();
const { getMetaGlobals, syncWorkstepMetaGlobals } = require('./scenarioUtil');
const { mocker } = require('./scenarioMocker');

/**
 * Express Routes for Scenario setup, support
 */

/**
 * Workstep meta data (globals) from collection lookups
 * Supports Postman request param variable auto-complete (secanrios, request examples, etc.)
 */
module.exports.workflowMeta = async function (startTimestamp, req, res, next) {
  const postmanVars = {
    scenarioServerId: uuid,
    serverUptimeSec: Math.round((Date.now() - startTimestamp) / 1000),
    memory: Object.entries(process.memoryUsage())
      .map(([key, value]) => ({ key: key, value: `${Math.round(value / 1000000)}MB` }))
      .reduce((obj, item) => ({ ...obj, [item.key]: item.value }), {}),
    globals: [],
  };
  // Simply return the server state with no "postman_request_id" parameter
  if (req.query['postman_request_id']) {
    // Lookup Postman collection for Postman globals workstep metadata variables
    try {
      postmanVars.globals = [...postmanVars.globals, ...syncWorkstepMetaGlobals(req.query)];
      res.json(postmanVars);
    } catch (err) {
      err.statusCode = 404;
      next(err);
    }
  } else {
    res.json(postmanVars);
  }
};

/**
 * Scanario workstep prep / mocking facilty
 */
module.exports.workflowStep = async function (req, res, next) {
  const requiredQueryParams = [
    '_workstep_id',
    '_workstep_name',
    '_workstep_endpoint',
    '_workstep_service',
    '_expectCode',
  ];
  try {
    // Check for mimimum workflow request path requirements
    if (req.params[0] === '') {
      throw new Error('SenarioServer: Request path incomplete');
    }

    // Check for required query params
    const missingQueryParams = requiredQueryParams.filter(param => !(param in req.query));
    if (missingQueryParams.length > 0) {
      throw new Error(
        `SenarioServer: Required request query parameter missing: enable ${missingQueryParams.join(
          ','
        )}`
      );
    }

    // Ensure, request name and id are available in query
    if (!(req.query['_workstep_name'] && req.query['_workstep_id'])) {
      throw new Error(
        `SenarioServer: Auto-filled request query info missing: see Scenarios Pre-request Script`
      );
    }
  } catch (err) {
    if (!err.statusCode) err.statusCode = 400;
    next(err);
  }

  // Check for cached workstep globals
  try {
    if (!getMetaGlobals(req.query).find(variable => variable.key === 'worksteps')) {
      if (!syncWorkstepMetaGlobals(req.query).find(variable => variable.key === 'worksteps')) {
        throw new Error('ScenarioServer: globals not found');
      }
    }
  } catch (err) {
    err.statusCode = 404;
    next(err);
  }

  // Return and mocked request for POST endpoints
  const isLogging = false;
  try {
    if (isLogging) {
      console.log(
        '\n\n\x1b[32m%s\x1b[0m',
        `ScenarioServer: workstep request: ${JSON.stringify(req.query, null, 2)}`
      );
    }

    // Mocker
    const mockedRequestPayload =
      req.query['_workstep_body'] && req.query['_workstep_body'].endsWith('/request')
        ? await mocker(req.query)
        : {};

    if (isLogging) {
      console.log(
        '\x1b[32m%s\x1b[0m\n',
        `ScenarioServer: workstep payload: ${JSON.stringify(mockedRequestPayload, null, 2)}`
      );
    }
    res.json(mockedRequestPayload);
  } catch (err) {
    err.statusCode = 500;
    next(err);
  }
};

/**
 * Trigger file writer for Grunt Watch, script launcher
 * **{{triggerId}}_scenario** - RESTNEST scenarios, parallel or sequentional
 * **{{triggerId}}_quickSync** - download dev/main e2e collections
 * **{{triggerId}}_syncCollections** - download, augment and upload dev/main collections
 **/
module.exports.gruntTrigger = function (req, res, next) {
  try {
    // Check for mimimum path
    if (!req.params[0]) {
      throw new Error('trigger path incomplete');
    }
    const triggerPathId = req.params[0].substring(1);
    const triggerPath = resolve(__dirname, 'triggers', `${triggerPathId}.json`);

    // Scenario Trigger Handling
    if (triggerPathId.endsWith('_scenario')) {
      const triggerRunPathId = `${triggerPathId}-${req.body.timestampStart}`;
      const triggerRunPath = resolve(__dirname, 'triggers', `${triggerRunPathId}.json`);

      // Lookup scenarioFolderId/scenarioSeedFolderId based on body request
      let scenarioFolder;
      let scenarioSeedFolder;
      const scenarioFolderName = req.body.scenarioFolder;
      const scenarioSeedFolderName = req.body.scenarioSeedFolder;
      try {
        scenarioFolder = getScenarioFolder(scenarioFolderName);
        if (!scenarioFolder) {
          throw new Error(`ScenarioServer: unknown ${scenarioFolderName}`);
        }
        if (scenarioSeedFolderName) {
          scenarioSeedFolder = getScenarioFolder(scenarioSeedFolderName);
        }
      } catch (err) {
        err.statusCode = 404;
        next(err);
      }

      // Trigger write and respond
      scenarioFolder = {scenarioFolderId: scenarioFolder.value};
      scenarioSeedFolder = scenarioSeedFolder ? {scenarioSeedFolderId: scenarioSeedFolder.value} : {};
      const triggeredTestReport = {
        triggeredTestReport: `http://localhost:3000/report/${triggerRunPathId}`,
      };
      const triggerResponse = {
        ...req.body,
        ...scenarioFolder,
        ...scenarioSeedFolder,
        ...triggeredTestReport,
        ...{ triggerId: triggerPathId },
      };
      fs.writeFileSync(triggerRunPath, JSON.stringify(triggerResponse, null, 2));
      fs.writeFileSync(triggerPath, JSON.stringify(triggerResponse, null, 2));
      res.json(triggerResponse);

    // Other triggers (Quick Sync, etc.)
    } else {
      fs.writeFileSync(triggerPath, JSON.stringify(req.body, null, 2));
      res.json({ triggerId: triggerPathId });
    }
  } catch (err) {
    err.statusCode = 400;
    next(err);
  }
  // helpers
  function getScenarioFolder(scenarioFolderName) {
    let scenarioFolder = getMetaGlobals(req.query).find(variable => variable.key === scenarioFolderName);
    if (!scenarioFolder) {
      scenarioFolder = syncWorkstepMetaGlobals(req.query).find(
        variable => variable.key === scenarioFolderName
      );
    }
    return scenarioFolder;
  }
};

/**
 * Triggered test test report
 */
module.exports.triggeredRunReport = function (req, res, next) {
  try {
    if (!req.params[0]) {
      throw new Error('test report path incomplete');
    }
    const triggerPathId = req.params[0].substring(1);
    const triggerPath = resolve(__dirname, 'triggers', `${triggerPathId}.json`);
    const trigger = JSON.parse(fs.readFileSync(triggerPath, 'utf8'));
    const iteration = trigger.iteration > 1 ? `-${trigger.iteration}` : '';
    const scenarioFolderId = trigger.scenarioFolderId;
    const reportPath = resolve(__dirname, '../newman', 'reports', `${scenarioFolderId}${iteration}.html`);
    const prelimReportPath = resolve(
      __dirname,
      '../newman',
      'reports',
      `${scenarioFolderId}${iteration}-prelim.html`
    );
    const logReportPath = resolve(
      __dirname,
      '../newman',
      'reports',
      `${scenarioFolderId}${iteration}-log.html`
    );

    // Test Run completed
    if (trigger.timestampStop) {

      // On log parameter, show console
      if ('log' in req.query) {
        const consoleLog = trigger.consoleLog.join('\r\n');
        const html = [
          '<!DOCTYPE html>',
          '<html>',
          '<head>',
          '<title>Newman Run Console Log</title>',
          '</head>',
          '<body>',
          `<h2>${trigger.scenarioFolder}</h2>`,
          `<pre>${consoleLog}</pre>`,
          '</body>',
          '</html>'
        ];
        fs.writeFileSync(logReportPath, html.join('\n'));
        res.sendFile(logReportPath);

      // Show Newm HTML Report
      } else {
        res.sendFile(reportPath);
      }

      // Test still running - return prelim report
    } else {
      trigger.durationSeconds = Math.round((Date.now() - trigger.timestampStart) / 1000);
      const html = [
        '<!DOCTYPE html>',
        '<html>',
        '<head>',
        '<title>Newman Preliminary Report</title>',
        '<script>setTimeout(() => {document.location.reload();}, 10000);</script>',
        '</head>',
        '<body>',
        `<h2>Running ${trigger.scenarioFolder}</h2>`,
        `<pre>${JSON.stringify(trigger, null, 2)}</pre>`,
        '<div>',
        '<p><strong>*** TEST IN PROGRESS ***</strong></p>',
        '<p>This page will auto-refresh every 10 seconds until test is complete</p>',
        '</div>',
        '</body>',
        '</html>',
      ];
      fs.writeFileSync(prelimReportPath, html.join('\n'));
      res.sendFile(prelimReportPath);
    }
  } catch (err) {
    err.statusCode = 400;
    next(err);
  }
};
