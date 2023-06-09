/**
 * DEV Setup: Prepares restnest-postman environments global variables for ./newman/restnest-postman-sync-*.js, e.g. apikey from gcp service, etc.
 * Newman ./newman/restnest-postman-sync-*.js scripts download all workspace collections and environments
 */
const { resolve } = require('path');
const fs = require('fs');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const prompt = require('prompt-sync')({ sigint: true });

const gitOrigin = process.env.GIT_ORIGIN || '';
const gitFeature = process.env.GIT_FEATURE || '';
// Check Repo for pre-requisites and fail if not met
if (!(gitOrigin && gitFeature)) {
  console.error('Current repository does not have a remote origin and/or is not feature branch.');
  process.exit(1);
}
const gitOriginSplit = gitOrigin.split('/');
const gitRepoName = gitOriginSplit[gitOriginSplit.length - 1];
if (!gitRepoName.startsWith('restnest-openapi-')) {
  console.error(
    `GIT_ORIGIN repo name ${gitRepoName} does not conform - expected forked restnest-openapi-[domainName]`
  );
  process.exit(1);
}
const taskNrSplit = gitFeature.replace('-', '/').split('/');
const taskNr = taskNrSplit.length > 1 ? taskNrSplit[1] : '';
if (!taskNr) {
  console.error(
    `GIT_FEATURE env variable unrecognizable  - expected, e.g. feature/123456/this-branch or refresh/main.`
  );
  process.exit(1);
}

const environmentDir = resolve(__dirname, '../restnest-postman/environments');
const globalsBasePath = resolve(environmentDir, 'restnest-postman.postman_globals.base.json');
const globalsMainPath = resolve(
  environmentDir,
  'restnest-postman.postman_globals.main.json'
);
const globalsPath = resolve(environmentDir, 'restnest-postman.postman_globals.json');

/**
 * Prepare globals with collection/environments from Postman RESTNEST E2E Test Workspace sync
 * NOTE: Gets postman api key for ./newman/restnest-postman-sync-prep.js - requires gcloud access to configured service account
 */
