/**
 * Local Secrets helper scripts
 *
 * Default simple local file secrets (globalsSecretsPath) are maintained in:
 *  openapi/postman/environment/restnest-secrets.postman_globals.json
 *  restnest-postman/environments/restnest-secrets.postman_globals.json
 *
 * The respectve restnest-secrets.postman_globals.base.json files determine expected keys, and are copied to above files on setup
 */
const fs = require('fs');
const prompt = require('prompt-sync')();

// Get/Set all local secrets - check that all keys are in base, otherwise throw error
function getAllLocalSecrets(
  globalsSecretsBasePath,
  globalsSecretsPath,
  isUsingCloudForSecrets,
  isPrompting = true
) {
  let localSecrets;
  try {
    localSecrets = JSON.parse(fs.readFileSync(globalsSecretsPath, { encoding: 'UTF8' }));
  } catch (e) {
    try {
      localSecrets = JSON.parse(fs.readFileSync(globalsSecretsBasePath, { encoding: 'UTF8' }));
      if (!isUsingCloudForSecrets) {
        console.log('\n ✅ -> Other api key secrets required.');
        // Loop expected secrets (no placeholder char < in key)
        localSecrets.values.forEach(secret => {
          if (!secret.key.startsWith('<') && secret.value.startsWith('<')) {
            // If prompting, ask
            if (isPrompting) {
              const secretPrompt = `Please enter the secret value for ${secret.key}:`;
              secret.value = prompt(secretPrompt);
            // Otherwise, try lookup in the local environment
            } else {
              const envKey = secret.key.split('-').join('_');
              secret.value = process.env[envKey];
            }
            if (!secret.value) {
              throw new Error(`Secret value for ${secret.key} is required.`);
            }
          }
        });
      }
      fs.writeFileSync(globalsSecretsPath, JSON.stringify(localSecrets, null, 2));
    } catch (e) {
      console.error('Problem getting secret:', e);
      throw new Error(`Required ${globalsSecretsPath} could not be created or read.`);
    }
  }
  return localSecrets;
}
// Get/Write local secret
function getLocalSecret(globalSecrets, secretKey = '') {
  let secretValue;
  globalSecrets.values.forEach(global => {
    if (global.key === secretKey && !global.value.startsWith('<')) {
      secretValue = global.value;
    }
  });
  return secretValue;
}
function writeLocalSecret(globalsSecretsPath, globalSecrets, secretKey = '', secretValue = '') {
  globalSecrets.values.forEach(global => {
    if (global.key === secretKey) {
      global.value = secretValue;
    }
  });
  fs.writeFileSync(globalsSecretsPath, JSON.stringify(globalSecrets, null, 2));
}

module.exports.getAllLocalSecrets = getAllLocalSecrets;
module.exports.getLocalSecret = getLocalSecret;
module.exports.writeLocalSecret = writeLocalSecret;
