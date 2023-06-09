/**
 * Newman script to create and populate the E2E workspace
 * See restnest-postman/environments/restnest-postman.postman_globals.base.json
 */
const newman = require('newman');
const path = require('path');
const fs = require('fs');
const { syncArraysOfKeyValueObject, summaryFailuresErrorText } = require('./helper/utils');

const repoRoot = path.join(__dirname, '../../restnest-postman'); // restnest-postman root
const collectionsPath = path.join(repoRoot, 'collections');
const environmentsPath = path.join(repoRoot, 'environments');

function runCollection() {
  const collectionPath = path.join(collectionsPath, 'WorkspaceSync.postman_collection.json');
  const globalsPath = path.join(environmentsPath, 'restnest-postman.postman_globals.json');
  newman
    .run({
      bail: true,
      color: 'on',
      collection: require(collectionPath),
      globals: require(globalsPath),
      folder: 'E2E-Workspaces',
      iterationCount: 1,
    })
    .on('done', function (err, summary) {
      if (err || summary.run.failures.length) {
        console.error(
          'E2E WorkspaceSync encountered an error:',
          err || summaryFailuresErrorText(summary.run.failures)
        );
        process.exit(1);
      } else
      try {
        // Persist globals
        const globals = require(globalsPath);
        syncArraysOfKeyValueObject(summary.globals.values, globals.values)
        fs.writeFileSync(globalsPath, JSON.stringify(globals, null, 2));
        console.log('\n ✅ -> E2E workspace created/synched successfully.\n');
      } catch(error) {
        console.error('E2E workspace creation/sync could not be completed', error);
        process.exit(1);
      }
    })
    .on('request', (err, args) => {
      if (err) {
        console.error('E2E workspace request error:', err);
        process.exit(1);
      }
    });
}

runCollection();