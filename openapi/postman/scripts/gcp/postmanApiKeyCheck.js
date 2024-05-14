/**
 * GCP Cloud Sceret Manager Example
 * Each of the following modules relies on service secrets:
 *  openapi/postman/scripts/openAPISetupPostman.js
 *  scripts/newman/restnest-e2e-sync-scenario-suite.js
 *  scripts/restnest-postman-sync-repo.js
 *
 * Default simple local file secrets are maintained in:
 *  openapi/postman/environment/restnest-secrets.postman_globals.json
 *  restnest-postman/environments/restnest-secrets.postman_globals.json
 *
 * if to be actively used, simply call getGCPSecret below to retrieve and save the key locally
 * So no additional changes are required  in the 3 modules above.
 */
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');

async function getGCPSecret(secretKey = '', projectId = '') {
  let keyValue;
  try {
    const client = new SecretManagerServiceClient();
    keyValue = await accessSecretVersion(client, projectId, secretKey);
  } catch (err) {
    console.error(
      `Error getting key ${secretKey} from secrets manager for GCP Service Account ${projectId}`,
      err
    );
  }
  return keyValue;

  // Helper
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
}

// test
// getGCPSecret();

// For use in scripts/restnest-postman-sync-repo.js
module.exports.getGCPSecret = getGCPSecret;
