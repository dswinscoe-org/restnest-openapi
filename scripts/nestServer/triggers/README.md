# Grunt Watch trigger files

Files written here by ScenarioServer are watched (see Gruntfile.js) to dynamically trigger configured script/newman scripts 

Parameters in trigger files, provided in endpoint query parameters, are passed to the script, and enable parallel and sequention execution of collection scenario folders

Currently supported: (see e2e collection Triggers)

**{{triggerId}}_scenario** - RESTNEST scenarios, parallel or sequentional
**{{triggerId}}_quickSync** - download dev/main e2e collections
**{{triggerId}}_syncCollections** - download, augment and upload dev/main collections