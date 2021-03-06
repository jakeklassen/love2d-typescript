// Allows other Lua modules to be added as dependencies and used.
//
// Use `yarn add <username>/<github repo name>` to install a Lua module.
//
// package.path may have to be modified to link to certain modules correctly.

// @ts-ignore
package.path += ";node_modules/?/init.lua";
// @ts-ignore
package.path += ";node_modules/?/?.lua";
// @ts-ignore
package.path += ";node_modules/tiny-ecs/tiny.lua";

// Load modules
const tiny = require("tiny-ecs");

love.conf = (config) => {
  config.window.title = "Love2d TypeScript";
};
