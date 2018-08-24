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
  const done = callback || finalhandler(req, res, {
      env: this.get('env'),
      onerror: logerror.bind(this)
  });

  // no routes
  if (!router) {
      debug('no routes defines on app');
      done();
      return;
  }

  router.handle(req, res, done);
};

/**
 * 
 */
