/**
 * Scenario Server - Express Server for Postman/Newman
 */
const express = require('express');
const { errorHandler, logErrors } = require('./nestServer/util');
const { workflowMeta, workflowStep, gruntTrigger, triggeredRunReport } = require('./nestServer/scenarioRoutes');

// Express Setup
const port = 3000;
const app = express();
const startDate = Date.now();
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '50mb' })); // Body parser use JSON data

// ScenarioServer health & on ?postman_request_id, workstep metadata from collection for Postman variables (globals)
app.get('/', function (req, res, next) {
  workflowMeta(startDate, req, res, next);
});

// Workflow prep step endpoint
app.get('/workflowStep*', async (req, res, next) => {
  workflowStep(req, res, next);
});

// Trigger grunt watcher task launcher
app.post('/trigger*', (req, res, next) => {
  gruntTrigger(req, res, next);
});

// Get triggered run test report 
app.get('/report*', (req, res, next) => {
  triggeredRunReport(req, res, next);
});

// Register Error Handlers & Listen
app.use(logErrors);
app.use(errorHandler);
app.listen(port);
console.log(`Scenario Server started on port ${port} ...`);
