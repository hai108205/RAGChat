const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function readJson(relativePath) {
    return JSON.parse(read(relativePath));
}

function assertDoesNotInclude(file, text, message) {
    assert(!read(file).includes(text), message);
}

function assertIncludes(file, text, message) {
    assert(read(file).includes(text), message);
}

function assertMatches(file, pattern, message) {
    assert(pattern.test(read(file)), message);
}

const packageJson = readJson('package.json');
assert(!packageJson.dependencies || !packageJson.dependencies['@rocket.chat/ui-kit'], 'package.json must not depend on @rocket.chat/ui-kit');
assert(!packageJson.dependencies || !packageJson.dependencies['@rocket.chat/icons'], 'package.json must not depend on @rocket.chat/icons');

const packageLock = readJson('package-lock.json');
assert(!packageLock.packages['']?.dependencies?.['@rocket.chat/ui-kit'], 'package-lock root must not depend on @rocket.chat/ui-kit');
assert(!packageLock.packages['']?.dependencies?.['@rocket.chat/icons'], 'package-lock root must not depend on @rocket.chat/icons');
assert(!packageLock.packages['node_modules/@rocket.chat/ui-kit'], 'package-lock must not contain @rocket.chat/ui-kit');
assert(!packageLock.packages['node_modules/@rocket.chat/icons'], 'package-lock must not contain @rocket.chat/icons');
assert(!packageLock.packages['node_modules/@rocket.chat/ui-kit/node_modules/typia'], 'package-lock must not contain typia from ui-kit');

assertDoesNotInclude('src/utils/MessageHelper.ts', '@rocket.chat/ui-kit', 'MessageHelper must not import @rocket.chat/ui-kit');
assert(!fs.existsSync(path.join(root, 'RagChatApp.js')), 'RagChatApp.js compiled artifact must not be committed');
assertIncludes('src/settings/Settings.ts', "id: 'callback-base-url'", 'callback-base-url setting must exist');
assertMatches('src/settings/Settings.ts', /id:\s*'callback-base-url'[\s\S]*?required:\s*true/, 'callback-base-url must be required');
assertIncludes('RagChatApp.ts', 'Callback public URL is not configured', 'onEnable must reject missing callback-base-url');
assertIncludes('RagChatApp.ts', 'return false;', 'onEnable must be able to fail configuration validation');
assertMatches('src/handlers/BlockActionHandler.ts', /buildDocumentListBlocks\([^,]+,\s*sources/, 'suggestion chip docs path must reuse DocumentListBlock');

console.log('SDK fix checks passed');
