/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Data
// ----------------------------------------------------------------------------

var CONTACTS_DATA = require('./data/contacts.json');
// A token to denote the start of a new query.

// Imports and helper functions
// ----------------------------------------------------------------------------
//
// Import library functions.

var fold = require('reducers/fold');
var filter = require('reducers/filter');
var map = require('reducers/map');
var merge = require('reducers/merge');
var print = require('reducers/debug/print');

var open = require('dom-reduce/event');

var dropRepeats = require('transducer/drop-repeats');

var grep = require('grep-reduce/grep');

function lambda(method) {
  // Convert a method func that uses a `this` context into a function that takes
  // the context object as the first parameter.
  return function lambdaWrappedMethod(context) {
    var args = Array.prototype.slice.call(arguments, 1);
    return method.apply(context, args);
  };
}

// A lambda approach to `Array.prototype.slice`.
// Used in a lot of places for slicing the arguments object into a proper array.
var slice = Array.slice || lambda(Array.prototype.slice);

function getTel(object) {
  // Just a helper function used by grepContacts.
  return object.tel;
}

function grepContacts(pattern) {
  // Grep contacts using serialization function `getTel`.
  //
  // String pattern -> Signal matches
  return grep(pattern, CONTACTS_DATA, getTel);
}

function SOQ() {
  // Just a token used to denote start of query.
  return "Start of query";
}

function isSOQ(thing) {
  // Check if a thing is SOQ.
  return SOQ() === thing;
}

var dummy = document.createElement('div');
function createNodes(string) {
  dummy.innerHTML = string;
  return dummy.children;
}

function mapContactToHtmlString(contact) {
  return '<li><b>' + contact.name + '</b> ' + contact.tel + '</li>';
}

// Doesn't work properly. Write test plz.
function extend(obj) {
  return reduce(slice(arguments, 1), function (obj, objN) {
    return reduce(Object.keys(objN), function (obj, key) {
      obj[key] = objN[key];
      return obj;
    }, obj);
  }, obj);
}

function liftNary(fn) {
  // Kind of a wierd one, but this function is useful for composing
  // ordinary functions with more than one argument.
  //
  // (x, y -> z) -> ([x, y] -> [z, y])
  return function liftedNary(args) {
    var argsCopy = slice(args);
    argsCopy[0] = fn.apply(null, args);
    return argsCopy;
  }
}

function appendChildFolder(childEl, parentEl) {
  // Fold many children
  parentEl.appendChild(childEl);
  return parentEl;
}

// Control flow logic
// ----------------------------------------------------------------------------

// Catch all bubbled keypress events.
var keypressesOverTime = open(document.documentElement, 'keyup');

var dialerKeypressesOverTime = filter(keypressesOverTime, function isDialerEventTarget(event) {
  return event.target.id = 'dialer';
});

var dialerValuesOverTime = map(dialerKeypressesOverTime, function mapKeypressEventToValue(event) {
  return event.target.value;
});

// var uniqueDialerValuesOverTime = dropRepeats(dialerValuesOverTime);

// Split stream into 2 streams:
//
// 1. All queries that have words.
// 2. All queries that do not have words.
var validQueriesOverTime = filter(dialerValuesOverTime, function hasNonWhitespaceCharacter(possible) {
  return /\S/.test(possible);
});

// For every new value, we generate a Start of Query token.
var SOQsOverTime = map(dialerValuesOverTime, SOQ);

var resultListsOverTime = map(validQueriesOverTime, grepContacts);

// Flatten 2D signal into 1D signal.
var resultsOverTime = merge(resultListsOverTime);

// Merge results with empty SOQs.
//
// This 1D signal has SOQ "bumpers" denoting when one set of results begins.
//
// The advantage of using this approach instead of a 2D signal is that it lets
// us react to incoming results immediately, without having to wait for the
// full set.
//
// Merged array is ordered by time, so put SOQsOverTime in front so they appear
// at the beginning of a result group, not the end.
var resultsAndSOQsOverTime = merge([SOQsOverTime, resultsOverTime]);

// Remove adjacent repeats from signal. We don't need to react to the same
// thing 2x.
var everythingStream = dropRepeats(resultsAndSOQsOverTime);

var soqStream = filter(everythingStream, isSOQ);

var resultStream = filter(everythingStream, function (thing) {
  return !isSOQ(thing);
});

// Lift `mapContactToHtmlString()` so it transform the first value of grep
// results.
var mapContactToHtmlStringLifted = liftNary(mapContactToHtmlString);

// Transform the first value of the grep results.
// [[contact, score, match], ...] -> [[htmlString, score, match], ...]
var contactHtmlStringStream = map(resultStream, mapContactToHtmlStringLifted);

// Lift `createNodes()` so it transform the first value of grep
// results.
var createNodesLifted = liftNary(createNodes);

// [[htmlString, score, match], ...] -> [[[nodes], score, match]]
var contactElsStream = map(contactHtmlStringStream, createNodesLifted);

var containerEl = document.getElementById('results');

fold(soqStream, function foldSOQs() {
  // For every start of query, empty the results element.
  containerEl.innerHTML = '';
});

fold(contactElsStream, function foldContactEls(result) {
  fold(slice(result[0]), appendChildFolder, containerEl);
});
