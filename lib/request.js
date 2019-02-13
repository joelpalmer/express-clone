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

req.get = req.header = function header(name) {
	if (!name) {
		throw new TypeError("name argument is required to req.get");
	}

	if (typeof name !== "string") {
		throw new TypeError("name must be a string to req.get");
	}

	const lc = name.toLowerCase();

	switch (lc) {
		case "referer": // falls through
		case "referrer": // the express crew is so nice to handle spelling errors 😄
			return this.headers.referrer || this.header.referer;
		default:
			return this.headers[lc];
	}
};

/**
 * Check if given `type(s)` is acceptable, returning
 * best matc wen true, otherwise `undefined`, in which
 * case you should respond with 406 "Not Acceptable"
 *
 * @param {string|Array} type(s)
 * @return {String|Array|Boolean}
 * @public
 */

req.accepts = function() {
	const accept = accepts(this);
	return accept.types.apply(accept, arguments);
};

/**
 * check if the given `encodings` are accepted
 *
 * @param {String} ...encoding
 * @return {String|Array}
 * @public
 */

req.acceptsEncodings = function() {
	const accept = accepts(this);
	return accept.encodings.apply(accept, arguments);
};

req.acceptsEncoding = deprecate.function(
	req.acceptsEncodings,
	"req.acceptsEncoding: Use acceptsEncodings instead"
);

/**
 * Check if the given `charset`s are acceptable,
 * otherwise you should respond with 406 "Not Acceptable"
 *
 * @param {String} ...charset
 * @return {String|Array}
 * @public
 */

req.acceptsCharsets = function() {
	const accept = accepts(this);
	return accept.charsets.apply(accept, arguments);
};

req.acceptsCharset = deprecate.function(
	req.acceptsCharsets,
	"req.acceptsCharset: Use acceptsCharsets instead"
);

/**
 * Check if given `lang`s are acceptable,
 * otherwise you should respond with 406 "Not Acceptable"
 *
 * @param {String} ...lang
 * @return {String|Array}
 * @public
 */

req.acceptsLanguages = function() {
	const accept = accepts(this);
	return accept.languages.apply(accept, arguments);
};

// more deprecating the singular
req.acceptsLanguage = deprecate.function(
	req.acceptsLanguages,
	"req.acceptsLanguage: Use acceptsLanguages instead"
);

/**
 * Parse Range header field, capping to the given `size`
 *
 * @param {number} size
 * @param {objecy} [options]
 * @param {boolean} [options.combine=false]
 * @return {number|array}
 * @public
 */

req.range = function range(size, options) {
	const range = this.get("Range");
	if (!range) return;
	return parseRange(size, range, options);
};

/**
 * Return the value of param `name` when present or `defaultValue
 *
 * @param {String} name
 * @param {Mixed} [defaultValue]
 * @return {String}
 * @public
 */

req.param = function param(name, defaultValue) {
	const params = this.params || {};
	const body = this.body || {};
	const query = this.query || {};

	const args = arguments.length === 1 ? "name" : "name, default";
	deprecate(
		"req.param(" + args + "): Use req.params, req.body, or req.query instead"
	);

	if (null != params[name] && params.hasOwnProperty(name)) return params[name];
	if (null != body[name]) return body[name];
	if (null != query[name]) return query[name];

	return defaultValue;
};

/**
 * Check if incoming request contains the "Content-Type"
 * header field, and it contains the given mime `type`
 *
 * @param {String|Array} ...types
 * @return {String|false|null}
 * @public
 */

req.is = function is(types) {
	let arr = types;

	// take flattened args & put them in array for typeis
	if (!Array.isArray(types)) {
		arr = new Array(arguments.length);
		for (let i = 0; i < arr.length; i++) {
			arr[i] = arguments[i];
		}
	}
	return typeis(this, arr);
};

/**
 * Return the protocol string "http" or "https"
 * when requested with TLS. When the "trust proxy"
 * setting trusts the socket address, the
 * "X-Forwarded-Proto" header field will be trusted
 * and used if present.
 *
 * @return {String}
 * @public
 */

