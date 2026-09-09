const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Prevent iCloud Drive from triggering infinite hot reload loops.
// iCloud continuously updates extended attributes on synced files,
// which Metro's file watcher interprets as file changes.
// Use watchman's ignore_dirs to skip iCloud metadata.
config.watcher = {
  ...config.watcher,
  watchman: {
    ...(config.watcher?.watchman ?? {}),
    deferStates: ['hg.update'],
  },
};

module.exports = config;
