/**
 * Newman script to create and populate the E2E workspace environments for main & dev
 *
 */
const path = require('path');
const fs = require('fs');
const { newmanRun } = require('./helper/utils');
const { augmentEnvironments } = require('./restnest-e2e-augment-environment');
const { program } = require('commander');

// Check for program parameters
program
  .name('restnest-e2e-sync-environment')
  .option('-m, --mainonly', 'Collection Sync Main Only')
  .parse(process.argv);
const options = program.opts();
const isMainOnly = options.mainonly !== undefined;

const e2e_workspace = { main: 'main', developer: 'developer' };

const repoRoot = path.join(__dirname, '../../restnest-postman'); // restnest-postman root
const environmentsPath = path.join(repoRoot, 'environments');
const collectionsPath = path.join(repoRoot, 'collections');

// Upload generated environments for main (admin) and developer
// Runs a series of requests with Newman using E2E-Environments-* folder in WorkspaceSync collection
async function runAsyncCollections() {
  const collectionPath = path.join(collectionsPath, 'WorkspaceSync.postman_collection.json');
  const globalsPath = path.join(environmentsPath, 'restnest-postman.postman_globals.json');
 
  try {
    const globals = JSON.parse(fs.readFileSync(globalsPath, { encoding: 'UTF8' }));
    const postman_api_key = globals.values.find(value => value.key === 'postman-api-key')?.value;
    const postman_api_key_admin = globals.values.find(value => value.key === 'postman-api-key-admin')?.value;
    if (!(postman_api_key && postman_api_key_admin)) {
      throw new Error('Required Postman api keys not found')
    }
    const isAdmin = postman_api_key === postman_api_key_admin;

    // Generate and augment environments
    addEnvironmentsToRepoGlobals(globals, augmentEnvironments());

    // Delete/create postman workspace environments (main admin only, because of potential developer conflicts)
    // Note: delete, because Postman only writes initial (and not current) values on PUT
    if (isAdmin) { 
      syncEnvironments(e2e_workspace.main)
    }
    if (!isMainOnly) {
      syncEnvironments(e2e_workspace.developer)
    }

  } catch (error) {
    console.error('Problem on syncing environments:', error);
    process.exit(1);
  }

  // helpers
  // Delete/create environments for the respective workspaces
  async function syncEnvironments(env) {
   const folder = `E2E-Environments-${env === e2e_workspace.main ? 'Main' : 'Dev'}`;
   const summary = await newmanRun({
      bail: true,
      color: 'on',
      collection: require(collectionPath),
      globals: JSON.parse(fs.readFileSync(globalsPath, { encoding: 'UTF8' })),
      folder: folder,
      iterationCount: 1,
    });
    console.log(`\n ✅ -> E2E workspace ${env} environments synched successfully.\n`);
  }

  // Add all augmented environments to globals to prep for Newman run
  function addEnvironmentsToRepoGlobals(globals, envList) {
    globals.values.find(
      value => value.key === `all_e2e_environments`
    ).value = envList
    fs.writeFileSync(globalsPath, JSON.stringify(globals, null, 2));
  }
}

// Main
runAsyncCollections();
