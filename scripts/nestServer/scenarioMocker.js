/* Scenario Mocker - workstep configuration-driven */
const jsf = require('json-schema-faker');
const { faker } = require('@faker-js/faker');
const set = require('set-value');
const unset = require('unset-value');
const get = require('get-value');
const { getMetaGlobals } = require('./scenarioUtil');

/**
 * Workstep mock utililty
 * @param {object} workstepParams - query params
 */
module.exports.mocker = async function (workstepParams) {
  const globals = getMetaGlobals(workstepParams);

  // Faker Map
  const fakerMap = {};
  const fakerTypes = Object.keys(faker).filter(key => faker[key]['faker']);
  fakerTypes.forEach(fakerType => {
    fakerNames = Object.keys(faker[fakerType]).filter(
      fakerName => typeof faker[fakerType][fakerName] === 'function'
    );
    fakerNames.forEach(fakerName => {
      const fakerValue = `$$faker.${fakerType}.${fakerName}()$$`; // Wrapped in $$ for mixed text
      fakerMap[fakerValue] = faker[fakerType][fakerName];
    });
  });

  // Faker setup
  const isLocaleUnresolved =
    !workstepParams._localeMock || workstepParams._localeMock?.startsWith('{{');
  faker.locale = `${isLocaleUnresolved ? 'de' : workstepParams._localeMock}`;
  jsf.option({ useDefaultValue: true, alwaysFakeOptionals: true});
  jsf.extend('faker', () => {
    return faker;
  });

  // Create mock
  let mock = {};
  try {

    // Check for objectMock (Response Example for static data)
    let objectMock;
    const workstepExamples = globals.find(variable => variable.key === 'workstep_responses');
    if (workstepExamples) {
      objectMock = workstepExamples.value.find(variable => variable.key === 'objectMock');
    }

    // Get mockSchema
    let mockSchema = globals.find(globalVar => globalVar.key === 'workstep_schemas')?.value?.request;
    if (!mockSchema) {
      throw new Error('Globals workstep_schema not found.')
    }
    // if oneOf schema, check workstepParams for which is used, otherwise select first
    if (mockSchema.oneOf) {
      const oneSchema = mockSchema.oneOf.filter((schema, schemaIndex) => {
        return !!Object.keys(workstepParams).find(
          key => key.startsWith(`_${schemaIndex}.`) && key.endsWith('_mock')
        );
      });
      if (oneSchema.length === 1) {
        mockSchema = oneSchema[0];
      } else {
        mockSchema = mockSchema.oneOf[0];
      }
    }
    const genMock = jsf.generate(mockSchema);

    /**
     * Check objectMock for workstep example reference
     * If example found, use it as mock base or if workstep prep-only (sticky prep), use schema-generated mock
     * Otherwise, return name of unresolved objectMock (example or previous request reference)
     * - Note: in this case, only query param "_mocked" fields values will be added to mock below, and
     * - if the previous request is in the environment, it will be used in Postman, and the mocked values will be added
     */
    if (objectMock) {
      const mockObject = workstepExamples.value.find(variable => variable.key === objectMock.value);
      mock = mockObject?.value
        ? JSON.parse(mockObject.value)
        : workstepParams._workstep_prepOnly === 'true'
        ? genMock
        : { _unresolvedObjectmock: `${objectMock.value}` };
      // No objectMock found, so set mock to schema-generated mock from schema
    } else {
      mock = genMock;
    }

    // Update mock with mocker fields / fakers
    const mockerFieldValues = [];
    // filter all mock field params
    const mockerFields = Object.keys(workstepParams).filter(
      key => key.startsWith('_') && key.endsWith('_mock')
    );
    // Map mocked field values or faked values with json path dotted fieldnames, e.g. billingAddress.firstName
    mockerFields.forEach(field => {
      const dottedNameSplit = field.split('_');
      dottedNameSplit.splice(-1, 1); // remove suffix _mock
      dottedNameSplit.splice(0, 1); // remove prefix _
      const dottedName = dottedNameSplit.join('_').replace(/^[0-9]+\./, ''); // remove oneOf identifiers
      const valueSplit = workstepParams[field].split('$$');
      valueSplit.forEach((value, index) => {
        // faker substitution, with parameter support
        if (value.startsWith('faker.')) {
          const fakerFunction = `${value.split('(')[0]}()`;
          if (`$$${fakerFunction}$$` in fakerMap) {
            const fakerParams = value.split('(')[1].replace(')', '');
            const fakerParamsArray =
              fakerParams && fakerParams.startsWith('[') && fakerParams.endsWith(']')
                ? JSON.parse(fakerParams)
                : [];
            const isFakerParams = fakerParamsArray.length > 0;
            const fakerModule = fakerFunction.split('.')[1];
            const fakerModuleFunction = fakerFunction.split('.')[2].split('(')[0];
            switch (fakerModule) {
              case 'date': {
                if (!isFakerParams) {
                  const fakerValue = fakerMap[`$$${fakerFunction}$$`]();
                  valueSplit[index] = new Date(fakerValue).toISOString();
                }
                break;
              }
              case 'phone': {
                if (isFakerParams && fakerModuleFunction === 'number') {
                  const param = fakerParamsArray[0].replace(/\*/g, '#');
                  valueSplit[index] = fakerMap[`$$${fakerFunction}$$`](param);
                } else if (!isFakerParams) {
                  valueSplit[index] = fakerMap[`$$${fakerFunction}$$`]();
                }
                break;
              }
              default: {
                if (!isFakerParams) {
                  valueSplit[index] = fakerMap[`$$${fakerFunction}$$`]();
                }
              }
            }
          }
        }
      });
      mockerFieldValues.push({ key: dottedName, value: valueSplit.join('') });
    });

    // Update mock with workstep query parameter values (static and fakered), refine data by schema type
    mockerFieldValues.forEach(field => {
      const fieldSchemaKey = field.key
        .split('.')
        .map(field => {
          return `properties.${field}`;
        })
        .join('.');
      const fieldSchema = get(mockSchema, fieldSchemaKey);
      const mockValue = get(genMock, field.key);
      const mockValueType = typeof mockValue;
      // Type conversion based on mock
      switch (mockValueType) {
        case 'string':
          if (fieldSchema && fieldSchema.maxLength && field.value.length > fieldSchema.maxLength) {
            field.value = field.value.slice(0, fieldSchema.maxLength - 1);
          }
          break;
        case 'boolean':
          field.value = field.value.toLowerCase() === 'true';
          break;
        case 'number':
          field.value = !isNaN(parseFloat(field.value)) ? parseFloat(field.value) : 0;
          break;
        case 'integer':
          field.value = !isNaN(parseInt(field.value)) ? parseInt(field.value) : 0;
          break;
        default:
      }
      // unset if null, otherwise set
      if (field.value === 'null') {
        unset(mock, field.key);
      } else {
        set(mock, field.key, field.value);
      }
    });
  } catch (error) {
    console.error('Mocker failed: ', error, globals)
  }

  return mock;
};
