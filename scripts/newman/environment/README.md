# Newman Postman Environment Folder

Each Newman script consumes and produces enviromment and global variables, which are kept in this folder, in the following files

```
environment.json
globals.json
```

Both environment and globals.json are altered during a Newman run.

TODO: On Newman run initialization, the environment is pre-selected and copied here from ```restnest-e2e/environment``` and globals from ```restnest-e2e/environment/developer``` and ```restnest-e2e/environment/main```, depending on which collection is currently running. 