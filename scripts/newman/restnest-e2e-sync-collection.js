/**
 * Newman script to create and populate the E2E workspace
 * See restnest-postman/environments/restnest-postman.postman_globals.base.json
 */
const { program } = require('commander');
const path = require('path');
const fs = require('fs');
const { newmanRun, syncArraysOfKeyValueObject } = require('./helper/utils');
const { augmentCollectionWithServices } = require('./restnest-e2e-augment-collection');

// Check for program parameters
program
  .name('restnest-e2e-sync-collection')
  .option('-d, --downloadonly', 'Collection Sync Download Only')
  .option('-m, --mainonly', 'Collection Sync Main Only')
  .parse(process.argv);
const options = program.opts();
const isDownloadOnly = options.downloadonly !== undefined;
const isMainOnly = options.mainonly !== undefined;

// Repo and e2e collection paths setup
const repoRoot = path.join(__dirname, '../../restnest-postman'); // restnest-postman root
const collectionsPath = path.join(repoRoot, 'collections');
const environmentsPath = path.join(repoRoot, 'environments');
const e2e_collectionPath = path.join(__dirname, '../../restnest-e2e/collection');
const collectionPath = path.join(collectionsPath, 'WorkspaceSync.postman_collection.json');
const globalsPath = path.join(environmentsPath, 'restnest-postman.postman_globals.json');

// Runs a series of newman processes for each E2E-Collections-* folder in WorkspaceSync collection
async function runAsyncCollections() {
  try {
    // Fork sync main restnest collection
    let mainCollectionsRun;
    if (isMainOnly || !isDownloadOnly) {
      mainCollectionsRun = await runCollection('E2E-Collections-Main');
      persistGlobals(mainCollectionsRun);
      persistCollection(mainCollectionsRun);
      console.log(
        `\n ✅ -> WorkspaceSync/${mainCollectionsRun.folder} forked/synched successfully.\n`
      );
    }

    // Sync dev's restnest collection
    let devCollectionsRun;
    if (!isMainOnly) {
      devCollectionsRun = await runCollection('E2E-Collections-Dev');
      persistGlobals(devCollectionsRun);
      console.log(
        `\n ✅ -> WorkspaceSync/${devCollectionsRun.folder} ${isDownloadOnly ? '': 'forked/'}synched successfully.\n`
      );
    }

    // Sync dev's restnest service collection
    let devServiceCollectionsRun;
    if (!isMainOnly && !isDownloadOnly) {
      devServiceCollectionsRun = await runCollection('E2E-Service-Collections-Dev');
      persistGlobals(devServiceCollectionsRun);
      persistCollection(devServiceCollectionsRun);
      console.log(
        `\n ✅ -> WorkspaceSync/${devServiceCollectionsRun.folder} synched successfully.\n`
      );
    }

    // Update and re-sync dev's restnest collection
    if (!isMainOnly) {
      if (isCollectionToBeAugmented(devCollectionsRun)) {
        augmentCollections(devCollectionsRun, devServiceCollectionsRun);
        persistGlobals(devCollectionsRun);
        persistCollection(devCollectionsRun);
        const isToBeUpdated = true; // For testing w/o update
        if (isToBeUpdated) {
          const devCollectionUpdateRun = await runCollection('E2E-Collection-Dev');
          persistGlobals(devCollectionUpdateRun);
          console.log(
            `\n ✅ -> WorkspaceSync/${devCollectionUpdateRun.folder} collection updated.\n`
          );

          // Sync dev's updated restnest collection
          const devCollectionReloadRun = await runCollection('E2E-Collections-Dev');
          persistGlobals(devCollectionReloadRun);
          persistCollection(devCollectionReloadRun);
          console.log(
            `\n ✅ -> WorkspaceSync/${devCollectionReloadRun.folder} collection synched.\n`
          );
        }
      } else {
        persistCollection(devCollectionsRun);
      }
    }
  } catch (error) {
    console.error(error);
    process.exit(1);
  }

  // helpers
  // Run the collection folder and return run summary
  async function runCollection(folder) {
    const options = {
      bail: true,
      color: 'on',
      collection: require(collectionPath),
      globals: JSON.parse(fs.readFileSync(globalsPath, { encoding: 'UTF8' })),
      folder: folder,
      iterationCount: 1,
    };
    const isReporting = false; // change for debugging
    if (isReporting) {
      options.reporters = ['cli'];
    }
    return {
      folder: folder,
      summary: await newmanRun(options),
    };
  }

  // Determine if workspace collection should be augmented at this time (curently only developer)
  function isCollectionToBeAugmented(run) {
    const collection = getRunCollection(run);
    return !isMainOnly && !isDownloadOnly && collection && run.folder === 'E2E-Collections-Dev';
  }

  // Augment restnest collections with newest service collection
  function augmentCollections(collectionRun, serviceCollectionRun) {
    const collection = getRunCollection(collectionRun);
    const serviceCollection = getRunCollection(serviceCollectionRun);
    if (collection && serviceCollection) {
      resetRunCollection(
        collectionRun,
        augmentCollectionWithServices(collection, serviceCollection)
      );
    } else {
      throw new Error(`Could not augment collection from WorkspaceSync/${collectionRun.folder}`);
    }
  }

  // Persist workspace collection summary GET payload
  function persistCollection(run) {
    const collection = getRunCollection(run);
    const restnestCollectionName = collection?.info?.name.replace(/-[0-9]*-[a-z0-9]*$/g, '');
    if (collection && restnestCollectionName) {
      const restnestCollectionFullname = `${restnestCollectionName}.postman_collection.json`;
      const workspace = run.folder.endsWith('-Main') ? 'main' : 'developer';
      const collectionPath = path.join(e2e_collectionPath, workspace, restnestCollectionFullname);
      fs.writeFileSync(collectionPath, JSON.stringify(collection, null, 2));
    } else {
      throw new Error(`Could not persist collection from WorkspaceSync/${run.folder}`);
    }
  }

  // Summary collection Getter/Setter
  function getRunCollection(run) {
    const collectionVarName = getGlobalCollectionVariableName(run);
    return run?.summary.globals.values.find(value => value.key === collectionVarName)?.value;
  }
  function resetRunCollection(run, collection) {
    const collectionVarName = getGlobalCollectionVariableName(run);
    run.summary.globals.values.find(value => value.key === collectionVarName).value = collection;
  }
  function getGlobalCollectionVariableName(run) {
    let varName;
    if (run) {
      switch (run.folder) {
        case 'E2E-Collections-Main': {
          varName = 'e2e_restnest_main_collection';
          break;
        }
        case 'E2E-Service-Collections-Dev': {
          varName = 'e2e_restnest_developer_service_collection';
          break;
        }
        case 'E2E-Collections-Dev': {
          varName = 'e2e_restnest_developer_collection';
          break;
        }
      }
    }
    return varName;
  }

  // Sync summary globals and persist
  function persistGlobals(run) {
    if (run.summary) {
      const globals = JSON.parse(fs.readFileSync(globalsPath, { encoding: 'UTF8' }));
      syncArraysOfKeyValueObject(run.summary.globals.values, globals.values);
      fs.writeFileSync(globalsPath, JSON.stringify(globals, null, 2));
    } else {
      throw new Error('Could not persist globals because of missing collection run');
    }
  }
}

// Main
runAsyncCollections();