defineGetter(req, "protocol", function protocol() {
	const proto = this.connection.encrypted ? "https" : "http";
	const trust = this.app.get("trust proxy fn");

	if (!trust(this.connection.remoteAddress, 0)) {
		return proto;
	}

	const header = this.get("X-Forwared-Proto") || proto;
	const index = header.indexOf(",");

	return index !== -1 ? header.substring(0, index).trim() : header.trim();
});

/**
 * Short-hand for:
 *
 *  req.protocol === 'https'
 *
 * @return {Boolean}
 * @public
 */

defineGetter(req, "secure", function secure() {
	return this.protocol === "https";
});

/**
 * Return remote address from trusted proxy
 *
 * This is the remote address on the socket unless
 * "trust proxy" is set
 *
 * @return {String}
 * @public
 */

defineGetter(req, "ip", function ip() {
	const trust = this.app.get("trust proxy fn");
	return proxyaddr(this, trust);
});

/**
 * When "trust proxy" is set, trusted proxy addresses + client
 *
 * @return {Array}
 * @public
 */

defineGetter(req, "ips", function ips() {
	const trust = this.app.get("trust proxy fn");
	const addrs = proxyaddr.all(this, trust);
	addrs.reverse().pop();

	return addrs;
});

/**
 * Return subdomains as an array
 *
 * @return {Array}
 * @public
 */

defineGetter(req, "subdomains", function subdomains() {
	const hostname = this.hostname;
	if (!hostname) return [];

	const offset = this.app.get("subdomain offset");
	const subdomains = !isIP(hostname)
		? hostname.split(".").reverse()
		: [hostname];
	return subdomains.slice(offset);
});

/**
 * Short-hand for `url.parse(req.url).pathname`.
 *
 * @return {String}
 * @public
 */

defineGetter(req, "path", function path() {
	return parse(this).pathname;
});
/**
 * Parse the "Host" header field to a hostname
 *
 * @return {String}
 * @public
 */

defineGetter(req, "hostname", function hostname() {
	const trust = this.app.get("trust proxy fn");
	let host = this.get("X-Forwarded-Host");

	if (!host || !trust(this.connection.remoteAddress, 0)) {
		host = this.get("Host");
	}

	if (!host) return;

	// support IPv6 literal

	const offset = host[0] === "[" ? host.indexOf("]") + 1 : 0;
	const index = host.indexOf(":", offset);

	return index !== -1 ? host.substring(0, index) : host;
});

defineGetter(
	req,
	"host",
	deprecate.function(function host() {
		return this.hostname;
	}, "req.host: Use req.Hostname instead")
);

/**
 * Check if the request is fresh, aka
 * Last-Modified and/or the ETag
 * still match
 *
 * @return {Boolean}
 * @public
 */

defineGetter(req, "fresh", function() {
	const method = this.method;
	const res = this.res;
	const status = res.statusCode;

	if ("GET" !== method && "HEAD" !== method) return false;

	if ((status >= 200 && status < 300) || 304 === status) {
		return fresh(this.headers, {
			etag: res.get("ETag"),
			"last-modified": res.get("Last-Modified")
		});
	}
	return false;
});

/**
 * Check if request is stale. Opposite of fresh
 *
 * return {Boolean}
 * @public
 */

defineGetter(req, "stale", function stale() {
	return !this.fresh;
});

/**
 * Check if request was an _XMLHttpRequest_
 *
 * @return {Boolean}
 * @public
 */

defineGetter(req, "xhr", function xhr() {
	const val = this.get("X-Requested-With") || "";
	return val.toLowerCase() === "xmlhttprequest";
});

/**
 * Helper function for creating a getting on an object
 *
 * @param {Object} obj
 * @param {String} name
 * @param {Function} getter
 * @private
 */

function defineGetter(obj, name, getter) {
	Object.defineProperty(obj, name, {
		configurable: true,
		enumerable: true,
		get: getter
	});
}
