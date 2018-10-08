"use strict";

/**
 * Module dependencies.
 * @private
 */

const accepts = require("accepts");
const deprecate = require("depd")("express");
const isIP = require("net").isIP;
const typeis = require("type-is");
const http = require("http");
const fresh = require("fresh");
const parseRange = require("range-parser");
const parse = require("parseurl");
const proxyaddr = require("proxy-addr");

/**
 * Request prototype
 * @public
 */

const req = Object.create(http.IncomingMessage.prototype);

/**
 * Module exports.
 * @public
 */

module.exports = req;

/**
 * Return request header
 *
 * The `Referrer` header field is special cased,
 * both `Referrer` and `Referer` are interchangeable
 *
 * Examples:
 *
 *  req.get('Content-Type');
 *  // => "text/plain"
 *
 * *  req.get('content-type');
 *  // => "text/plain"
 *
 * *  req.get('Something');
 *  // => undefined
 *
 * Aliased as `req.header()`.
 *
 * @param {String} name
 * @return {String}
 * @public
 */

req.get = req.header = function header(name) {};
