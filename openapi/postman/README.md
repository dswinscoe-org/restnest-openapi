# restnest-postman-template

This template should be copied to a "postman" sub-directory, of the service repo "openapi" folder. 

See package.json script ```restnest:openAPISetupPostman:local``` for configuration parameters.

**Expected folder structure :**

* openapi (see folder configuration parameter above)
    * generatedSpec (global de-referenced specs - see see folder configuration parameter above)
    * postman (**This template**)
        * collection (ServicePublish Collection and evtl. generated service collection)
        * environment (Postman globals for publish - apikey retrieved via gcp)
        * scripts (collection generation and Newman publish)
        * package.json, ...

```scripts/openAPISetupPostman.js``` is configured to read source OpenAPI specs and schmemas from configured ```generatedSpec``` folder, and auto-generates the ```collection/*.postman_collection.json``` and ```environment/restnest-postman.postman_globals.json``` files for publish.

All schemas are written in the above Postman collection as collection variables and published, along with the service environments (DEV, SANDBOX, etc.) to the Postman restnest-postman workspace via Newman, using naming convention ```[serviceName]-<timestamp-commithash>```.

Once published, the service may be forked along with all other RESTNEST-capable services, for use in multi-service test scenarios in the Postman restnest-e2e workspace.  

IMPORTANT: Pre-requisite for openAPISetupPostman.js is the availability of de-referenced OpenAPI specs, complete with request and response schema in YAML format. See service ```openapi/generate-openapi.js```
