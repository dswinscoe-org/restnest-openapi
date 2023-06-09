/**
 * Launches newman run on restnest-e2e/Triggers/Scenario Suites *
 * One pipeline run per suite wih multiple triggers for scenarios and other scripts.
 */
const { program } = require('commander');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { newmanRun } = require('./helper/utils');

// Check for program parameters
program
  .option('-f, --folderId <folderId>', 'Triggers folder id, required')
  .option('-e, --environment <environment>', 'Staging environment, required')
  .option('-c, --collection <collection>', 'Collection type, main or developer, required')
  .parse(process.argv);
const options = program.opts();
assert.notStrictEqual(options.folderId, undefined, 'Triggers folder id, required');
assert.notStrictEqual(options.environment, undefined, 'Staging environment, required');
assert.notStrictEqual(
  options.collection,
  undefined,
  'Collection type, main or developer, required'
);

const folderIdParam = options.folderId;
const environmentParam = options.environment;
const collectionParam = options.collection;

async function runTiggerSuiteFolder() {
  console.log(
    `\n Running Trigger Folder(Id) ${folderIdParam}, in environment ${environmentParam}, with ${collectionParam} collection ...`
  );

  // Prep environment, globals, and collection path for Newman based on parameters
  const newmanEnvironmentPath = path.join(__dirname, 'environment', 'environment.suite.json');
  const root = path.join(__dirname, '../../restnest-e2e');
  const collectionPath = path.join(
    root,
    'collection',
    collectionParam,
    'restnest-e2e.postman_collection.json'
  );
  const environmentsPath = path.join(
    root,
    'environment',
    `${environmentParam}.restnest-e2e.postman_environment.json`
  );
  const globals = {
    values: [],
  };

  try {
    // Prep newman environment for suite run
    fs.copyFileSync(environmentsPath, newmanEnvironmentPath);

    // Run Suite Trigger folder
    const options = {
      bail: true,
      color: 'on',
      collection: require(collectionPath),
      environment: require(newmanEnvironmentPath),
      globals: globals,
      folder: folderIdParam,
      iterationCount: 1
    };
    const isReporting = false; // change for debugging
    if (isReporting) {
      options.reporters = ['cli'];
    }
    const summary = await newmanRun(options);
    console.log('\n ✅ -> E2E suite launched.\n');

  } catch (error) {
    console.error(error)
    process.exit(1);
  }
}

// main
runTiggerSuiteFolder();
