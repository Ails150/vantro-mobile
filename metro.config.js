const path = require('path');
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

const config = getSentryExpoConfig(__dirname);

// i18n-js requires make-plural, whose package exports map is an array of
// conditional objects. Metro walks it with no condition names matched and
// gives up rather than falling back to the package's own "main", so the whole
// bundle fails on a file we never call into. Point the bare specifier at the
// concrete CommonJS entry.
//
// Nothing else depends on this: our plural rules are registered by hand in
// lib/i18n.ts, because make-plural's generic categories still need a catalogue
// keyed to match.
const makePluralEntry = path.join(
  path.dirname(require.resolve('make-plural/package.json')),
  'plurals.js',
);

const upstreamResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'make-plural') {
    return { type: 'sourceFile', filePath: makePluralEntry };
  }
  return upstreamResolveRequest
    ? upstreamResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
