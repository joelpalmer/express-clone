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
 
