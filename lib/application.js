"use strict";

/**
 * Module Dependencies
 * @private
 */

const finalhandler = require("finalhandler");
const Router = require("./router");
const methods = require("methods");
const middleware = require("./middleware/init");
const query = require("./middleware/query");
const debug = require("debug")("express:application");
const View = require("./view");
const http = require("http");
const compileETag = require("./utils").compileETag;
const compileQueryParser = require("./utils").compileQueryParser;
const compileTrust = require("./utils").compileTrust;
const deprecate = require("depd")("express");
const flatten = require("array-flatten");
const merge = require("utils-merge");
const resolve = require("path").resolve;
const setPrototypeOf = require("setprototypeof");
const slice = Array.prototype.slice;

/**
 * Application prototype
 */

const app = (exports = module.exports = {});

/**
 * Variable for trust proxy inheritance back-compat
 * @private
 */

const trustProxyDefaultSymbol = "@@symbol:trust_proxy_default";

/**
 * Initialize the server
 *
 * - setup default configuration
 * - setup default middleware
 * - setup route reflection methods
 *
 * @private
 */

app.init = function init() {
  this.cache = {};
  this.engines = {};
  this.settings = {};

  this.defaultConfiguration();
};

/**
 * Initialize application configuration
 * @private
 */

app.defaultConfiguration = function defaultConfiguration() {
  const env = process.env.NODE_ENV || "development";

  //default settings
  this.enable("x-powered-by");
  this.set("etag", "weak");
  this.set("env", "env");
  this.set("query parser", "extended");
  this.set("subdomain offset", 2);
  this.set("trust proxy", false);

  //trust proxy inherit back-compat
  Object.defineProperty(this.settings, trustProxyDefaultSymbol, {
    configurable: true,
    value: true
  });

  debug("booting in %s mode", env);

  this.on("mount", function onmount(parent) {
    // inherit trust proxy
    if (
      this.settings[trustProxyDefaultSymbol] === true &&
      typeof parent.settings["trust proxy fn"] === "function"
    ) {
      delete this.settings["trust proxy"];
      delete this.settings["trust proxy fn"];
    }

    // inherit protos
    setPrototypeOf(this.request, parent.request);
    setPrototypeOf(this.response, parent.response);
    setPrototypeOf(this.engines, parent.engines);
    setPrototypeOf(this.settings, parent.settings);
  });

  // setup locals
  this.locals = Object.create(null);

  // top-most app is mounted at /
  this.mountpath = "/";

  // default locals
  this.locals.settings = this.settings;

  // default configuration

  this.set("view", View);
  this.set("views", resolve("views"));
  this.set("jsonp callback name", "callback");

  if (env === "production") {
    this.enable("view cache");
  }

  Object.defineProperty(this, "router", {
    get: function() {
      throw new Error("app router is deprecated");
    }
  });
};

/**
 * lazily adds the base router if it has not yet been added.
 *
 * we cannot add the base router in defaultConfiguration because
 * it reads app settings which might be set after that has run
 *
 * @private
 */

app.lazyrouter = function lazyrouter() {
  if (!this._router) {
    this._router = new Router({
      caseSensitive: this.enabled("case sensitive routing"),
      strict: this.enabled("strict routing")
    });

    this._router.use(query(this.get("query parser fn")));
    this._router.use(middleware.init(this));
  }
};

/**
 * Dispatch a req, res pair into the application. Starts the pipeline processing.
 *
 * If no callback provided, then default error handlers will respond
 * in the event of an error bubbling through the stack
 *
 * @private
 */

app.handle = function handle(req, res, callback) {
  const router = this._router;

  //final handler
  const done =
    callback ||
    finalhandler(req, res, {
      env: this.get("env"),
      onerror: logerror.bind(this)
    });

  // no routes
  if (!router) {
    debug("no routes defines on app");
    done();
    return;
  }

  router.handle(req, res, done);
};

/**
 * Proxy `Router#use() to add middleware to the app router.
 * See Router#use() documentation for details.
 *
 * If the _fn_ parameter is an express app, then it will be
 * mounted at the _route_ specified.
 *
 * @public
 */

