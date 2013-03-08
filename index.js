/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Data
// ----------------------------------------------------------------------------

var CONTACTS_DATA = require('./data/contacts.json');

// Imports and helper functions
// ----------------------------------------------------------------------------
//
// Import library functions.

var fold = require('reducers/fold');
var filter = require('reducers/filter');
var map = require('reducers/map');
var merge = require('reducers/merge');
var reductions = require('reducers/reductions');
var print = require('reducers/debug/print');

var open = require('dom-reduce/event');

var dropRepeats = require('transducer/drop-repeats');

var grep = require('grep-reduce/grep');

var compose = require('functional/compose');

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

var stringIndexOf = lambda(String.prototype.indexOf);

function getTel(object) {
  // Just a helper function used by grepContacts.
  return object.tel;
}

function extractNumbersString(string) {
  // For a given string, return only the numbers within that string.
  // No special characters, no letters.
  //
  // String -> String
  return string.replace(/[^\d.]/g, '');
}

var getTelAndExtractNumbersString = compose(extractNumbersString, getTel);

function isTouchSupport() {
  return 'ontouchstart' in document.documentElement;
}

function grepContacts(pattern) {
  // Grep contacts using serialization function `getTel`.
  //
  // String pattern -> Signal matches
  return grep(pattern, CONTACTS_DATA, getTelAndExtractNumbersString);
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
  return '<li class="dialer-completion"><b class="title">' + contact.name + '</b> <div class="subtitle">' + contact.tel + '</div></li>';
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

function setInnerHtmlFolder(string, el) {
  // Set the innerHTML of an element. Arguments are in reverse order for
  // folding.
  el.innerHTML = string;
  return el;
}

function getEventTargetValue(event) {
  // Does what it says on the tin.
  return event.target.value;
}

function hasClass(el, classString) {
  // Check if the given element has `classname`.
  //
  // Signiture:
  // Element, string -> boolean
  return stringIndexOf(el.className, classString) !== -1;
}

function buildString(string, charcode) {
  // Appends the corresponding character to string unless `charcode`
  // is backspace.
  return Number(charcode) === 8 ?
    string.slice(0, Math.max(string.length - 1, 0)) :
    string + String.fromCharCode(charcode);
}

function format7DigitTel(string) {
  return string.replace(/^(\d\d\d)(\d)/, '$1-$2');
}

function format10DigitTel(string) {
  return string.replace(/^(\d\d\d)(\d\d\d)(\d)/, '($1) $2-$3');
}

function truncateLettersLeft(string, max, ellipsis) {
  var length = string.length;
  return length > max ? (ellipsis || '...') + string.slice(Math.max(length - max, 0)) : string;
}

function formatTel(string) {
  // String -> String

  var length = string.length;

  if (length < 8)
    return format7DigitTel(string);

  if(length < 11)
    return format10DigitTel(string);

  // @fixme Hard code max string length. If this were real-world, would want to
  // calculate maximum length based on the width of the container and the
  // em size. Better still would be to do some shrinking of text (I did
  // this in a branch but was getting sizing bugs from Firefox).
  if(length > 12)
    return truncateLettersLeft(string, 11);

  return string;
}

// Control flow logic
// ----------------------------------------------------------------------------

var dialpadEl = document.getElementById('dialer-dialpad');
var tapsOverTime = open(document.documentElement, isTouchSupport() ? 'touchstart' : 'click');

var dialButtonTapsOverTime = filter(tapsOverTime, function isEventTargetFromDialpad(event) {
  return hasClass(event.target, 'dialer-button') || hasClass(event.target, 'dialer-delete');
});

var charCodesOverTime = map(dialButtonTapsOverTime, getEventTargetValue);

var valuesOverTime = reductions(charCodesOverTime, buildString, '');

var uniqueValuesOverTime = dropRepeats(valuesOverTime);

var displayValuesOverTime = map(uniqueValuesOverTime, formatTel);

// var uniqueDialerValuesOverTime = dropRepeats(dialerValuesOverTime);

// Split stream into 2 streams:
//
// 1. All queries that have words.
// 2. All queries that do not have words.
var validQueriesOverTime = filter(uniqueValuesOverTime, function hasNonWhitespaceCharacter(possible) {
  return /\S/.test(possible);
});

// For every new value, we generate a Start of Query token.
var SOQsOverTime = map(uniqueValuesOverTime, SOQ);

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

var containerEl = document.getElementById('dialer-completions');
var inputEl = document.getElementById('dialer-result');

fold(displayValuesOverTime, setInnerHtmlFolder, inputEl);

fold(soqStream, function foldSOQs() {
  // For every start of query, empty the results element.
  containerEl.innerHTML = '';
});

fold(contactElsStream, function foldContactEls(result) {
  fold(slice(result[0]), appendChildFolder, containerEl);
});
