/**
 * Newman script to download collections/enivironments from configured workspace
 * See restnest-postman/environments/restnest-postman.postman_globals.base.json
 */
const newman = require('newman');
const path = require('path');
const fs = require('fs');
const { summaryFailuresErrorText, syncArraysOfKeyValueObject } = require('./helper/utils')

const root = path.join(__dirname, '../../restnest-postman'); // restnest-postman root
const collectionsPath = path.join(root, 'collections');
const environmentsPath = path.join(root, 'environments');

function runCollection() {
  const collectionPath = path.join(collectionsPath, 'WorkspaceSync.postman_collection.json');
  const globalsPath = path.join(environmentsPath, 'restnest-postman.postman_globals.json');
  newman
    .run({
      bail: true,
      color: 'on',
      collection: require(collectionPath),
      globals: JSON.parse(fs.readFileSync(globalsPath, { encoding: 'UTF8' })),
      folder: 'Repo-Download',
      iterationCount: 1,
    })
    .on('done', function (err, summary) {
      if (err || summary.run.failures.length) {
        console.error('Repo WorkspaceSync colection encountered an error:', err || summaryFailuresErrorText(summary.run.failures));
        process.exit(1);
      } else
      try {
        // Persist globals
        const globals = require(globalsPath);
        syncArraysOfKeyValueObject(summary.globals.values, globals.values)
        fs.writeFileSync(globalsPath, JSON.stringify(globals, null, 2));
        console.log('\n ✅ -> Repo workspace collections/environments downloaded successfully.\n');
      } catch(error) {
        console.error('Repo workspace collections/environments download could not be completed', error);
        process.exit(1);
      }
    })
    .on('request', (err, args) => {
      if (err) {
        console.error('Repo workspace collection/environment request error:', err);
        process.exit(1);
      } else
      try {
        // Persist downloaded repo collections/environments
        const resp = JSON.parse(args.response.stream);
        if (resp.collection?.info || resp.environment) {
          const filepath = resp.environment
            ? path.join(environmentsPath, `${resp.environment.name}.postman_environment.json`)
            : resp.collection
            ? path.join(collectionsPath, `${resp.collection.info.name}.postman_collection.json`)
            : '';
          if (filepath) {
            fs.writeFileSync(
              filepath,
              JSON.stringify(resp.collection || resp.environment, null, 2)
            );
          } else {
            console.error('No collection or environment found in repo workspace response');
            process.exit(1);
          }
        }
      } catch (error) {
        console.error('Repo workspace artifacts could not be downloaded', error);
        process.exit(1);
      }
    });
}

runCollection();