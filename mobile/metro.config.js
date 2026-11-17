// Metro for the Poker IQ app. The game code lives one folder up (../src, shared with the website) and is rendered
// inside a DOM component. Every import resolves from mobile/node_modules so there is exactly one React.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const sharedRoot = path.resolve(projectRoot, '../src');
const config = getDefaultConfig(projectRoot);

config.watchFolders = [sharedRoot];
// Packages imported by the shared code (react, framer-motion, supabase…) resolve as if imported from the app,
// so they come from mobile/node_modules and there is exactly one React in the bundle.
const appOrigin = path.join(projectRoot, 'package.json');
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const fromShared = context.originModulePath.startsWith(sharedRoot + path.sep);
  const bare = !moduleName.startsWith('.') && !path.isAbsolute(moduleName);
  if (fromShared && bare) return context.resolveRequest({ ...context, originModulePath: appOrigin }, moduleName, platform);
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
