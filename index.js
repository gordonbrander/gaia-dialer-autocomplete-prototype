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
var concat = require('reducers/concat');
var expand = require('reducers/expand');
var print = require('reducers/debug/print');

var open = require('dom-reduce/event');

var sample = require('sample/sample');

var fps = require('./fps-reduce.js');

var coreduction = require('coreduction/coreduction');

var dropRepeats = require('transducer/drop-repeats');

var geneology = require('./geneology-reduce.js');

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

var sort = Array.sort || lambda(Array.prototype.sort);

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
  return ('' + string).replace(/[^\d.]/g, '');
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
  return slice(dummy.children);
}

function mapContactToHtmlString(contact) {
  return '<li class="dialer-completion" data-tel="' + contact.tel + '"><b class="title">' + contact.name + '</b> <div class="subtitle">' + contact.tel + '</div></li>';
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

function appendChildFolder(childEl, parentEl) {
  // Fold many children
  parentEl.appendChild(childEl);
  return parentEl;
}

function emptyInnerHtml(el) {
  el.innerHTML = '';
  return el;
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
  return el.classList && el.classList.contains(classString);
}

function setStyle(el, property, value) {
  // Set a style property on an element, mutating the DOM.
  // el -> el
  //
  // Before setting the property, check if the value is already set.
  if(el.style[property] !== value) el.style[property] = value;
  return el;
}

function charCodeAt0(string) {
  // Return the charcode for the character at position 0 of a string.
  // string -> string
  return String.charCodeAt(string[0]);
}

function charCodes(string) {
  // Return an array of charcodes for characters in a string.
  // string -> [charCode, charCode, ...]
  return map(string.split(''), charCodeAt0);
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

function first(thing) {
  // Basically `identity`.
  return thing;
}

function subtract1Min0(number) {
  // Subtract 1, but not below 0.
  return Math.max(number - 1, 0);
}

function isOnlyWhitespace(string) {
  // Regex search for any non-whitespace character. Negate the result.
  // If we find any non-whitespace character, than the string is not
  // whitespace only.
  return !(/\S/.test(string));
}

function compareGrepScores(a, b) {
  // Compare results of `grep-reduce/grep`, by grep score.
  // Array, Array -> Number
  // When used with `Array.sort` will return sorted array, reversed.
  var scoreA = a[1];
  var scoreB = b[1];
  return (
    scoreA < scoreB ?
      1 :
      (scoreA > scoreB ?
        -1 :
        0));
}

function fork(reducible, predicate) {
  // Fork a stream into 2 via a predicate.
  function reversePredicate(thing) {
    return !predicate(thing);
  }
  return [
    filter(reducible, predicate),
    filter(reducible, reversePredicate)
  ];
}

function hasClassDialerCompletionFolder(el, bool) {
  // A very specific func for folding dialer completion ancestors.
  return bool === true ? bool : hasClass(el, 'dialer-completion');
}

function dialerCompletionFolder(el, found) {
  // A very specific func for folding dialer completion ancestors.
  return hasClass(el, 'dialer-completion') ? el : found;
}

function liftMap(lambda) {
  // Transform a function, making it a mapping function.
  // (z -> y) -> ([x, x, ...] -> [y, y, ...])
  return function liftedMapper(array) {
    return map(array, lambda);
  }
}

function i0(array) {
  return array[0];
}

function stringConcatFolder(string, result) {
  return result + string;
}

// Control flow logic
// ----------------------------------------------------------------------------

var fpsStream = fps(20);

var dialpadEl = document.getElementById('dialer-dialpad');
var tapsOverTime = open(document.documentElement, isTouchSupport() ? 'touchstart' : 'click');

var completionTapsOverTime = filter(tapsOverTime, function (event) {
  // Search up the geneology tree for an element with the dialer-completion class.
  // The max depth of the geneology is 1. We don't want to search up the whole
  // tree!
  return fold(geneology(event.target, 1), hasClassDialerCompletionFolder, false);
});

// Drop any repeats.. we don't need 'em.
var completionElsOverTime = dropRepeats(map(completionTapsOverTime, function (event) {
  // Search again up the genology tree for the dialer completion element.
  // We could probably consolidate this step and the last into a single
  // fold/reduce thingy.
  return fold(geneology(event.target, 1), dialerCompletionFolder);
}));

var completionNumbersOverTime = map(completionElsOverTime, function (el) {
  return el.dataset.tel;
});

var completionNumberStringsOverTime = map(completionNumbersOverTime, extractNumbersString);
var completionCharCodesOverTime = expand(completionNumberStringsOverTime, function(string) {
  return concat(SOQ(), charCodes(string));
});

var completionsToggleTapsOverTime = filter(tapsOverTime, function isEventTargetFromCompletionsToggle(event) {
  return hasClass(event.target, 'dialer-completions-toggle');
});

var dialButtonTapsOverTime = filter(tapsOverTime, function isEventTargetFromDialpad(event) {
  return hasClass(event.target, 'dialer-button') || hasClass(event.target, 'dialer-delete');
});

var charCodesOverTime = merge([
  completionCharCodesOverTime,
  map(dialButtonTapsOverTime, getEventTargetValue)
]);

var valuesOverTime = reductions(charCodesOverTime, function buildString(string, thing) {
  // If `thing` is the start of a new query, clear out all numbers...
  if(isSOQ(thing)) return '';
  // If `thing` is charcode 8 (delete), remove a character...
  if(Number(thing) === 8) return string.slice(0, Math.max(string.length - 1, 0));
  // ...otherwise, append the corresponding character to string.
  return string + String.fromCharCode(thing);
}, '');

var queriesOverTime = dropRepeats(valuesOverTime);

var displayValuesOverTime = map(queriesOverTime, formatTel);

// 1-dimensional signal with `SOQ` delimeters indicating a query has started.
//
// Visualizing the list:
// `SOQ-o-o-o-o-SOQ-o-o-o-o-o-o-o-o-o-SOQ-o-o...`
//
// Use `dropRepeats` to remove adjacent repeats from signal. We don't need to
// react to the same thing 2x.
var everythingOverTime = dropRepeats(expand(queriesOverTime, function (value) {
  // If the value is only whitespace, return an empty list with an SOQ token.
  // Otherwise, search for matches.
  return isOnlyWhitespace(value) ? [SOQ()] : concat(SOQ(), grepContacts(value));
}));

// Here we accumulate possible permutations of the 1-dimensional list over time
// as 2-dimensional lists over time.
// It's basically a rolling buffer.
var resultSetReductionsOverTime = reductions(everythingOverTime, function (accumulated, thing) {
  return isSOQ(thing) ? [] : accumulated.concat([thing]);
}, []);

// We don't need to sample the rolling buffer more than 20fps.
var throttledResultSetsOverTime = dropRepeats(sample(resultSetReductionsOverTime, fpsStream));

// sort the throttled permutations.
var sortedResultSetsOverTime = map(throttledResultSetsOverTime, function(results) {
  return results.length > 0 ? sort(results, compareGrepScores) : results;
});

// Limit the throttled permutations to 10 top scorers.
var topResultSetsOverTime = map(sortedResultSetsOverTime, function (results) {
  return results.length > 10 ? slice(results, 0, 10) : results;
});

// [[result...]...] -> [[contact...]...]
var contactSetsOverTime = map(topResultSetsOverTime, liftMap(i0));

// [[contact...]...] -> [[string...]...]
var contactSetHtmlStringsOverTime = map(contactSetsOverTime, liftMap(mapContactToHtmlString));

// [[string...]...] -> [string...]
var resultsHtmlOverTime = map(contactSetHtmlStringsOverTime, function (htmlStrings) {
  return fold(htmlStrings, stringConcatFolder, '');
});

var countsOverTime = map(topResultSetsOverTime, function (results) {
  return results.length;
});

var moreCountsOverTime = map(countsOverTime, subtract1Min0);

var moreTextOverTime = map(moreCountsOverTime, function (number) {
  return number === 0 ? '' : '+' + number;
});

var completionsEl = document.getElementById('dialer-completions');
var resultEl = document.getElementById('dialer-result');
var completionsToggleEl = document.getElementById('dialer-completions-toggle');

fold(countsOverTime, function (count, completionsToggleEl) {
  completionsEl.classList.remove('dialer-completions-open');
  return setStyle(completionsToggleEl, 'display', (count > 1 ? 'block' : 'none'));
}, completionsToggleEl);

fold(moreTextOverTime, setInnerHtmlFolder, completionsToggleEl);

fold(displayValuesOverTime, setInnerHtmlFolder, resultEl);

fold(resultsHtmlOverTime, setInnerHtmlFolder, completionsEl);

fold(completionsToggleTapsOverTime, function(event, completionsEl) {
  var x = hasClass(completionsEl, 'dialer-completions-open') ?
    completionsEl.classList.remove('dialer-completions-open') :
    completionsEl.classList.add('dialer-completions-open');

  return completionsEl;
}, completionsEl);
