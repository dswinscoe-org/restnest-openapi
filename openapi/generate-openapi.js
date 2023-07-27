#!/usr/bin/env node

const { readFileSync, writeFileSync } = require('fs');
const { basename, extname, resolve } = require('path');
const { spawnSync } = require('child_process');
const glob = require('glob');
const yaml = require('js-yaml');

// colors for console output
const red = '\x1b[31m';
const green = '\x1b[32m';
const colorReset = '\x1b[0m';

const dereference = process.argv.indexOf('-r') !== -1;

(async () => {
  let exitState = 0;

  glob.sync(resolve(__dirname, '**/config/*.{yaml,json}')).forEach(file => {
    let color = '';
    const outputFile = resolve(`${__dirname}/generated-specs/`, `${basename(file, extname(file))}.yaml`);

    console.log(`\n\n 🐥 -> Generating OpenAPI spec ${file}`);

    const { output, status } =
      process.platform === 'win32'
        ? spawnSync(
            resolve(__dirname, '../node_modules/.bin/swagger-cli.cmd'),
            ['bundle', file, dereference ? '-r' : null, '-o', outputFile, '-t', 'yaml'].filter(
              option => !!option
            )
          )
        : spawnSync(
            resolve(__dirname, '../node_modules/.bin/swagger-cli'),
            ['bundle', file, dereference ? '-r' : null, '-o', outputFile, '-t', 'yaml'].filter(
              option => !!option
            )
          );

    const doc = yaml.load(readFileSync(outputFile));

    if (dereference && status === 0) {
      // remove some unneeded components from the generated/dereferenced api spec
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
      writeFileSync(outputFile, yaml.dump(doc));
    }

    if (status !== 0) {
      exitState = status;
      color = red;
    } else {
      color = green;
    }
    console.log(
      color,
      output.map(resultBuff => (resultBuff ? resultBuff.toString().trim() : null)).join(''),
      colorReset
    );
  });

  process.exit(exitState);
})();
