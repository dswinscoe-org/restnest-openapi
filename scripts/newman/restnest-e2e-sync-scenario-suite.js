/**
 * Newman script to download main E2E collection and environments in prep for restnest-scenario-suite.js (pipeline) run
 * Postman-triggered (see Gruntfile.js)
 */
const { resolve } = require('path');
const fs = require('fs');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const { newmanRun, syncArraysOfKeyValueObject } = require('./helper/utils');
const { runWorkspaceSyncLoader } = require('./restnest-postman-sync-collection');

const repoCollectionsPath = resolve(__dirname, '../../restnest-postman/collections');
const repoCollectionPath = resolve(repoCollectionsPath, 'WorkspaceSync.postman_collection.json');

const e2eCollectionsPath = resolve(__dirname, '../../restnest-e2e/collection/main');

const environmentsRepoPath = resolve(__dirname, '../../restnest-postman/environments');
const environmentE2ePath = resolve(__dirname, '../../restnest-e2e/environment');
const globalsBasePath = resolve(environmentE2ePath, 'restnest-e2e.postman_globals.base.json');
const globalsRepoFilename = 'restnest-postman.postman_globals.json';
const globalsFilename = 'restnest-e2e.postman_globals.json';
const globalsPath = resolve(environmentE2ePath, globalsFilename);
const globalsRepoPath = resolve(environmentsRepoPath, globalsRepoFilename);

/**
 * Prepare globals with Postman APIKey for collection/environment local sync download
 * NOTE: Gets APIKey key from GCP Secret Manager - requires gcloud access to configured service account
 */
