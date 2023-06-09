/**
 * Prep Postman Repo Workspace (e.g. restnest-postman-domain)
 * If Postman Repo not yet created, will create new workspace and fork all collections from restnest-openapi workspace
 */
const path = require('path');
const fs = require('fs');
const { newmanRun, syncArraysOfKeyValueObject } = require('./helper/utils');

const root = path.join(__dirname, '../../restnest-postman'); // restnest-postman root
const collectionsPath = path.join(root, 'collections');
const environmentsPathStandard = path.join(root, 'environments');
const globalsFilenameStandard = 'restnest-postman.postman_globals.json';
const globalsBaseFilenameStandard = 'restnest-postman.postman_globals.base.json';

// Download WorkspaceSync from OpenApi Postman Repo to run Repo-Prep
async function runOpenApiWorkspaceSyncLoader(globals) {
  const collectionLoaderPath = path.join(
    collectionsPath,
    'WorkspaceSyncLoader.postman_collection.json'
  );
  const options = {
    bail: true,
    color: 'on',
    collection: require(collectionLoaderPath),
    globals: globals,
    iterationCount: 1,
  };
  const isReporting = false; // change for debugging
  if (isReporting) {
    options.reporters = ['cli'];
  }
  try {
    summary = await newmanRun(options);
    const collection = summary.globals.values.find(
      value => value.key === `repo_workspacesync_collection`
    ).value;
    const collectionPath = path.join(collectionsPath, 'WorkspaceSync.postman_collection.json');
    fs.writeFileSync(collectionPath, JSON.stringify(collection, null, 2));
    console.log('\n ✅ -> OpenApi WorkspaceSync collection downloaded successfully.');
  } catch (error) {
    console.error('OpenApi WorkspaceSyncLoader could not complete: ', error);
    process.exit(1);
  }
}

// Run Repo Prep to create new Postman Repo for new domain
async function runOpenApiWorkspaceSync(
  globals,
  environmentsPath = environmentsPathStandard,
  globalsFilename = globalsFilenameStandard,
  globalsBaseFilename = globalsBaseFilenameStandard
) {
  const collectionPath = path.join(collectionsPath, 'WorkspaceSync.postman_collection.json');
  const globalsPath = path.join(environmentsPath, globalsFilename);
  const globalsBasePath = path.join(environmentsPath, globalsBaseFilename);
  const options = {
    bail: true,
    color: 'on',
    collection: require(collectionPath),
    globals: globals,
    folder: 'Repo-Prep',
    iterationCount: 1,
  };
  const isReporting = false; // change for debugging
  if (isReporting) {
    options.reporters = ['cli'];
  }
  try {
    summary = await newmanRun(options);
    persistGlobals(summary);
    persistBaseGlobals();
    console.log('\n ✅ -> OpenApi Repo prep completed successfully.');
  } catch (error) {
    console.error('OpenApi WorkspaceSync Repo-Prep could not complete: ', error);
    process.exit(1);
  }

  // helpers
  // Sync summary globals and persist
  function persistGlobals(summary) {
    if (summary) {
      const globals = JSON.parse(fs.readFileSync(globalsPath, { encoding: 'UTF8' }));
      syncArraysOfKeyValueObject(summary.globals.values, globals.values);
      fs.writeFileSync(globalsPath, JSON.stringify(globals, null, 2));
    } else {
      throw new Error('Could not persist globals because of missing collection run');
    }
  }
  // Persist repo name, id to base globals (git-maintained)
  function persistBaseGlobals() {
    const globals = JSON.parse(fs.readFileSync(globalsPath, { encoding: 'UTF8' }));
    const globalsBase = JSON.parse(fs.readFileSync(globalsBasePath, { encoding: 'UTF8' }));
    const repoWorkspaceId = globals.values.find(
      variable => variable.key === 'repo_workspace_id' && !variable.value.startsWith('<')
    )?.value;
    const repoWorkspaceName = globals.values.find(
      variable => variable.key === 'repo_workspace_name' && !variable.value.startsWith('<')
    )?.value;
    const repoWorkspaceSyncId = globals.values.find(
      variable => variable.key === 'repo_workspacesync_collection_id' && !variable.value.startsWith('<')
    )?.value; 
    const openapiRepoWorkspaceId = globalsBase.values.find(
      variable => variable.key === 'openapi_repo_workspace_id')?.value;
    if (!repoWorkspaceId || !repoWorkspaceName || !repoWorkspaceSyncId || !repoWorkspaceId === openapiRepoWorkspaceId) {
      throw new Error(
        'Global variables for repo workspace are missing or unexpected after OpenApi repo prep'
      );
    }
    globalsBase.values.find(variable => variable.key === 'repo_workspace_id').value = repoWorkspaceId;
    globalsBase.values.find(variable => variable.key === 'repo_workspace_name').value = repoWorkspaceName;
    globalsBase.values.find(variable => variable.key === 'repo_workspacesync_collection_id').value = repoWorkspaceSyncId;
    fs.writeFileSync(globalsBasePath, JSON.stringify(globalsBase, null, 2));
  }
}

// Main - coordinate OpenApi prep
async function main() {
  let isOpenApiPrep = false;
  try {
    // Load globals
    const globalsPath = path.join(environmentsPathStandard, globalsFilenameStandard);
    const globals = JSON.parse(fs.readFileSync(globalsPath, { encoding: 'UTF8' })).values;
    const repoWorkspaceId = globals.find(
      variable => variable.key === 'repo_workspace_id' && variable.value
    );
    const workspaceLoaderCollectionId = globals.find(
      variable => variable.key === 'repo_workspacesync_collection_id' && variable.value
    );
    if (!repoWorkspaceId || !workspaceLoaderCollectionId) {
      throw new Error(
        'Missing globals configuration variable for repo_workspace_id / repo_workspacesync_collection_id'
      );
    }

    // If openapi (workspace id is a comment), setup for download of loader from openapi repo
    isOpenApiPrep = repoWorkspaceId.value.startsWith('<');
    if (isOpenApiPrep) {
      // Globals for OpenApi workspace, WorkspaceSync collection
      const openapiLoaderCollectionId = globals.find(
        variable => variable.key === 'openapi_repo_workspacesync_collection_id' && variable.value
      )?.value;
      const openapiWorkspaceId = globals.find(
        variable => variable.key === 'openapi_repo_workspace_id' && variable.value
      )?.value;
      if (!openapiLoaderCollectionId || !openapiWorkspaceId) {
        throw new Error(
          'Missing globals configuration variable(s) for openapi_repo_workspacesync_collection_id, openapi_repo_workspace_id'
        );
      }

      // Load WorkspaceSync
      globals.find(variable => variable.key === 'repo_workspacesync_collection_id').value =
        openapiLoaderCollectionId;
      await runOpenApiWorkspaceSyncLoader(globals);

      // Run WorkspaceSync Repo-Prep
      globals.find(variable => variable.key === 'repo_workspace_id').value = openapiWorkspaceId;
      await runOpenApiWorkspaceSync(globals);
    } else {
      console.log('\n ✅ -> Postman Repo check completed.');
    }
  } catch (error) {
    console.error(`Could not prep Postman Repo: `, error);
    process.exit(1);
  }
}

main();
