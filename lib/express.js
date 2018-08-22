"use strict";

/**
 * Module Dependencies
 */

const bodyParser = require("body-parser");
const EventEmitter = require("events").EventEmitter;
const mixin = require("merge-descriptors");
const proto = require("./application");
const Route = require("./router/route");
const Router = require("./router");
const req = require("./request");
const res = require("./response");

/**
 * Expose `createApplication()`.
 */

exports = module.exports = createApplication;

/**
 * Create an express application
 *
 * @return {Function}
 * @api public
 */

function createApplication() {
  const app = function(req, res, next) {
    app.handle(req, res, next);
  };

  mixin(app, EventEmitter.prototype, false);
  mixin(app, proto, false);

  //expose the prototype that will get set on requests
  app.request = Object.create(req, {
    app: { configurable: true, enumerable: true, writable: true, value: app }
  });

  //expose the prototype that will get set on responses
  app.response = Object.create(res, {
    app: { configurable: true, enumerable: true, writable: true, value: app }
  });

  app.init();

  return app;
}

/**
 * Expose the prototypes
 */

exports.application = proto;
exports.request = req;
exports.response = res;

/**
 * Expose constructors
 */

exports.Route = Route;
exports.Router = Router;

/**
 * Expose middleware
 */

exports.json = bodyParser.json;
exports.query = require("./middleware/query");
exports.static = require("serve-static");
exports.urlencoded = bodyParser.urlencoded;

/**
 * Replace removed middleware with appropriate error message.
 */
[
  "bodyParser",
  "compress",
  "cookieSession",
  "session",
  "logger",
  "cookieParser",
  "favicon",
  "responseTime",
  "errorHandler",
  "timeout",
  "methodOverride",
  "vhost",
  "csrf",
  "directory",
  "limit",
  "multipart",
  "staticCache"
].forEach(function(name) {
  Object.defineProperty(exports, name, {
    get: function() {
      throw new Error(
        `Most middleware (like ${name}) is no longer bundled with Express. Install seperately.`
      );
    },
    configurable: true
  });
});