async function prepPostmanSync(globalsBasePath, globalsPath, gitRepoName, taskNr) {
  let postman_api_key_developer = '';
  const isMain = taskNr === 'main';
  try {
    if (!isMain) {
      console.log(
        `\n ✅ -> Preparing for Postman Sync with git repo ${gitRepoName}, feature task ${taskNr} ...`
      );
      // Try first to get it from globals from previous run (require new prompt after main run)
      let isMainRunDetected = false;
      let isDevRunDetected = false;
      try {
        isMainRunDetected = fs.statSync(globalsMainPath).isFile();
      } catch {}
      try {
        isDevRunDetected = fs.statSync(globalsPath).isFile();
      } catch {}
      if (isDevRunDetected && !isMainRunDetected) {
        const globalsOld = JSON.parse(fs.readFileSync(globalsPath, { encoding: 'UTF8' }));
        postman_api_key_developer = (
          globalsOld.values.find(
            global => global.key === 'postman-api-key-developer' && !global.value.startsWith('<')
          ) || {
            value: '',
          }
        ).value;
      } else if (isMainRunDetected) {
        fs.unlinkSync(globalsMainPath);
      }

      // Prompt for api key if not found
      if (!postman_api_key_developer) {
        console.log(
          '\n ✅ -> Postman API Key required - see https://*.postman.co/settings/me/api-keys'
        );
        postman_api_key_developer = prompt('Please enter your Postman API Key:');
        if (!postman_api_key_developer) {
          throw new Error('Developer Postman API Key is required');
        }
      }

      // If main, set marker to avoid reuse of admin key in developement
    } else {
      fs.copyFileSync(globalsBasePath, globalsMainPath);
    }
  } catch (err) {
    console.error('Error setting postman_api_key:', err);
    process.exit(1);
  }

  // Prepare globals for synchronization/augmentation run
  try {
    // Copy globals.base to globals
    fs.copyFileSync(globalsBasePath, globalsPath);
    const globals = require(globalsPath);

    // Configure required projectId for GCP
    const projectId = (
      globals.values.find(global => global.key === 'gcp-service-account-project' && !global.value.startsWith('<') ) || { value: '' }
    ).value;
    if (!projectId) {
      console.error(
        `Expected GCP Project Id value to be set in globals gcp-service-account-project variable`,
        err
      );
      process.exit(1);
    }  

    // Get Postman ApiKey from configured GCP service account
    let postman_api_key_admin = '';
    try {
      const client = new SecretManagerServiceClient();
      postman_api_key_admin = await accessSecretVersion(client, projectId, 'postman_apikey');
    } catch (err) {
      console.error(
        `Error getting keys from secrets manager for GCP Service Account ${projectId}`,
        err
      );
      fillGlobal(globals, postman_api_key_admin, postman_api_key_developer, gitRepoName, taskNr);
      process.exit(1);
    }

    // Check if main, and set postman-api-key-developer to admin
    if (isMain) {
      postman_api_key_developer = postman_api_key_admin;
    }

    // Set & write globals
    fillGlobal(globals, postman_api_key_admin, postman_api_key_developer, gitRepoName, taskNr);
  } catch (err) {
    console.error('Error updating globals for synchronization/augmentation run:', err);
    process.exit(1);
  }

  // helpers
  // Lookup secret in GCP Secret Manager (Service Account Project requires access)
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

  // Set & write globals
  function fillGlobal(globals, postman_api_key_admin, postman_api_key_developer, gitRepoName, taskNr) {
    const isAdmin = postman_api_key_developer === postman_api_key_admin;
    globals.values.forEach(global => {
      if (global.key === 'postman-api-key') {
        global.value = isAdmin ? postman_api_key_admin : postman_api_key_developer;
      } else if (global.key === 'postman-api-key-admin') {
        global.value = postman_api_key_admin;
      } else if (global.key === 'postman-api-key-developer') {
        global.value = postman_api_key_developer;
      } else if (global.key === 'e2e_git_repo_name') {
        global.value = gitRepoName;
      } else if (global.key === 'e2e_git_repo_feature_task') {
        global.value = taskNr;
      } else if (global.key === 'repo_workspace_name') {
        const postmanRepoName = gitRepoName.replace('restnest-openapi-', 'restnest-postman-');
        const postmanRepoNameSplit = postmanRepoName.split('-');
        if (postmanRepoNameSplit.length !== 3) {
          throw new Error('Postman Repo name does not conform to naming standard: restnest-openapi-domain');
        } else if (global.value.startsWith('<')) {
          global.value = postmanRepoName;
        }
      }
    });
    fs.writeFileSync(globalsPath, JSON.stringify(globals, null, 2));
    // Make sure we got the api key, and report repo status
    if (postman_api_key_admin) {
      const workspaceName = (
        globals.values.find(global => global.key === 'repo_workspace_name') || { value: '' }
      ).value;
      const workspaceId = (
        globals.values.find(global => global.key === 'repo_workspace_id') || { value: '' }
      ).value;
      if (!workspaceName || !workspaceId) {
        throw new Error(
          'Could not prep for workspace sync due to missing global variables repo_workspace_name / repo_workspace_id'
        );
      }
      const isOpenApiPrep = workspaceName.startsWith('<') || workspaceId.startsWith('<');
      if (isOpenApiPrep) {
        console.log(`\n ✅ -> Prepared for Postman OpenApi workspace sync with new repo ${workspaceName}.\n`);
      } else {
        console.log(`\n ✅ -> Prepared for sync from Postman repo workspace ${workspaceName}.\n`);
      }
    }
  }
}

async function main() {
  prepPostmanSync(globalsBasePath, globalsPath, gitRepoName, taskNr);
}
main();