app.use = function use(fn) {
  let offset = 0;
  let path = "/";

  // default path to '/'
  // disambiguate app.use([fn])
  // Note: May be a better way to do this with es6
  if (typeof fn !== "function") {
    let arg = fn;

    while (Array.isArray(arg) && arg.length !== 0) {
      arg = arg[0];
    }

    //first arg is the path
    if (typeof arg !== "function") {
      offset = 1;
      path = fn;
    }
  }

  const fns = flatten(slice.call(arguments, offset));

  if (fns.length === 0) {
    throw new TypeError("app.use() requires a middleware function");
  }

  // setup router
  this.lazyrouter();
  const router = this._router;

  fns.forEach(function(fn) {
    // non-express app
    if (!fn || !fn.handle || !fn.set) {
      return router.use(path, fn);
    }

    debug(".use app under %s", path);
    fn.mountpath = path;
    fn.parent = this;

    // restore .app property on req and res
    router.use(path, function mounted_app(req, res, next) {
      const orig = req.app;
      fn.handle(req, res, function(err) {
        setPrototypeOf(req, orig.request);
        setPrototypeOf(res, orig.response);
        next(err);
      });
    });
    //mounted an app
    fn.emit("mount", this);
  }, this);
  return this;
};
/**
 * Proxy to the app `Router#route`
 * Returns a new `Route` instance for the _path_.
 *
 * Routes are isolated middleware stacks for specific paths.
 *
 * @public
 */

app.route = function route(path) {
  this.lazyrouter();
  return this._router.route(path);
};

/**
 * @param {String} ext
 * @param {Function} fn
 * @return {app} for chaining
 */

app.engine = function engine(ext, fn) {
  if (typeof fn !== "function") {
    throw new Error("callback function required");
  }

  // get file extension
  const extension = ext[0] !== "." ? "." + ext : ext;

  //store engine
  this.engines[extension] = fn;

  return this;
};

/**
 * Proxy to `Router#param()` with one added api feature. The _name_ parameter
 * can be an aray of names.
 *
 * See the Router#param() docs for more details.
 *
 * @param {String|Array} name
 * @param {Function} fn
 * @return {app} for chaining
 * @public
 */

app.param = function param(name, fn) {
  this.lazyrouter();

  if (Array.isArray(name)) {
    for (let i = 0, len = name.length; i < len; i++) {
      this.param(name[i], fn);
    }

    return this;
  }

  this._router.param(name, fn);

  return this;
};

/**
 * Assign `setting` to `val`, or return `setting`'s value,
 *
 *  app.set('foo', 'bar');
 *  app.set('foo'); // set acts as get in this case 🤷‍
 *  // => "bar"
 *
 * Mounted server inherit their parent server's setting.
 *
 * @param {String} setting
 * @param {*} [val]
 * @return {Server} for chaining
 * @public
 */

app.set = function set(setting, val) {
  // this is the get()
  if (arguments.length === 1) {
    return this.settings[setting];
  }

  debug('set "%s" to %o', setting, val);

  // set value
  this.settings[setting] = val;

  // trigger matched settings

  switch (setting) {
    case "etag":
      this.set("etag fn", compileETag(val));
      break;
    case "query parser":
      this.set("query parser fn", compileQueryParser(val));
      break;
    case "trust proxy":
      this.set("trust proxy fn", compileTrust(val));

      // trust proxy inherit back-compat
      Object.defineProperty(this.settings, trustProxyDefaultSymbol, {
        configurable: true,
        value: false
      });

      break;
  }

  return this;
};

/**
 * Return the app's absolute pathname
 * based on the parent(s) that have
 * mounted it
 *
 * For example if the application was
 * mounted as "/admin", which itself
 * was mounted as "/blog" then the
 * return value would be "/blog/admin".
 *
 * @return {String}
 * @private
 */

app.path = function path() {
  return this.parent ? this.parent.path() + this.mountpath : "";
};

/**
 * Check if `setting` is enabled (truthy)
 *
 *   app.enabled('foo')
 *   //=> false
 *
 *   app.enable('foo')
 *   app.enabled('foo')
 *   // => true
 *
 * @param {String} setting
 * @return {Boolean}
 * @public
 */
app.enabled = function(setting) {
  return Boolean(this.set(setting));
};

/**
 * Check if `setting` is disabled
 *
 *   app.disbaled('foo')
 *   //=> true
 *
 *   app.enable('foo')
 *   app.disabled('foo')
 *   // => false
 *
 * @param {String} setting
 * @return {Boolean}
 * @public
 */

app.disabled = function disabled(setting) {
  return !this.set(setting);
};

/**
 * Enable `setting`
 *
 * @param {String} setting
 * @return {app} for chaining
 * @public
 */

app.enable = function enable(setting) {
  return this.set(setting, true);
};
/**
 * Disable `setting`
 *
 * @param {String} setting
 * @return {app} for chaining
 * @public
 */

app.disable = function disable(setting) {
  return this.set(setting, false);
};

/**
 * Delegate `.VERB(...)` calls to `router.VERB(...)`.
 */

methods.forEach(function(method) {
  app[method] = function(path) {
    if (method === "get" && arguments.length === 1) {
      // app.get(setting)
      return this.set(path);
    }

    this.lazyrouter();

    const route = this._router.route(path);
    route[method].apply(route, slice.call(arguments, 1));
    return this;
  };
});
