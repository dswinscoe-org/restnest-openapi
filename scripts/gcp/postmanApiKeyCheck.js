const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');

async function check() {
    const projectId = 'api-project-728156133227';
    let postman_api_key_admin = '';
    try {
      const client = new SecretManagerServiceClient();
      postman_api_key_admin = await accessSecretVersion(client, projectId, 'postman_apikey');
      console.log('postman-apikey:', postman_api_key_admin)
    } catch (err) {
      console.error(
        `Error getting keys from secrets manager for GCP Service Account ${projectId}`,
        err
      );
    }

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

check();