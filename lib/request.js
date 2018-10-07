'use strict';

/**
 * Module dependencies.
 * @private
 */

 const accepts = require('accepts');
 const deprecate = require('depd')('express');
 const isIP = require('net').isIP;
 const typeis = require('type-is');
 const http = require('http');
 const fresh = require('fresh');
 const parseRange = require('range-parser');
 const parse = require('parseurl');
 const proxyaddr = require('proxy-addr');