"use strict";
const fs = require("node:fs");
const esbuild = require("esbuild");
const path = require("node:path");
const nodeModule = require("node:module");
const builtins = nodeModule.builtinModules.filter((r) => !r.startsWith("bun"));
const PRODUCTION = Bun.env.NODE_ENV === "production";
const prefix = "__caddie_";
function normalizePathname(url) {
  if (url !== "/") {
    url = url.replace(/\\/g, "/");
  }
  url = url.replace(/^\/+|\/+$/g, "");
  const segments = url.split("/");
  const normalizedSegments = [];
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index];
    if (segment === "" || segment === ".") {
      continue;
    }
    if (segment === "..") {
      normalizedSegments.pop();
    } else {
      normalizedSegments.push(segment);
    }
  }
  let normalizedUrl = normalizedSegments.join("/");
  return normalizedUrl === "" ? "/" : "/" + normalizedUrl;
}
const parseMultiplePaths = (path2) => Array.isArray(path2) ? path2.map((r) => normalizePathname(r)) : [normalizePathname(path2)];
const transpiler = new Bun.Transpiler();
const mod = Array.from(Loader.registry)[1][0];
let file = fs.readFileSync(mod, "utf8");
const modules = transpiler.scanImports(file).map((r) => r.path);
const localModules = modules.filter(
  (r) => r.startsWith("./") || r.startsWith("../") || r.startsWith("/")
);
class Router {
  routes = [];
  async get(path2, cb) {
    if (cb instanceof Router) {
      for (let index = 0; index < cb.routes.length; index++) {
        const route = cb.routes[index];
        for (let index2 = 0; index2 < parseMultiplePaths(path2).length; index2++) {
          this.routes.push({
            method: "get",
            cb: route.cb,
            path: route.path.map((r) => path2[index2] + r)
          });
        }
      }
    } else
      this.routes.push({
        path: parseMultiplePaths(path2),
        method: "get",
        cb
      });
  }
  listen() {
    console.log(this.routes.map((r) => r.path));
    if (typeof __caddie_server === "undefined") {
      for (let index = 0; index < modules.length; index++) {
        const module2 = modules[index];
        if (builtins.includes(module2)) {
          throw new Error(`Use node: prefix when importing ${module2}`);
        }
        if (localModules.includes(module2) && !fs.existsSync(module2))
          throw new Error(
            `Module ${module2} does not exist. Did you forget or misspell its extension?`
          );
      }
      const fn = this.routes.map((r, i) => {
        for (let index = 0; index < r.path.length; index++) {
          file = `const ${prefix}pathname_${i + index}=${JSON.stringify(
            r.path[index]
          )};${file}`;
        }
        const cb = r.cb.toString();
        return `if (${r.path.map((_, i2) => `${prefix}pathname === ${prefix}pathname_${i + i2}`).join("||")}) {
            ${cb.slice(cb.indexOf("{") + 1, cb.lastIndexOf("}")).replace(`() =>`, `return`)}
  }`;
      }).join("");
      const hasAsync = this.routes.some(
        (r) => r.cb[Symbol.toStringTag] === "AsyncFunction"
      );
      const _dirname = JSON.stringify(path.dirname(mod));
      const code = esbuild.transformSync(
        `const ${prefix}notFound = new Response('Not Found', {status:404});const ${prefix}reg = Array.from(Loader.registry);

${prefix}reg[1] = [import.meta.filename, { ...${prefix}reg[1][1], key: import.meta.filename }];
Loader.registry = new Map(${prefix}reg);globalThis.${prefix}server=Bun.serve({${hasAsync ? "async " : ""}fetch(req){const{pathname:${prefix}pathname}=new URL(req.url);${fn}return ${prefix}notFound.clone()}});
${file}`,
        {
          define: {
            "import.meta.dirname": _dirname,
            "import.meta.dir": _dirname,
            __dirname: _dirname,
            "import.meta.filename": JSON.stringify(mod),
            "import.meta.file": JSON.stringify(path.basename(mod))
          }
        }
      ).code;
      Bun.write("server.js", code);
    } else {
      return __caddie_server;
    }
  }
}
module.exports = Router;
