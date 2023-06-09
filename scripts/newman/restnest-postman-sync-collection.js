/**
 * Downloads WorkspaceSync collection from Postman repo restnest-postman
 */
const { program } = require('commander');
const path = require('path');
const fs = require('fs');
const { newmanRun } = require('./helper/utils');

// Check for program parameters
program
  .name('restnest-postman-sync-collection')
  .version('1.0', '-v, --version')
  .option('-s, --standalone', 'Collection sync standalone')
  .parse(process.argv);
const options = program.opts();
const isStandalone = options.standalone !== undefined;

const root = path.join(__dirname, '../../restnest-postman'); // restnest-postman root
const collectionsPath = path.join(root, 'collections');
const environmentsPathStandard = path.join(root, 'environments');
const globalsFilenameStandard = 'restnest-postman.postman_globals.json';

const runWorkspaceSyncLoader = (exports.runWorkspaceSyncLoader = async function (
  environmentsPath = environmentsPathStandard,
  globalsFilename = globalsFilenameStandard
) {
  const collectionLoaderPath = path.join(
    collectionsPath,
    'WorkspaceSyncLoader.postman_collection.json'
  );
  const collectionPath = path.join(collectionsPath, 'WorkspaceSync.postman_collection.json');
  const globalsPath = path.join(environmentsPath, globalsFilename);
  try {
    summary = await newmanRun({
      bail: true,
      color: 'on',
      collection: require(collectionLoaderPath),
      globals: JSON.parse(fs.readFileSync(globalsPath, { encoding: 'UTF8' })),
      iterationCount: 1,
    });
    // Persist
    const collection = summary.globals.values.find(
      value => value.key === `repo_workspacesync_collection`
    ).value;
    fs.writeFileSync(collectionPath, JSON.stringify(collection, null, 2));
    console.log('\n ✅ -> WorkspaceSync collection downloaded successfully.');
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
});

if (isStandalone) {
  runWorkspaceSyncLoader();
}
