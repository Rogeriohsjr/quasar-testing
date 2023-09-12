/**
 * Quasar App Extension install script
 *
 * API: https://github.com/quasarframework/quasar/blob/master/app/lib/app-extension/InstallAPI.js
 */

const { appendFileSync } = require('fs');
const { join } = require('path');
const { enforcedDevServerPort } = require('./shared');

/**
 * Performs a deep merge of objects and returns new object. Does not modify
 * objects (immutable) and merges arrays via concatenation.
 * based on https://stackoverflow.com/a/49798508
 *
 * @param {...object} sources - Objects to merge
 * @returns {object} New object with merged key/values
 */

function __mergeDeep(...sources) {
  let result = {};
  for (const source of sources) {
    if (source instanceof Array) {
      if (!(result instanceof Array)) {
        result = [];
      }
      result = [...result, ...source];
    } else if (source instanceof Object) {
      // eslint-disable-next-line prefer-const
      for (let [key, value] of Object.entries(source)) {
        if (value instanceof Object && key in result) {
          value = __mergeDeep(result[key], value);
        }
        result = { ...result, [key]: value };
      }
    }
  }
  return result;
}

// We use devDependencies instead of peerDependencies because devDependencies are usually the latest version
// and peerDependencies could contain a string supporting multiple major versions (e.g. "cypress": "^12.2.0 || ^13.1.0")
const { devDependencies: aeDevDependencies } = require(
  join(__dirname, '..', 'package.json'),
);

function getCompatibleDevDependencies(packageNames) {
  const devDependencies = {};

  for (const packageName of packageNames) {
    devDependencies[packageName] = aeDevDependencies[packageName];
  }

  return devDependencies;
}

// make sure the object exists
let extendPackageJson = {
  devDependencies: getCompatibleDevDependencies([
    'cypress',
    'eslint-plugin-cypress',
  ]),
};

module.exports = function (api) {
  api.compatibleWith('quasar', '^2.0.0');
  if (api.hasVite) {
    api.compatibleWith('@quasar/app-vite', '^1.0.0 || ^2.0.0-alpha.27');
  } else if (api.hasWebpack) {
    // TODO: should be "@quasar/app-webpack" but that is not backward compatible
    // Remove when Qv3 comes out, or when "@quasar/app" is officially deprecated
    api.compatibleWith('@quasar/app', '^3.0.0 || ^4.0.0-alpha.20');
  }

  const devServerPort = enforcedDevServerPort;
  const shouldAddScripts = api.prompts.options.includes('scripts');
  const shouldSupportTypeScript = api.prompts.options.includes('typescript');
  const shouldAddCodeCoverage =
    api.prompts.options.includes('code-coverage') && api.hasVite;

  const testEnvCommand = `cross-env NODE_ENV=test`;
  // "http-get" must be used because "webpack-dev-server" won't answer
  //  HEAD requests which are performed by default by the underlying "wait-on"
  // See https://github.com/bahmutov/start-server-and-test#note-for-webpack-dev-server-users
  const e2eServerCommand = `${testEnvCommand} start-test "quasar dev" http-get://localhost:${devServerPort}`;
  const e2eCommand = `${e2eServerCommand} "cypress open --e2e"`;
  const e2eCommandCi = `${e2eServerCommand} "cypress run --e2e"`;
  const componentCommand = `${testEnvCommand} cypress open --component`;
  const componentCommandCi = `${testEnvCommand} cypress run --component`;

  api.render('./templates/base', { shouldSupportTypeScript });

  api.render(`./templates/${shouldSupportTypeScript ? '' : 'no-'}typescript`, {
    devServerPort,
    shouldAddCodeCoverage,
    shouldSupportTypeScriptAndVite: shouldSupportTypeScript && api.hasVite,
  });

  api.extendJsonFile('quasar.testing.json', {
    'e2e-cypress': {
      runnerCommand: e2eCommandCi,
    },
    'component-cypress': {
      runnerCommand: componentCommandCi,
    },
  });

  if (shouldAddScripts) {
    const scripts = {
      scripts: {
        test: 'echo "See package.json => scripts for available tests." && exit 0',
        'test:e2e': e2eCommand,
        'test:e2e:ci': e2eCommandCi,
        'test:component': componentCommand,
        'test:component:ci': componentCommandCi,
      },
    };
    extendPackageJson = __mergeDeep(extendPackageJson, scripts);
  }

  if (shouldAddCodeCoverage) {
    api.render('./templates/code-coverage');

    const gitignorePath = api.resolve.app('.gitignore');
    appendFileSync(gitignorePath, '\n.nyc_output\ncoverage/\n');
  }

  // TODO: using `api.hasWebpack` won't be available if the user is still using
  // the old app, so we check hasVite instead
  if (api.prompts.options.includes('code-coverage') && !api.hasVite) {
    api.onExitLog(
      "Code coverage isn't supported for Webpack yet. Please use Vite CLI instead.",
    );
  }

  api.extendPackageJson(extendPackageJson);
};
