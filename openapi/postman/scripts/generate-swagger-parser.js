#!/usr/bin/env node
const SwaggerParser = require('@apidevtools/swagger-parser');
const { writeFileSync } = require('fs');
const { basename, extname, resolve } = require('path');
const glob = require('glob');
const yaml = require('js-yaml');

const isStandalone = process.argv.indexOf('-s') !== -1;

// Generate no-reference OpenAPI spec from originally configured spec
const generateSpec = (module.exports.generateSpec = async function (
  configFilePath,
  outputFilePath
) {
  let api;
  let isGenerated = true;
  try {
    api = await SwaggerParser.dereference(configFilePath, {
      dereference: {
        circular: 'ignore',
      },
      resolve: {
        external: false,
      },
    });
  } catch (err) {
    console.error('Error generating:', err);
    isGenerated = false;
  }
  if (api)
    try {
      const doc = yaml.load(JSON.stringify(api));
      if (doc.components) {
        if (doc.components.schemas) {
          delete doc.components.schemas;
        }
        if (doc.components.responses) {
          delete doc.components.responses;
        }
        if (doc.components.parameters) {
          delete doc.components.parameters;
        }
      }
      writeFileSync(outputFilePath, yaml.dump(doc));
      console.log('\n ✅ -> Generated %s, Version: %s\n', api.info.title, api.info.version);
    } catch (err) {
      console.error('Error writing generated spec:', err);
      isGenerated = false;
    }
  return { isGenerated: isGenerated };
});

// Generate all specs (assumes openapi/config and generated-specs sub-folders)
async function generateAllSpecs() {
  console.log('Generating all OpenAPI specs ...');
  glob.sync(resolve(__dirname, '../../**/config/*.{yaml,json}')).forEach(async file => {
    const outputFile = resolve(
      __dirname,
      '../../generated-specs/',
      `${basename(file, extname(file))}.yaml`
    );
    let { isGenerated } = await generateSpec(file, outputFile);
    if (!isGenerated) {
      process.exit(1);
    }
  });
}

if (isStandalone) {
  generateAllSpecs();
}
