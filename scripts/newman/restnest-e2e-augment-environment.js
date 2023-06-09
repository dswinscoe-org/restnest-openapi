/**
 * Collates restnest-postman environments and populates restnest-e2e environments and globals
 *
 */
const { basename, resolve } = require('path');
const fs = require('fs');
const glob = require('glob');

const repo_environmentsDir = resolve(__dirname, '../../restnest-postman/environments');
const repo_environmentsPath = resolve(repo_environmentsDir, '*.postman_environment.json');
const e2e_environmentDir = resolve(__dirname, '../../restnest-e2e/environment');

// Augment and transform all service environments downloaded from postman repo
function augmentEnvironments() {
  const e2e_baseName = 'restnest-e2e';
  const e2e_environmentName = `${e2e_baseName}.postman_environment.json`;
  const e2e_environmentBaseFilePath = resolve(e2e_environmentDir, e2e_environmentName);
  const e2e_environment = require(e2e_environmentBaseFilePath); // base file for all environments

  const expectedStages = { 'PR-1': true, PR1: true, DEV: true, SANDBOX: true, STAGING: true };
  const newEnvTemplate = { name: '', values: [], isPublic: false };

  createEmptyEnvironments();
  return createAllE2Environments();

  // helpers
  function createEmptyEnvironments() {
    Object.keys(expectedStages).forEach( stageKey => {
      // PR1, instead of PR-1
      if (!stageKey.includes('-')) { 
        const stageName = stageKey.replace('-', '');
        const newEnv = { ...newEnvTemplate, ...{name: `${stageName}.${e2e_baseName}`}};
        newEnv.values = [...e2e_environment.values];
        const newEnvFilePath = resolve(e2e_environmentDir, `${stageName}.${e2e_environmentName}`);
        fs.writeFileSync(newEnvFilePath, JSON.stringify(newEnv, null, 2));
      }
    })
  }

  // Loop through all repos and augment environment
  function createAllE2Environments() {
    const envList = [];
    glob.sync(repo_environmentsPath).forEach(envFilePath => {
      const envRepoValues = require(envFilePath).values;

      // Setup for collated variable naming, e.g. baseUrl/serviceName
      const envName = basename(envFilePath, '.json');
      const envNameSplit = envName.split('.');
      envNameSplit.splice(-1, 1);
      const stageNameRaw = envNameSplit.shift();
      const stageName = stageNameRaw.replace('-', '');
      const serviceName = envNameSplit.join('.');

      // Copy and rename all repo environments - for recognized stages (PR1, DEV, etc.) only
      const envE2EValues = [];
      if (stageName in expectedStages) {
        envRepoValues.forEach(value => {
          value.key = `${value.key}/${serviceName}`;
          envE2EValues.push(value);
        });
        const collatedEnvFilePath = resolve(e2e_environmentDir, `${stageName}.${e2e_environmentName}`);
        const collatedEnv = JSON.parse(fs.readFileSync(collatedEnvFilePath, 'utf8'));
        envE2EValues.forEach( newValue => {
          if (!collatedEnv.values.find( value => value.key === newValue.key)) {
            collatedEnv.values.push(newValue);
          }
        })
        fs.writeFileSync(collatedEnvFilePath, JSON.stringify(collatedEnv, null, 2));
        const env = envList.find( env => env.name === `${stageName}.${e2e_baseName}`);
        if (env) {
          env.values = [...env.values, ...envE2EValues]
        } else {
          envList.push(collatedEnv);
        }

      // Unrecognized stage
      } else {
        console.warn(
          `❗ Repo restnest-postman/environment/${envName} ignored`
        );
      }
    });

    console.log(`\n ✅ -> ${e2e_baseName} environments generated `);
    return envList;
  }
}

// For use in Newman script, e.g. restnest-e2e-sync-environment.js
module.exports.augmentEnvironments = augmentEnvironments;
