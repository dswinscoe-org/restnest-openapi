const { file } = require('grunt');

module.exports = function (grunt) {
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    express: {
      scenarioServerDebug: {
        options: {
          hardStop: true,
          script: 'scripts/scenarioServer.js',
          debug: true,
        },
      },
      scenarioServer: {
        options: {
          hardStop: true,
          script: 'scripts/scenarioServer.js',
        },
      },
    },
    env: {
      node: {
        NODE_OPTIONS: '--max_old_space_size=5120',
      },
    },
    clean: {
      triggers: ['scripts/nestServer/triggers/*.json'],
    },
    run: {
      options: {
        stderr: true,
        stdout: true,
        failOnError: true,
      },
      trigger: {
        args: [''],
        options: {
          cwd: 'scripts/newman',
        },
      },
      script: {
        args: [''],
        options: {
          cwd: 'scripts/newman',
        },
      },
    },
    watch: {
      triggers_sync: {
        files: [
          'scripts/nestServer/triggers/*_quickSync.json',
          'scripts/nestServer/triggers/*_syncCollections.json',
        ],
        tasks: ['env:node', 'run:trigger', 'clearChangedFiles', 'scenarioStart'],
        options: {
          spawn: false,
        },
      },
      triggers_scenario: {
        files: ['scripts/nestServer/triggers/*_scenario.json'],
        tasks: ['env:node', 'run:trigger', 'clearChangedFiles'],
        options: {
          spawn: false,
        },
      },
    },
  });

  grunt.loadNpmTasks('grunt-express-server');
  grunt.loadNpmTasks('grunt-run');
  grunt.loadNpmTasks('grunt-env');
  grunt.loadNpmTasks('grunt-contrib-watch');
  grunt.loadNpmTasks('grunt-contrib-clean');

  // Scenario Server
  grunt.registerTask('scenarioStartDebug', [
    'express:scenarioServerDebug:stop',
    'express:scenarioServerDebug',
  ]);
  grunt.registerTask('scenarioStart', ['express:scenarioServer:stop', 'express:scenarioServer']);
  grunt.registerTask('scenarioServerDebug', ['scenarioStartDebug', 'watch']);
  grunt.registerTask('default', ['scenarioStart', 'watch']);

  /**
   * Suite Setup for pipeline run
   * Note: one suite per pipeline run w/ multiple triggers/scenarios
   * Required parameters:
   *  folderId - Postman folder id (not UID)
   *  environment - DEV,STAGING, etc.
   *  collection - developer or main
   **/
  grunt.registerTask('runSuite', [
    'env:node',
    'runSuitePrep',
    'scenarioStart',
    'runSuiteLauncher',
    'runSuiteScenarios',
  ]);
  // Sync main collection / environments for pipeline run
  grunt.registerTask('runSuitePrep', function () {
    grunt.config('run.script.args', ['restnest-e2e-sync-scenario-suite.js']);
    grunt.task.run('clean:triggers');
    grunt.task.run('run:script');
  });
  // Newman run of Postman collection /Triggers folderId
  grunt.registerTask('runSuiteLauncher', function () {
    const folderId = grunt.option('folderId');
    const env = grunt.option('env') || 'DEV';
    const collection = grunt.option('collection') || 'main';
    grunt.config('run.script.args', [
      'restnest-scenario-suite-launcher.js',
      `--folderId=${folderId}`,
      `--environment=${env}`,
      `--collection=${collection}`,
    ]);
    grunt.task.run('run:script');
  });
  grunt.registerTask('runSuiteScenarios', function () {
    const scenarios = grunt.file.expand('scripts/nestServer/triggers/*_scenario.json');
    grunt.config('run.script.args', [
      'restnest-scenario-suite.js',
      ...scenarios.map((file, index) => `--scenario${index}=${file}`),
    ]);
    grunt.task.run('run:script');
  });

  /**
   *  Triggers Setup - developer collection ONLY
   *  - see package.json: yarn restnest:startServer (with watch)
   **/
  let changedFiles = Object.create(null);
  grunt.registerTask('clearChangedFiles', function () {
    changedFiles = Object.create(null);
  });
  grunt.event.on('watch', function (action, filepath) {
    if (filepath.indexOf('_') > -1) {
      changedFiles[filepath] = action;
      const scriptName = `${filepath.split('_')[1].split('.')[0]}`;
      switch (scriptName) {
        // RESTNEST scenario trigger for multiple scenario runs
        case 'scenario': {
          grunt.config('run.trigger.args', [
            'restnest-scenario-suite.js',
            ...Object.keys(changedFiles).map((key, index) => `--scenario${index}=${key}`),
          ]);
          break;
        }
        // Download dev/main collections
        case 'quickSync': {
          grunt.config('run.trigger.args', ['restnest-e2e-sync-collection.js', '--downloadonly']);
          break;
        }
        // Download, augment, upload dev/main collections
        case 'syncCollections': {
          grunt.config('run.trigger.args', ['restnest-e2e-sync-collection.js']);
          break;
        }
        default:
          console.error(`\nTrigger script ${scriptName} unknown`);
      }
    }
  });
};