async function prepPostmanSync(globalsBasePath, globalsPath) {
  console.log(`\n ✅ -> Preparing for Postman Sync with globals ${globalsBasePath} ...`);

  try {
    // On new install, update globals.base from repo
    persistBaseGlobals();

    // Copy globals.base to globals
    fs.copyFileSync(globalsBasePath, globalsPath);
    const globals = require(globalsPath);

    // Get Postman ApiKey from configured GCP service account
    const client = new SecretManagerServiceClient();
    const projectId = (
      globals.values.find(global => global.key === 'gcp-service-account-project') || { value: '' }
    ).value;
    const postman_api_key = await accessSecretVersion(client, projectId, 'postman_apikey');

    fillGlobal(globals, postman_api_key);
  } catch (error) {
    console.error(
      `\n ✅ -> Error preparing for Postman Sync with globals ${globalsBasePath}`,
      error
    );
    process.exit(1);
  }

  // helpers
  async function accessSecretVersion(client, projectId, name) {
    const secretPath = `projects/${projectId}/secrets/${name}/versions/latest`;
    const [secretVersion] = await client.accessSecretVersion({
      name: secretPath,
    });
    if (!secretVersion?.payload?.data) {
      console.error(`Secret retrieval failed - Name: ${name} - ensure Google Cloud auth login`);
      process.exit(1);
    }
    return secretVersion?.payload?.data?.toString();
  }

  // On fresh install, transfer from restnest-postman globals 
  function persistBaseGlobals() {
    const globalsBase = JSON.parse(fs.readFileSync(globalsBasePath, { encoding: 'UTF8' }));
    const gcpProjectId = globalsBase.values.find(
      variable => variable.key === 'gcp-service-account-project' && !variable.value.startsWith('<')
    )?.value;
    if (!gcpProjectId) {
      const globalsRepo = JSON.parse(fs.readFileSync(globalsRepoPath, { encoding: 'UTF8' }));
      const repoProjectId = globalsRepo.values.find(
        variable => variable.key === 'gcp-service-account-project' && !variable.value.startsWith('<')
      )?.value;
      const repoWorkspaceSyncId = globalsRepo.values.find(
        variable => variable.key === 'repo_workspacesync_collection_id' && !variable.value.startsWith('<')
      )?.value; 
      const e2eWorkspaceId = globalsRepo.values.find(
        variable => variable.key === 'e2e_workspace_id' && !variable.value.startsWith('<')
      )?.value;
      const e2eWorkspaceName = globalsRepo.values.find(
        variable => variable.key === 'e2e_workspace_name' && !variable.value.startsWith('<')
      )?.value;
      if (!repoProjectId || !repoWorkspaceSyncId || !e2eWorkspaceId || !e2eWorkspaceName) {
        throw new Error(
          'Global variables for repo workspace are missing - globals from local repo setup were expected'
        );
      }
      globalsBase.values.find(variable => variable.key === 'gcp-service-account-project').value = repoProjectId;
      globalsBase.values.find(variable => variable.key === 'repo_workspacesync_collection_id').value = repoWorkspaceSyncId;
      globalsBase.values.find(variable => variable.key === 'e2e_workspace_id').value = e2eWorkspaceId;
      globalsBase.values.find(variable => variable.key === 'e2e_workspace_name').value = e2eWorkspaceName;
      fs.writeFileSync(globalsBasePath, JSON.stringify(globalsBase, null, 2));      
    }
  }

  function fillGlobal(globals, postman_api_key) {
    globals.values.forEach(value => {
      if (value.key === 'postman-api-key') {
        value.value = postman_api_key;
      }
    });
    fs.writeFileSync(globalsPath, JSON.stringify(globals, null, 2));
    console.log(`\n ✅ -> Globals file ${globalsPath} prepared for Postman sync.`);
  }
}
// Download E2E main collection and environments
async function postmanE2EMainSync() {
  let summary;
  try {
    // Postman Repo WorkspaceSync collection run on E2E-Scenarios folder
    summary = await newmanRun({
      bail: true,
      color: 'on',
      collection: require(repoCollectionPath),
      globals: JSON.parse(fs.readFileSync(globalsPath, { encoding: 'UTF8' })),
      folder: 'E2E-Scenarios',
      iterationCount: 1,
    });
    // Persist for use in scenario suite runs (see restnest-scenario-suite.js)
    persistGlobals(summary);
    persistCollection(summary);
    persistEnvironments(summary);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }

  // helpers
  function persistGlobals(summary) {
    const globals = JSON.parse(fs.readFileSync(globalsPath, { encoding: 'UTF8' }));
    syncArraysOfKeyValueObject(summary.globals.values, globals.values);
    fs.writeFileSync(globalsPath, JSON.stringify(globals, null, 2));
  }
  function persistCollection(summary) {
    [
      {
        name: summary.globals.values.find(value => value.key === `e2e_restnest_collection_name`)
          .value,
        collection: summary.globals.values.find(
          value => value.key === `e2e_restnest_main_collection`
        ).value,
      },
      {
        name: summary.globals.values.find(
          value => value.key === `e2e_restnest_service_collection_name`
        ).value,
        collection: summary.globals.values.find(
          value => value.key === `e2e_restnest_main_service_collection`
        ).value,
      },
    ].forEach(bundle => {
      const e2eCollectionFilePath = resolve(
        e2eCollectionsPath,
        `${bundle.name}.postman_collection.json`
      );
      fs.writeFileSync(e2eCollectionFilePath, JSON.stringify(bundle.collection, null, 2));
      console.log(`\n ✅ -> ${bundle.name} downloaded successfully.`);
    });
  }
  function persistEnvironments(summary) {
    const environments = summary.globals.values.find(
      value => value.key === `all_e2e_environments`
    ).value;
    environments.forEach(env => {
      const e2eEnvironmentFilePath = resolve(
        environmentE2ePath,
        `${env.name}.postman_environment.json`
      );
      const e2eEnvironment = { name: env.name, values: env.values };
      fs.writeFileSync(e2eEnvironmentFilePath, JSON.stringify(e2eEnvironment, null, 2));
    });
    console.log('\n ✅ -> E2E main environments downloaded successfully.');
  }
}

async function main() {
  await prepPostmanSync(globalsBasePath, globalsPath);
  await runWorkspaceSyncLoader(environmentE2ePath, globalsFilename);
  await postmanE2EMainSync();
  console.log('\n ✅ -> E2E workspace main workspace synched completed.\n');
}
main();
