const path = require('path');
const fs = require('fs');
const convert = require('xml-js');
const newman = require('newman');

/**
 * Returns a promise to do a newman test run with the provided options. (see ../restnest-e2e-sync-collection.js for use)
 * @param {Object} options See https://github.com/postmanlabs/newman#api-reference for details on the options object.
 * @returns {Promise}
 */
exports.newmanRun = async function (options, isRejectOnRunFailures = true, consoleLog = []) {
  return new Promise(function (onResolve, onReject) {
    newman
      .run(options)
      .on('start', function (err, args) {
        if (!err) {
          const msg = `${new Date().toISOString()} Scenario ${options.folder} running ...`;
          consoleLog.push(msg);
        }
      })
      .on('console', function (err, args) {
        if (!err) {
          const msgs = args.messages.map(msg => `${new Date().toISOString()} ↳ ${msg}`);
          consoleLog.push(...msgs);
        }
      })
      .on('assertion', function (err, args) {
        if (err) {
          consoleLog.push(`${new Date().toISOString()}   x ${err.test}`);
          consoleLog.push(`  ${err.message}`);
        } else {
          consoleLog.push(`${new Date().toISOString()}   ✓ ${args.assertion}`);
        }
      })
      .on('done', function (err, summary) {
        if (err || summary.error || (isRejectOnRunFailures && summary.run.failures.length)) {
          const errMsg = `NewmanRun encountered an error: ${
            err || summaryFailuresErrorText(summary.run.failures)
          }`;
          const msg = `${new Date().toISOString()} Scenario ${
            options.folder
          } completed with error: ${errMsg}`;
          consoleLog.push(msg);
          onReject(errMsg);
        } else {
          const msg = `${new Date().toISOString()} Scenario ${options.folder} completed.`;
          consoleLog.push(msg);
          onResolve(summary);
        }
      })
      .on('request', (err, args) => {
        persistTriggerRunFile(options, consoleLog);
        if (err) {
          const errMsg = `NewmanRun request error: ${err}`;
          consoleLog.push(errMsg);

          onReject(errMsg);
        }
      });
  });
};

function persistTriggerRunFile(options, consoleLog) {
  const triggerFilePathVar = options.globalVar?.find(
    globalVar => globalVar.key === 'triggerFilePath'
  );
  if (triggerFilePathVar?.value) {
    const triggerFilePath = triggerFilePathVar.value;
    const scenario = JSON.parse(fs.readFileSync(triggerFilePath, { encoding: 'UTF8' }));
    scenario.consoleLog = consoleLog;
    fs.writeFileSync(triggerFilePath, JSON.stringify(scenario, null, 2));
  }
}

// Assertion error text from summary.failures
const summaryFailuresErrorText = (exports.summaryFailuresErrorText = function (failures) {
  // report first error
  const failure = failures[0].error;
  return `${failure.test || 'Pre-request assertion'}: ${failure.message}`;
});

// Sync arrays of objects with COMMON+FROM key/value pairs, e.g. global variables
exports.syncArraysOfKeyValueObject = function (fromArray, toArray) {
  const fromMap = fromArray.reduce((previous, current) => {
    previous[current.key] = current.value;
    return previous;
  }, {});
  const toMap = toArray.reduce((previous, current) => {
    previous[current.key] = current.value;
    return previous;
  }, {});
  Object.keys(fromMap).forEach(key => {
    if (!(key in toMap)) {
      toArray.push({ key: key, value: null });
    }
  });
  toArray.forEach(toObject => {
    if (toObject.key in fromMap) {
      toObject.value = fromMap[toObject.key];
    }
  });
};

// Sync arrays of objects with ALL key/value pairs, e.g. global variables
exports.syncArraysOfAllKeyValueObject = function (fromArray, toArray) {
  const fromMap = fromArray.reduce((previous, current) => {
    previous[current.key] = current.value;
    return previous;
  }, {});
  Object.keys(fromMap).forEach(key => {
    toArray.push({ key: key, value: fromMap[key] });
  });
};

// Rewrite junit file according to workflow iterations
exports.rewriteJUnitFile = function rewriteJUnitFile(reportFilePath) {
  const xmlReport = fs.readFileSync(reportFilePath, 'utf8');
  const jsonReport = JSON.parse(convert.xml2json(xmlReport, { compact: true }));
  iterateReport(jsonReport);
  const newXMLReport = convert.json2xml(JSON.stringify(jsonReport), { compact: true, spaces: 2 });
  fs.writeFileSync(reportFilePath, newXMLReport);

  // Loop through suites/testcases to transform
  function iterateReport(node) {
    Object.entries(node).forEach(([key, value]) => {
      if (key === 'testsuites') {
        value._attributes.tests = `${Math.floor(parseInt(value._attributes.tests) / 2)}`;
        iterateReport(value);
      } else if (key === 'testsuite') {
        const suites = Array.isArray(value) ? value : [value];
        // Iterate testsuites and cleanup noise
        suites.forEach(suite => {
          delete suite.properties;
          delete suite._attributes.hostname;
          if (suite['system-err']) {
            delete suite['system-err'];
          }
          // Filter preps
          suite.testcase = Array.isArray(suite.testcase) ? suite.testcase : [suite.testcase];
          const filteredTestCases = suite.testcase.filter(
            testcase => !testcase._attributes.name.includes('(Prep)')
          );
          suite.testcase = filteredTestCases;
          // Set skipped
          suite.testcase.forEach(testCase => {
            const isSkipped = testCase._attributes.name.includes('(Skip)');
            if (isSkipped) {
              testCase['skipped'] = {};
            }
          });
        });
        node.testsuite = markFailedSkippedOnRetrySuccess(suites);
      }
    });
    // helpers
    // Mark failed testcases as skipped if retry successful
    function markFailedSkippedOnRetrySuccess(suites) {
      suites.forEach(suite => {
        if (parseInt(suite._attributes.failures) > 0) {
          const failureIndex = [];
          // Check for errors
          suite.testcase.forEach((testcase, testcaseIndex) => {
            if (testcase.failure) {
              failureIndex.push(testcaseIndex);
            }
          });
          // Failure was corrected by reporter (successful retry) - increase tests by failures
          if (failureIndex.length === 0) {
            suite._attributes.tests = `${
              parseInt(suite._attributes.tests) +
              parseInt(suite._attributes.failures) * parseInt(suite._attributes.tests)
            }`;
            suite._attributes.failures = '0';
          }
        }
      });
      return suites;
    }
  }
};
