;(function(e,t,n,r){function i(r){if(!n[r]){if(!t[r]){if(e)return e(r);throw new Error("Cannot find module '"+r+"'")}var s=n[r]={exports:{}};t[r][0](function(e){var n=t[r][1][e];return i(n?n:e)},s,s.exports)}return n[r].exports}for(var s=0;s<r.length;s++)i(r[s]);return i})(typeof require!=="undefined"&&require,{1:[function(require,module,exports){/* This Source Code Form is subject to the terms of the Mozilla Public
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

var fps = require('./fps-reduce.js');

var coreduction = require('coreduction/coreduction');

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

function first(thing) {
  // Basically `identity`.
  return thing;
}

function subtract1Min0(number) {
  // Subtract 1, but not below 0.
  return Math.max(number - 1, 0);
}

// Control flow logic
// ----------------------------------------------------------------------------

var dialpadEl = document.getElementById('dialer-dialpad');
var tapsOverTime = open(document.documentElement, isTouchSupport() ? 'touchstart' : 'click');

var completionsToggleTapsOverTime = filter(tapsOverTime, function isEventTargetFromCompletionsToggle(event) {
  return hasClass(event.target, 'dialer-completions-toggle');
});

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

// Generate a stream of counts for incoming values.
var countsOverTime = reductions(everythingStream, function foldDelimitedCount(accumulated, thing) {
  // If `thing` is `SOQ()`, we're starting a new collection. Reset the count.
  return isSOQ(thing) ? 0 : accumulated + 1;
}, 0);

// Throttle counts at 5fps. Since in most cases counts will be tallied for
// syncronous sets of grep results, we want to avoid hitting the DOM `n` times.
var counts5fps = dropRepeats(coreduction(countsOverTime, fps(5), first));

var moreCountsOverTime = map(counts5fps, subtract1Min0);

var moreTextOverTime = map(moreCountsOverTime, function (number) {
  return number === 0 ? '' : '+' + number;
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

fold(moreTextOverTime, setInnerHtmlFolder, document.getElementById('dialer-completions-toggle'));

fold(displayValuesOverTime, setInnerHtmlFolder, inputEl);

fold(soqStream, function foldSOQs() {
  // For every start of query, empty the results element.
  containerEl.innerHTML = '';
});

fold(contactElsStream, function foldContactEls(result) {
  fold(slice(result[0]), appendChildFolder, containerEl);
});

fold(completionsToggleTapsOverTime, function(event, containerEl) {
  var x = hasClass(containerEl, 'dialer-completions-open') ?
    containerEl.classList.remove('dialer-completions-open') :
    containerEl.classList.add('dialer-completions-open');

  return containerEl;
}, containerEl);

},{"./data/contacts.json":2,"./fps-reduce.js":3,"reducers/fold":4,"reducers/filter":5,"reducers/map":6,"reducers/merge":7,"reducers/reductions":8,"reducers/debug/print":9,"dom-reduce/event":10,"coreduction/coreduction":11,"transducer/drop-repeats":12,"grep-reduce/grep":13,"functional/compose":14}],2:[function(require,module,exports){module.exports=[
  {
    "name":"Matt Helm",
    "tel":"(503) 177-2938"
  },
  {
    "name":"Hal Ambler",
    "tel":"(503) 877-6932"
  },
  {
    "name":"Ali Imran",
    "tel":"(503) 625-2445"
  },
  {
    "name":"Jane Blonde",
    "tel":"(198) 828-5828"
  },
  {
    "name":"Basil Argyros",
    "tel":"(389) 412-5035"
  },
  {
    "name":"Modesty Blaise",
    "tel":"(196) 764-8078"
  },
  {
    "name":"Sir Alan Blunt",
    "tel":"(415) 281-7417"
  },
  {
    "name":"James Bond",
    "tel":"(596) 630-1354"
  },
  {
    "name":"Felix Leiter",
    "tel":"(437) 897-8009"
  },
  {
    "name":"Nancy Drew",
    "tel":"(948) 691-8816"
  },
  {
    "name":"Sherlock Holmes",
    "tel":"(195) 100-3534"
  },
  {
    "name":"Jason Bourne",
    "tel":"(968) 814-6975"
  },
  {
    "name":"Tim Donohue",
    "tel":"(415) 300-5092"
  },
  {
    "name":"Sam Fisher",
    "tel":"(503) 714-6084"
  },
  {
    "name":"Stephen Metcalfe",
    "tel":"(590) 021-2511"
  },
  {
    "name":"Jack Ryan",
    "tel":"(371) 332-0309"
  },
  {
    "name":"Nick Fury",
    "tel":"(437) 914-3192"
  },
  {
    "name":"Ada Wong",
    "tel":"(415) 014-3944"
  },
  {
    "name":"Jack Bauer",
    "tel":"(415) 904-7370"
  },
  {
    "name":"Sydney Bristow",
    "tel":"(326) 778-6931"
  },
  {
    "name":"Ethan Hunt",
    "tel":"(415) 937-3942"
  },
  {
    "name":"Wyman Ford",
    "tel":"(826) 680-3347"
  },
  {
    "name":"Nick Carter-Killmaster",
    "tel":"(873) 393-7359"
  },
  {
    "name":"Johnny Fedora",
    "tel":"(416) 752-4420"
  },
  {
    "name":"Tamara Knight",
    "tel":"(416) 104-4478"
  },
  {
    "name":"Mitch Rapp",
    "tel":"(416) 863-2988"
  },
  {
    "name":"Michael Jagger",
    "tel":"(416) 272-5564"
  },
  {
    "name":"George Smiley",
    "tel":"(416) 049-8897"
  },
  {
    "name":"Simon Templar",
    "tel":"(805) 687-8498"
  },
  {
    "name":"Philip Quest",
    "tel":"(647) 084-4730"
  },
  {
    "name":"Mortadelo Pi",
    "tel":"(647) 018-7675"
  },
  {
    "name":"Filemón Pi",
    "tel":"(647) 593-9832"
  },
  {
    "name":"Maria Hill",
    "tel":"(647) 569-5749"
  }
]


},{}],14:[function(require,module,exports){"use strict";

var slicer = Array.prototype.slice

module.exports = compose
function compose() {
  /**
  Returns the composition of a list of functions, where each function
  consumes the return value of the function that follows. In math
  terms, composing the functions `f()`, `g()`, and `h()` produces
  `f(g(h()))`.
  Usage:
  var greet = function(name) { return 'hi: ' + name }
  var exclaim = function(statement) { return statement + '!' }
  var welcome = compose(exclaim, greet)
  welcome('moe')
  // => 'hi: moe!'
  **/

  var lambdas = slicer.call(arguments)
  return function composed() {
    var params = slicer.call(arguments)
    var index = lambdas.length
    var result = [lambdas[--index].apply(this, params)]
    while (0 <= --index) result[0] = lambdas[index].apply(this, result)
    return result[0]
  }
}

},{}],3:[function(require,module,exports){var reducible = require("reducible/reducible");
var isReduced = require("reducible/is-reduced");

function fps(desiredFps) {
  // Create a stream of times to use as an event loop with
  // https://github.com/Gozala/coreduction/blob/master/coreduction.js
  // Number -> Reducible[Float time, Float time, ...]

  // Convert seconds to milliseconds.
  var msPerFrame = 1000 / desiredFps

  return reducible(function reduceFps(next, result) {
    function tick() {
      // Pass current time to `next()`, and accumulate result.
      result = next(Date.now(), result);
      // If value has not been reduced, set a timer to go again.
      if(!isReduced(result)) setTimeout(tick, msPerFrame);
    }

    tick();
  })
}

module.exports = fps;


},{"reducible/reducible":15,"reducible/is-reduced":16}],5:[function(require,module,exports){"use strict";

var reducer = require("./reducer")

var filter = reducer(function filter(predicate, next, value, result) {
  /**
  Composes filtered version of given `source`, such that only items contained
  will be once on which `f(item)` was `true`.

  ## Example

  var digits = filter([ 10, 23, 2, 7, 17 ], function(value) {
    return value >= 0 && value <= 9
  })
  print(digits) // => < 2 7 >
  **/
  return predicate(value) ? next(value, result) :
         result
})

module.exports = filter

},{"./reducer":17}],6:[function(require,module,exports){"use strict";

var reducer = require("./reducer")

var map = reducer(function map(f, next, value, result) {
  /**
  Returns transformed version of given `source` where each item of it
  is mapped using `f`.

  ## Example

  var data = [{ name: "foo" }, { name: "bar" }]
  var names = map(data, function(value) { return value.name })
  print(names) // => < "foo" "bar" >
  **/
  next(f(value), result)
})

module.exports = map

},{"./reducer":17}],18:[function(require,module,exports){var events = require('events');

exports.isArray = isArray;
exports.isDate = function(obj){return Object.prototype.toString.call(obj) === '[object Date]'};
exports.isRegExp = function(obj){return Object.prototype.toString.call(obj) === '[object RegExp]'};


exports.print = function () {};
exports.puts = function () {};
exports.debug = function() {};

exports.inspect = function(obj, showHidden, depth, colors) {
  var seen = [];

  var stylize = function(str, styleType) {
    // http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
    var styles =
        { 'bold' : [1, 22],
          'italic' : [3, 23],
          'underline' : [4, 24],
          'inverse' : [7, 27],
          'white' : [37, 39],
          'grey' : [90, 39],
          'black' : [30, 39],
          'blue' : [34, 39],
          'cyan' : [36, 39],
          'green' : [32, 39],
          'magenta' : [35, 39],
          'red' : [31, 39],
          'yellow' : [33, 39] };

    var style =
        { 'special': 'cyan',
          'number': 'blue',
          'boolean': 'yellow',
          'undefined': 'grey',
          'null': 'bold',
          'string': 'green',
          'date': 'magenta',
          // "name": intentionally not styling
          'regexp': 'red' }[styleType];

    if (style) {
      return '\033[' + styles[style][0] + 'm' + str +
             '\033[' + styles[style][1] + 'm';
    } else {
      return str;
    }
  };
  if (! colors) {
    stylize = function(str, styleType) { return str; };
  }

  function format(value, recurseTimes) {
    // Provide a hook for user-specified inspect functions.
    // Check that value is an object with an inspect function on it
    if (value && typeof value.inspect === 'function' &&
        // Filter out the util module, it's inspect function is special
        value !== exports &&
        // Also filter out any prototype objects using the circular check.
        !(value.constructor && value.constructor.prototype === value)) {
      return value.inspect(recurseTimes);
    }

    // Primitive types cannot have properties
    switch (typeof value) {
      case 'undefined':
        return stylize('undefined', 'undefined');

      case 'string':
        var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                                 .replace(/'/g, "\\'")
                                                 .replace(/\\"/g, '"') + '\'';
        return stylize(simple, 'string');

      case 'number':
        return stylize('' + value, 'number');

      case 'boolean':
        return stylize('' + value, 'boolean');
    }
    // For some reason typeof null is "object", so special case here.
    if (value === null) {
      return stylize('null', 'null');
    }

    // Look up the keys of the object.
    var visible_keys = Object_keys(value);
    var keys = showHidden ? Object_getOwnPropertyNames(value) : visible_keys;

    // Functions without properties can be shortcutted.
    if (typeof value === 'function' && keys.length === 0) {
      if (isRegExp(value)) {
        return stylize('' + value, 'regexp');
      } else {
        var name = value.name ? ': ' + value.name : '';
        return stylize('[Function' + name + ']', 'special');
      }
    }

    // Dates without properties can be shortcutted
    if (isDate(value) && keys.length === 0) {
      return stylize(value.toUTCString(), 'date');
    }

    var base, type, braces;
    // Determine the object type
    if (isArray(value)) {
      type = 'Array';
      braces = ['[', ']'];
    } else {
      type = 'Object';
      braces = ['{', '}'];
    }

    // Make functions say that they are functions
    if (typeof value === 'function') {
      var n = value.name ? ': ' + value.name : '';
      base = (isRegExp(value)) ? ' ' + value : ' [Function' + n + ']';
    } else {
      base = '';
    }

    // Make dates with properties first say the date
    if (isDate(value)) {
      base = ' ' + value.toUTCString();
    }

    if (keys.length === 0) {
      return braces[0] + base + braces[1];
    }

    if (recurseTimes < 0) {
      if (isRegExp(value)) {
        return stylize('' + value, 'regexp');
      } else {
        return stylize('[Object]', 'special');
      }
    }

    seen.push(value);

    var output = keys.map(function(key) {
      var name, str;
      if (value.__lookupGetter__) {
        if (value.__lookupGetter__(key)) {
          if (value.__lookupSetter__(key)) {
            str = stylize('[Getter/Setter]', 'special');
          } else {
            str = stylize('[Getter]', 'special');
          }
        } else {
          if (value.__lookupSetter__(key)) {
            str = stylize('[Setter]', 'special');
          }
        }
      }
      if (visible_keys.indexOf(key) < 0) {
        name = '[' + key + ']';
      }
      if (!str) {
        if (seen.indexOf(value[key]) < 0) {
          if (recurseTimes === null) {
            str = format(value[key]);
          } else {
            str = format(value[key], recurseTimes - 1);
          }
          if (str.indexOf('\n') > -1) {
            if (isArray(value)) {
              str = str.split('\n').map(function(line) {
                return '  ' + line;
              }).join('\n').substr(2);
            } else {
              str = '\n' + str.split('\n').map(function(line) {
                return '   ' + line;
              }).join('\n');
            }
          }
        } else {
          str = stylize('[Circular]', 'special');
        }
      }
      if (typeof name === 'undefined') {
        if (type === 'Array' && key.match(/^\d+$/)) {
          return str;
        }
        name = JSON.stringify('' + key);
        if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
          name = name.substr(1, name.length - 2);
          name = stylize(name, 'name');
        } else {
          name = name.replace(/'/g, "\\'")
                     .replace(/\\"/g, '"')
                     .replace(/(^"|"$)/g, "'");
          name = stylize(name, 'string');
        }
      }

      return name + ': ' + str;
    });

    seen.pop();

    var numLinesEst = 0;
    var length = output.reduce(function(prev, cur) {
      numLinesEst++;
      if (cur.indexOf('\n') >= 0) numLinesEst++;
      return prev + cur.length + 1;
    }, 0);

    if (length > 50) {
      output = braces[0] +
               (base === '' ? '' : base + '\n ') +
               ' ' +
               output.join(',\n  ') +
               ' ' +
               braces[1];

    } else {
      output = braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
    }

    return output;
  }
  return format(obj, (typeof depth === 'undefined' ? 2 : depth));
};


function isArray(ar) {
  return ar instanceof Array ||
         Array.isArray(ar) ||
         (ar && ar !== Object.prototype && isArray(ar.__proto__));
}


function isRegExp(re) {
  return re instanceof RegExp ||
    (typeof re === 'object' && Object.prototype.toString.call(re) === '[object RegExp]');
}


function isDate(d) {
  if (d instanceof Date) return true;
  if (typeof d !== 'object') return false;
  var properties = Date.prototype && Object_getOwnPropertyNames(Date.prototype);
  var proto = d.__proto__ && Object_getOwnPropertyNames(d.__proto__);
  return JSON.stringify(proto) === JSON.stringify(properties);
}

function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}

var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}

exports.log = function (msg) {};

exports.pump = null;

var Object_keys = Object.keys || function (obj) {
    var res = [];
    for (var key in obj) res.push(key);
    return res;
};

var Object_getOwnPropertyNames = Object.getOwnPropertyNames || function (obj) {
    var res = [];
    for (var key in obj) {
        if (Object.hasOwnProperty.call(obj, key)) res.push(key);
    }
    return res;
};

var Object_create = Object.create || function (prototype, properties) {
    // from es5-shim
    var object;
    if (prototype === null) {
        object = { '__proto__' : null };
    }
    else {
        if (typeof prototype !== 'object') {
            throw new TypeError(
                'typeof prototype[' + (typeof prototype) + '] != \'object\''
            );
        }
        var Type = function () {};
        Type.prototype = prototype;
        object = new Type();
        object.__proto__ = prototype;
    }
    if (typeof properties !== 'undefined' && Object.defineProperties) {
        Object.defineProperties(object, properties);
    }
    return object;
};

exports.inherits = function(ctor, superCtor) {
  ctor.super_ = superCtor;
  ctor.prototype = Object_create(superCtor.prototype, {
    constructor: {
      value: ctor,
      enumerable: false,
      writable: true,
      configurable: true
    }
  });
};

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (typeof f !== 'string') {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(exports.inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j': return JSON.stringify(args[i++]);
      default:
        return x;
    }
  });
  for(var x = args[i]; i < len; x = args[++i]){
    if (x === null || typeof x !== 'object') {
      str += ' ' + x;
    } else {
      str += ' ' + exports.inspect(x);
    }
  }
  return str;
};

},{"events":19}],4:[function(require,module,exports){"use strict";

var reduce = require("reducible/reduce")
var isError = require("reducible/is-error")
var isReduced = require("reducible/is-reduced")
var end = require("reducible/end")

var Eventual = require("eventual/type")
var deliver = require("eventual/deliver")
var defer = require("eventual/defer")
var when = require("eventual/when")


// All eventual values are reduced same as the values they realize to.
reduce.define(Eventual, function reduceEventual(eventual, next, initial) {
  return when(eventual, function delivered(value) {
    return reduce(value, next, initial)
  }, function failed(error) {
    next(error, initial)
    return error
  })
})


function fold(source, next, initial) {
  /**
  Fold is just like `reduce` with a difference that `next` reducer / folder
  function it takes has it's parameters reversed. One always needs `value`,
  but not always accumulated one. To avoid conflict with array `reduce` we
  have a `fold`.
  **/
  var promise = defer()
  reduce(source, function fold(value, state) {
    // If source is `end`-ed deliver accumulated `state`.
    if (value === end) return deliver(promise, state)
    // If is source has an error, deliver that.
    else if (isError(value)) return deliver(promise, value)

    // Accumulate new `state`
    try { state = next(value, state) }
    // If exception is thrown at accumulation deliver thrown error.
    catch (error) { return deliver(promise, error) }

    // If already reduced, then deliver.
    if (isReduced(state)) deliver(promise, state.value)

    return state
  }, initial)

  // Wrap in `when` in case `promise` is already delivered to return an
  // actual value.
  return when(promise)
}

module.exports = fold

},{"reducible/reduce":20,"reducible/is-error":21,"reducible/is-reduced":16,"reducible/end":22,"eventual/type":23,"eventual/deliver":24,"eventual/defer":25,"eventual/when":26}],7:[function(require,module,exports){"use strict";

var reduce = require("reducible/reduce")
var reducible = require("reducible/reducible")
var end = require("reducible/end")
var isError = require("reducible/is-error")

function merge(source) {
  /**
  Merges given collection of collections to a collection with items of
  all nested collections. Note that items in the resulting collection
  are ordered by the time rather then index, in other words if item from
  the second nested collection is deliver earlier then the item
  from first nested collection it will in appear earlier in the resulting
  collection.

  print(merge([ [1, 2], [3, 4] ]))  // => < 1 2 3 4 >
  **/
  return reducible(function accumulateMerged(next, initial) {
    var state = initial
    var open = 1

    function forward(value) {
      if (value === end) {
        open = open - 1
        if (open === 0) return next(end)
      } else {
        state = next(value, state)
      }
      return state
    }


    reduce(source, function accumulateMergeSource(nested) {
      // If there is an error or end of `source` collection just pass it
      // to `forward` it will take care of detecting weather it's error
      // or `end`. In later case it will also figure out if it's `end` of
      // result to and act appropriately.
      if (nested === end) return forward(end)
      if (isError(nested)) return forward(nested)
      // If `nested` item is not end nor error just `accumulate` it via
      // `forward` that keeps track of all collections that are bing forwarded
      // to it.
      open = open + 1
      reduce(nested, forward, null)
    }, initial)
  })
}

module.exports = merge

},{"reducible/reduce":20,"reducible/reducible":15,"reducible/end":22,"reducible/is-error":21}],8:[function(require,module,exports){"use strict";

var reduce = require("reducible/reduce")
var reducible = require("reducible/reducible")
var end = require("reducible/end")
var isError = require("reducible/is-error")

function reductions(source, f, initial) {
  /**
  Returns `reducible` collection of the intermediate values of the reduction
  (as per reduce) of `source` by `f`, starting with `initial` value.

  ## Example

  var numbers = reductions([1, 1, 1, 1], function(accumulated, value) {
    return accumulated + value
  }, 0)
  print(numbers) // => < 1 2 3 4 >
  **/
  return reducible(function reduceReductions(next, start) {
    var state = initial
    return reduce(source, function reduceReductionsSource(value, result) {
      if (value === end) return next(end, result)
      if (isError(value)) return next(value, result)
      state = f(state, value)
      return next(state, result)
    }, start)
  })
}

module.exports = reductions

},{"reducible/reducible":15,"reducible/reduce":20,"reducible/end":22,"reducible/is-error":21}],10:[function(require,module,exports){/* vim:set ts=2 sw=2 sts=2 expandtab */
/*jshint asi: true undef: true es5: true node: true browser: true devel: true
         forin: true latedef: false globalstrict: true */

"use strict";

var reducible = require("reducible/reducible")
var isReduced = require("reducible/is-reduced")

function open(target, type, options) {
  /**
  Capture events on a DOM element, converting them to a reducible channel.
  Returns a reducible channel.

  ## Example

      var allClicks = open(document.documentElement, "click")
      var clicksOnMyTarget = filter(allClicks, function (click) {
        return click.target === myTarget
      })
  **/
  var capture = options && options.capture || false
  return reducible(function reducDomEvents(next, result) {
    function handler(event) {
      result = next(event, result)
      //  When channel is marked as accumulated, remove event listener.
      if (isReduced(result)) {
        if (target.removeEventListener)
          target.removeEventListener(type, handler, capture)
        else
          target.detachEvent(type, handler, capture)
      }
    }
    if (target.addEventListener) target.addEventListener(type, handler, capture)
    else target.attachEvent("on" + type, handler)
  })
}

module.exports = open

},{"reducible/reducible":15,"reducible/is-reduced":16}],15:[function(require,module,exports){(function(){"use strict";

var reduce = require("./reduce")
var end = require("./end")
var isError = require("./is-error")
var isReduced = require("./is-reduced")
var reduced = require("./reduced")

function Reducible(reduce) {
  /**
  Reducible is a type of the data-structure that represents something
  that can be reduced. Most of the time it's used to represent transformation
  over other reducible by capturing it in a lexical scope.

  Reducible has an attribute `reduce` pointing to a function that does
  reduction.
  **/

  // JS engines optimize access to properties that are set in the constructor's
  // so we set it here.
  this.reduce = reduce
}

// Implementation of `accumulate` for reducible, which just delegates to it's
// `reduce` attribute.
reduce.define(Reducible, function reduceReducible(reducible, next, initial) {
  var result
  // State is intentionally accumulated in the outer variable, that way no
  // matter if consumer is broken and passes in wrong accumulated state back
  // this reducible will still accumulate result as intended.
  var state = initial
  try {
    reducible.reduce(function forward(value) {
      try {
        // If reduction has already being completed return is set to
        // an accumulated state boxed via `reduced`. It's set to state
        // that is return to signal input that reduction is complete.
        if (result) state = result
        // if dispatched `value` is is special `end` of input one or an error
        // just forward to reducer and store last state boxed as `reduced` into
        // state. Later it will be assigned to result and returned to input
        // to indicate end of reduction.
        else if (value === end || isError(value)) {
          next(value, state)
          state = reduced(state)
        }
        // if non of above just accumulate new state by passing value and
        // previously accumulate state to reducer.
        else state = next(value, state)

        // If state is boxed with `reduced` then accumulation is complete.
        // Indicated explicitly by a reducer or by end / error of the input.
        // Either way store it to the result in case broken input attempts to
        // call forward again.
        if (isReduced(state)) result = state

        // return accumulated state back either way.
        return state
      }
      // If error is thrown then forward it to the reducer such that consumer
      // can apply recovery logic. Also store current `state` boxed with
      // `reduced` to signal input that reduction is complete.
      catch (error) {
        next(error, state)
        result = reduced(state)
        return result
      }
    })
  }
  // It could be that attempt to reduce underlaying reducible throws, if that
  // is the case still forward an `error` to a reducer and store reduced state
  // into result, in case process of reduction started before exception and
  // forward will still be called. Return result either way to signal
  // completion.
  catch(error) {
    next(error, state)
    result = reduced(state)
    return result
  }
})

function reducible(reduce) {
  return new Reducible(reduce)
}
reducible.type = Reducible

module.exports = reducible

})()
},{"./reduce":20,"./end":22,"./is-error":21,"./is-reduced":16,"./reduced":27}],16:[function(require,module,exports){"use strict";

var reduced = require("./reduced")

function isReduced(value) {
  return value && value.is === reduced
}

module.exports = isReduced

},{"./reduced":27}],11:[function(require,module,exports){"use strict";

var reducible = require("reducible/reducible")
var reduced = require("reducible/reduced")
var end = require("reducible/end")
var isError = require("reducible/is-error")
var isReduced = require("reducible/is-reduced")
var reduce = require("reducible/reduce")

// Special value indicating that no value has being aggregated.
var nil = new String("Indication of no value")

function coreduction(left, right, assemble) {
  /**
  Takes two reducibles and returns reducible of pairs, where each item from
  either input is paired with a last item from the other. This of course means
  that items from both left and right side may repeat many times. Result ends
  once either of the inputs end. Optionally `assemble` function may be passed
  as a third argument in which case it will be invoked with pairs as arguments
  to produce values of the resulting reducible.
  **/

  assemble = typeof(assemble) === "function" ? assemble : Array
  return reducible(function reduceCoupled(next, initial) {
    var result
    var state = initial
    var leftValue = nil
    var rightValue = nil

    function reducer(isLeft) {
      // create a reducer function for either left or right reducible.
      return function coreduce(value) {
        // If result is already set then either `left` or `right` reducible
        // has finished or broke and stored `reduced` state returning which
        // should signal source to stop reduction.
        if (result) return result
        // If `end` or error value is yield store result and pass value down
        // the flow so that error / end can be handled.
        if (value === end || isError(value)) {
          result = reduced(state)
          return next(value, state)
        }

        // Update last value for the associated reducible.
        if (isLeft) leftValue = value
        else rightValue = value

        // If both reducibles yielded already values couple last ones
        // and pass it down the flow.
        if (leftValue !== nil && rightValue !== nil) {
          state = next(assemble(leftValue, rightValue), state)

          // If reduction is complete store result to stop the other reducible.
          if (isReduced(state)) result = state

          return state
        }
      }
    }

    reduce(left, reducer(true))
    reduce(right, reducer(false))
  })
}

module.exports = coreduction

},{"reducible/reducible":15,"reducible/reduced":27,"reducible/end":22,"reducible/is-error":21,"reducible/is-reduced":16,"reducible/reduce":20}],12:[function(require,module,exports){"use strict";

var reductions = require("reducers/reductions")
var filter = require("reducers/filter")
var map = require("reducers/map")


var ITEM = 0
var EQUAL = 1

function dropRepeats(input, assert) {
  /**
  Takes reducible `input` and returns narrowed down version with sequential
  repeated values dropped. For example, if a given `input` contains items has
  following form `< 1 1 2 2 1 >` then result will have a form of `< 1 2 1 >` by
  dropping the values that are the same as the previous value. Function takes
  second optional argument `assert` that can be used to compare items. Items
  to which `assert` returns true will be dropped.

  ## Examples

      dropRepeats([1, 2, 2, 3, 4, 4, 4, 4, 5])
      // => < 1 2 3 4 5 >

      dropRepeats([1, "1", 2, "2", 2, 2, 3, 4, "4"])
      // => < 1 "1" 2 "2" 2 3 4 "4" >

      dropRepeats([1, "1", 2, "2", 2, 3, 4, "4"], function(a, b) {
        return a == b
      })
      // => < 1 2 3 4 >
  **/
  var states = reductions(input, function(state, item) {
    var equal = assert ? assert(state[ITEM], item) :
                item === state[ITEM]
    return [item, equal]
  }, [{}])
  var updates = filter(states, function(state) { return !state[EQUAL] })
  return map(updates, function(update) { return update[ITEM] })
}

module.exports = dropRepeats

},{"reducers/reductions":8,"reducers/filter":5,"reducers/map":6}],28:[function(require,module,exports){// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            if (ev.source === window && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

process.binding = function (name) {
    throw new Error('process.binding is not supported');
}

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

},{}],19:[function(require,module,exports){(function(process){if (!process.EventEmitter) process.EventEmitter = function () {};

var EventEmitter = exports.EventEmitter = process.EventEmitter;
var isArray = typeof Array.isArray === 'function'
    ? Array.isArray
    : function (xs) {
        return Object.prototype.toString.call(xs) === '[object Array]'
    }
;
function indexOf (xs, x) {
    if (xs.indexOf) return xs.indexOf(x);
    for (var i = 0; i < xs.length; i++) {
        if (x === xs[i]) return i;
    }
    return -1;
}

// By default EventEmitters will print a warning if more than
// 10 listeners are added to it. This is a useful default which
// helps finding memory leaks.
//
// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
var defaultMaxListeners = 10;
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!this._events) this._events = {};
  this._events.maxListeners = n;
};


EventEmitter.prototype.emit = function(type) {
  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events || !this._events.error ||
        (isArray(this._events.error) && !this._events.error.length))
    {
      if (arguments[1] instanceof Error) {
        throw arguments[1]; // Unhandled 'error' event
      } else {
        throw new Error("Uncaught, unspecified 'error' event.");
      }
      return false;
    }
  }

  if (!this._events) return false;
  var handler = this._events[type];
  if (!handler) return false;

  if (typeof handler == 'function') {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        var args = Array.prototype.slice.call(arguments, 1);
        handler.apply(this, args);
    }
    return true;

  } else if (isArray(handler)) {
    var args = Array.prototype.slice.call(arguments, 1);

    var listeners = handler.slice();
    for (var i = 0, l = listeners.length; i < l; i++) {
      listeners[i].apply(this, args);
    }
    return true;

  } else {
    return false;
  }
};

// EventEmitter is defined in src/node_events.cc
// EventEmitter.prototype.emit() is also defined there.
EventEmitter.prototype.addListener = function(type, listener) {
  if ('function' !== typeof listener) {
    throw new Error('addListener only takes instances of Function');
  }

  if (!this._events) this._events = {};

  // To avoid recursion in the case that type == "newListeners"! Before
  // adding it to the listeners, first emit "newListeners".
  this.emit('newListener', type, listener);

  if (!this._events[type]) {
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  } else if (isArray(this._events[type])) {

    // Check for listener leak
    if (!this._events[type].warned) {
      var m;
      if (this._events.maxListeners !== undefined) {
        m = this._events.maxListeners;
      } else {
        m = defaultMaxListeners;
      }

      if (m && m > 0 && this._events[type].length > m) {
        this._events[type].warned = true;
        console.error('(node) warning: possible EventEmitter memory ' +
                      'leak detected. %d listeners added. ' +
                      'Use emitter.setMaxListeners() to increase limit.',
                      this._events[type].length);
        console.trace();
      }
    }

    // If we've already got an array, just append.
    this._events[type].push(listener);
  } else {
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  var self = this;
  self.on(type, function g() {
    self.removeListener(type, g);
    listener.apply(this, arguments);
  });

  return this;
};

EventEmitter.prototype.removeListener = function(type, listener) {
  if ('function' !== typeof listener) {
    throw new Error('removeListener only takes instances of Function');
  }

  // does not use listeners(), so no side effect of creating _events[type]
  if (!this._events || !this._events[type]) return this;

  var list = this._events[type];

  if (isArray(list)) {
    var i = indexOf(list, listener);
    if (i < 0) return this;
    list.splice(i, 1);
    if (list.length == 0)
      delete this._events[type];
  } else if (this._events[type] === listener) {
    delete this._events[type];
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  if (arguments.length === 0) {
    this._events = {};
    return this;
  }

  // does not use listeners(), so no side effect of creating _events[type]
  if (type && this._events && this._events[type]) this._events[type] = null;
  return this;
};

EventEmitter.prototype.listeners = function(type) {
  if (!this._events) this._events = {};
  if (!this._events[type]) this._events[type] = [];
  if (!isArray(this._events[type])) {
    this._events[type] = [this._events[type]];
  }
  return this._events[type];
};

})(require("__browserify_process"))
},{"__browserify_process":28}],21:[function(require,module,exports){"use strict";

var stringifier = Object.prototype.toString

function isError(value) {
  return stringifier.call(value) === "[object Error]"
}

module.exports = isError

},{}],22:[function(require,module,exports){"use strict";

module.exports = String("End of the collection")

},{}],27:[function(require,module,exports){"use strict";


// Exported function can be used for boxing values. This boxing indicates
// that consumer of sequence has finished consuming it, there for new values
// should not be no longer pushed.
function reduced(value) {
  /**
  Boxes given value and indicates to a source that it's already reduced and
  no new values should be supplied
  **/
  return { value: value, is: reduced }
}

module.exports = reduced

},{}],9:[function(require,module,exports){(function(process){"use strict";

var reduce = require("reducible/reduce")
var reducible = require("reducible/reducible")
var end = require("reducible/end")
var isError = require("reducible/is-error")

var PREFIX = "\u200B"
var OPEN = PREFIX + "< "
var CLOSE = PREFIX + ">\n"
var ERROR = PREFIX + "\u26A1 "
var DELIMITER = PREFIX + " "

var SPECIALS = [ OPEN, CLOSE, ERROR, DELIMITER ]

var write = (function() {
  if (typeof(process) !== "undefined" &&
      typeof(process.stdout) !== "undefined" &&
      typeof(process.stdout.write) === "function") {
    var inspect = require("util").inspect
    var slicer = Array.prototype.slice
    return function write() {
      var message = slicer.call(arguments).map(function($) {
        return SPECIALS.indexOf($) >= 0 ? $ : inspect($)
      }).join("")
      process.stdout.write(message)
    }
  } else {
    return console.log.bind(console)
  }
})()

function print(source) {
  var open = false
  reduce(source, function reducePrintSource(value) {
    if (!open) write(OPEN)
    open = true

    if (value === end) write(CLOSE)
    else if (isError(value)) write(ERROR, value, DELIMITER, CLOSE)
    else write(value, DELIMITER)
  })
}

module.exports = print

})(require("__browserify_process"))
},{"util":18,"reducible/reduce":20,"reducible/end":22,"reducible/is-error":21,"reducible/reducible":15,"__browserify_process":28}],29:[function(require,module,exports){/* vim:set ts=2 sw=2 sts=2 expandtab */
/*jshint asi: true undef: true es5: true node: true browser: true devel: true
         forin: true latedef: false globalstrict: true*/

"use strict";

function Calculator(SCORE_BASE, SCORE_LENGTH) {
  var SCORE_INDEX = 1 - SCORE_BASE - SCORE_LENGTH
  return function score(pattern, input) {
    /**
    Calculates the score for use in suggestions from
    a result array `match` of `RegExp#exec`.
    **/
    input = String(input)
    var match, length = input.length, value = null
    if ((match = pattern.exec(input))) {
      value = SCORE_BASE +
              SCORE_LENGTH * Math.sqrt(match[0].length / length) +
              SCORE_INDEX  * (1 - match.index / length)
    }
    return value
  }
}

var score = Calculator(0.3, 0.25)
score.make = Calculator

module.exports = score

},{}],24:[function(require,module,exports){"use strict";

// Anyone crating an eventual will likely need to realize it, requiring
// dependency on other package is complicated, not to mention that one
// can easily wind up with several copies that does not necessary play
// well with each other. Exposing this solves the issues.
module.exports = require("pending/deliver")

},{"pending/deliver":30}],25:[function(require,module,exports){"use strict";

var Eventual = require("./type")
var defer = function defer() { return new Eventual() }

module.exports = defer

},{"./type":23}],17:[function(require,module,exports){(function(process){"use strict";

var reduce = require("reducible/reduce")
var reducible = require("reducible/reducible")
var isError = require("reducible/is-error")
var end = require("reducible/end")


function reducer(process) {
  /**
  Convenience function to simplify definitions of transformation function, to
  avoid manual definition of `reducible` results and currying transformation
  function. It creates typical transformation function with a following
  signature:

      transform(source, options)

  From a pure data `process` function that is called on each value for a
  collection with following arguments:

    1. `options` - Options passed to the resulting transformation function
       most commonly that's a function like in `map(source, f)`.
    2. `next` - Function which needs to be invoked with transformed value,
       or simply not called to skip the value.
    3. `value` - Last value emitted by a collection being reduced.
    4. `result` - Accumulate value.

  Function is supposed to return new, accumulated `result`. It may either
  pass mapped transformed `value` and `result` to the `next` continuation
  or skip it.

  For example see `map` and `filter` functions.
  **/
  return function reducer(source, options) {
    // When return transformation function is called with a source and
    // `options`
    return reducible(function reduceReducer(next, initial) {
      // When actual result is 
      reduce(source, function reduceReducerSource(value, result) {
        // If value is `end` of source or an error just propagate through,
        // otherwise call `process` with all the curried `options` and `next`
        // continuation function.
        return value === end ? next(value, result) :
               isError(value) ? next(value, result) :
               process(options, next, value, result)
      })
    })
  }
}

module.exports = reducer

})(require("__browserify_process"))
},{"reducible/reduce":20,"reducible/reducible":15,"reducible/is-error":21,"reducible/end":22,"__browserify_process":28}],13:[function(require,module,exports){"use strict";

var filter = require("reducers/filter")
var map = require("reducers/map")
var Pattern = require("pattern-exp")
var score = require("match-score")

function isPositiveScore(data) { return data[1] > 0 }

function grep(pattern, data, serialize) {
  /**
  Function returns values from `data` paired with the match score for
  `pattern`. If there is no match value will be excluded from the result.

  ## Examples

  **/
 
  if (typeof(serialize) !== "function") serialize = String
  // Creating pattern from the given input.
  pattern = Pattern(pattern || "", "i")
  // Map to data value and pattern match score pairs.
  var scoredData = map(data, function(value) {
    return [ value, score(pattern, serialize(value)) ]
  })
  // Filter only matches who's score is positive.
  return filter(scoredData, isPositiveScore)
}

module.exports = grep

},{"reducers/filter":5,"reducers/map":6,"match-score":29,"pattern-exp":31}],31:[function(require,module,exports){/* vim:set ts=2 sw=2 sts=2 expandtab */
/*jshint asi: true undef: true es5: true node: true browser: true devel: true
         forin: true latedef: false globalstrict: true*/

"use strict";

var stirgifier = Object.prototype.toString
var ESCAPE_PATTERN = /[\.\?\*\+\^\$\|\(\)\{\[\]\\]/g

function escape(pattern) {
  /**
  Returns the `pattern` with all regexp meta characters in it backslashed.
  **/
  return String(pattern).replace(ESCAPE_PATTERN, '\\$&')
}
escape.pattern = ESCAPE_PATTERN

function Pattern(pattern, flags) {
  /**
  Function takes `pattern` string or regexp & optional flags string,
  which is just regexp flags and returns instance of `RegExp` by actually
  calling it. If pattern fails to compile it will escaped given pattern and
  compile it to regexp after.

  ## examples
 
  RegExp("[")          // => SyntaxError("unterminated character class")
  RegExp(/:/, "y")     // => TypeError("can't supply flags when ...")
  Pattern("[")          // => /\[/
  Pattern(/:/, "y")     // => /:/
  **/
  if (!pattern.exec) {
    try {
      pattern = RegExp(pattern, flags)
    } catch (exception) {
      if (exception instanceof SyntaxError)
        pattern = RegExp(escape(pattern), flags)
      else
        throw exception
    }
  }
  return pattern
}
Pattern.escape = escape

module.exports = Pattern

},{}],23:[function(require,module,exports){(function(){"use strict";

var watchers = require("watchables/watchers")
var watch = require("watchables/watch")
var await = require("pending/await")
var isPending = require("pending/is")
var deliver = require("./deliver")
var when = require("./when")

// Internal utility function returns true if given value is of error type,
// otherwise returns false.
var isError = (function() {
  var stringy = Object.prototype.toString
  var error = stringy.call(Error.prototype)
  return function isError(value) {
    return stringy.call(value) === error
  }
})()

// Internal utility, identity function. Returns whatever is given to it.
function identity(value) { return value }

// Internal utility, decorator function that wraps given function into
// try / catch and returns thrown exception in case when exception is
// thrown.
function attempt(f) {
  return function effort(value) {
    try { return f(value) }
    catch (error) { return error }
  }
}


// Define property names used by an `Eventual` type. Names are prefixed via
// `module.id` to avoid name conflicts.
var observers = "observers@" + module.id
var result = "value@" + module.id
var pending = "pending@" + module.id


function Eventual() {
  /**
  Data type representing eventual value, that can be observed and delivered.
  Type implements `watchable`, `pending` and `eventual` abstractions, where
  first two are defined in an external libraries.
  **/
  this[observers] = []
  this[result] = this
  this[pending] = true
}
// Expose property names via type static properties so that it's easier
// to refer to them while debugging.
Eventual.observers = observers
Eventual.result = result
Eventual.pending = pending

watchers.define(Eventual, function(value) {
  return value[observers]
})
// Eventual values considered to be pending until the are deliver by calling
// `deliver`. Internal `pending` property is used to identify weather value
// is being watched or not.
isPending.define(Eventual, function(value) {
  return value[pending]
})
// Eventual type implements await function of pending abstraction, to enable
// observation of value delivery.
await.define(Eventual, function(value, observer) {
  if (isPending(value)) watch(value, observer)
  else observer(value[result])
})

// Eventual implements `deliver` function of pending abstraction, to enable
// fulfillment of eventual values. Eventual value can be delivered only once,
// which will transition it from pending state to non-pending state. All
// further deliveries are ignored. It's also guaranteed that all the registered
// observers will be invoked in FIFO order.
deliver.define(Eventual, function(value, data) {
  // Ignore delivery if value is no longer pending, or if it's in a process of
  // delivery (in this case eventual[result] is set to value other than
  // eventual itself). Also ignore if data deliver is value itself.
  if (value !== data && isPending(value) && value[result] === value) {
    var count = 0
    var index = 0
    var delivering = true
    var observers = void(0)
    // Set eventual value result to passed data value that also marks value
    // as delivery in progress. This way all the `deliver` calls is side
    // effect to this will be ignored. Note: value should still remain pending
    // so that new observers could be registered instead of being called
    // immediately, otherwise it breaks FIFO order.
    value[result] = data
    while (delivering) {
      // If current batch of observers is exhausted, splice a new batch
      // and continue delivery. New batch is created only if new observers
      // are registered in side effect to this call of deliver.
      if (index === count) {
        observers = watchers(value).splice(0)
        count = observers.length
        index = 0
        // If new observers have not being registered mark value as no longer
        // pending and finish delivering.
        if (count === index) {
          value[pending] = false
          delivering = false
        }
      }
      // Register await handlers on given result, is it may be eventual /
      // pending itself. Delivering eventual will cause delivery of the
      // delivered eventual's delivery value, whenever that would be.
      else {
        await(data, observers[index])
        index = index + 1
      }
    }
  }
})

// Eventual implements `when` polymorphic function that is part of it's own
// abstraction. It takes `value` `onFulfill` & `onError` handlers. In return
// when returns eventual value, that is delivered return value of the handler
// that is invoked depending on the given values delivery. If deliver value
// is of error type error handler is invoked. If value is delivered with other
// non-pending value that is not of error type `onFulfill` handlers is invoked
// with it. If pending value is delivered then it's value will be delivered
// it's result whenever that would be. This will cause both value and error
// propagation.
when.define(Eventual, function(value, onRealize, onError) {
  // Create eventual value for a return value.
  var delivered = false
  var eventual = void(0)
  var result = void(0)
  // Wrap handlers into attempt decorator function, so that in case of
  // exception thrown error is returned causing error propagation. If handler
  // is missing identity function is used instead to propagate value / error.
  var realize = onRealize ? attempt(onRealize) : identity
  var error = onError ? attempt(onError) : identity
  // Wait for pending value to be delivered.
  await(value, function onDeliver(data) {
    // Once value is delivered invoke appropriate handler, and deliver it
    // to a resulting eventual value.
    result = isError(data) ? error(data)
                           : realize(data)

    // If outer function is already returned and has created eventual
    // for it's result deliver it. Otherwise (if await called observer
    // in same synchronously) mark result delivered.
    if (eventual) deliver(eventual, result)
    else delivered = true
  })

  // If result is delivered already return it, otherwise create eventual
  // value for the result and return that.
  return delivered ? result : (eventual = new Eventual())
})

module.exports = Eventual

})()
},{"pending/await":32,"pending/is":33,"./deliver":24,"./when":26,"watchables/watchers":34,"watchables/watch":35}],20:[function(require,module,exports){"use strict";

var method = require("method")

var isReduced = require("./is-reduced")
var isError = require("./is-error")
var end = require("./end")

var reduce = method("reduce")

// Implementation of `reduce` for the empty collections, that immediately
// signals reducer that it's ended.
reduce.empty = function reduceEmpty(empty, next, initial) {
  next(end, initial)
}

// Implementation of `reduce` for the singular values which are treated
// as collections with a single element. Yields a value and signals the end.
reduce.singular = function reduceSingular(value, next, initial) {
  next(end, next(value, initial))
}

// Implementation of `reduce` for the array (and alike) values, such that it
// will call accumulator function `next` each time with next item and
// accumulated state until it's exhausted or `next` returns marked value
// indicating that it's reduced. Either way signals `end` to an accumulator.
reduce.indexed = function reduceIndexed(indexed, next, initial) {
  var state = initial
  var index = 0
  var count = indexed.length
  while (index < count) {
    var value = indexed[index]
    state = next(value, state)
    index = index + 1
    if (value === end) return end
    if (isError(value)) return state
    if (isReduced(state)) return state.value
  }
  next(end, state)
}

// Both `undefined` and `null` implement accumulate for empty sequences.
reduce.define(void(0), reduce.empty)
reduce.define(null, reduce.empty)

// Array and arguments implement accumulate for indexed sequences.
reduce.define(Array, reduce.indexed)

function Arguments() { return arguments }
Arguments.prototype = Arguments()
reduce.define(Arguments, reduce.indexed)

// All other built-in data types are treated as single value collections
// by default. Of course individual types may choose to override that.
reduce.define(reduce.singular)

// Errors just yield that error.
reduce.define(Error, function(error, next) { next(error) })
module.exports = reduce

},{"./is-reduced":16,"./is-error":21,"./end":22,"method":36}],26:[function(require,module,exports){"use strict";

var method = require("method")
var when = method("when")

when.define(function(value, onRealize) {
  return typeof(onRealize) === "function" ? onRealize(value) : value
})
when.define(Error, function(error, onRealize, onError) {
  return typeof(onError) === "function" ? onError(error) : error
})

module.exports = when

},{"method":36}],36:[function(require,module,exports){"use strict";

var defineProperty = Object.defineProperty || function(object, name, property) {
  object[name] = property.value
  return object
}

// Shortcut for `Object.prototype.toString` for faster access.
var typefy = Object.prototype.toString

// Map to for jumping from typeof(value) to associated type prefix used
// as a hash in the map of builtin implementations.
var types = { "function": "Object", "object": "Object" }

// Array is used to save method implementations for the host objects in order
// to avoid extending them with non-primitive values that could cause leaks.
var host = []
// Hash map is used to save method implementations for builtin types in order
// to avoid extending their prototypes. This also allows to share method
// implementations for types across diff contexts / frames / compartments.
var builtin = {}

function Primitive() {}
function ObjectType() {}
ObjectType.prototype = new Primitive()
function ErrorType() {}
ErrorType.prototype = new ObjectType()

var Default = builtin.Default = Primitive.prototype
var Null = builtin.Null = new Primitive()
var Void = builtin.Void = new Primitive()
builtin.String = new Primitive()
builtin.Number = new Primitive()
builtin.Boolean = new Primitive()

builtin.Object = ObjectType.prototype
builtin.Error = ErrorType.prototype

builtin.EvalError = new ErrorType()
builtin.InternalError = new ErrorType()
builtin.RangeError = new ErrorType()
builtin.ReferenceError = new ErrorType()
builtin.StopIteration = new ErrorType()
builtin.SyntaxError = new ErrorType()
builtin.TypeError = new ErrorType()
builtin.URIError = new ErrorType()


function Method(hint) {
  /**
  Private Method is a callable private name that dispatches on the first
  arguments same named Method:

      method(object, ...rest) => object[method](...rest)

  Optionally hint string may be provided that will be used in generated names
  to ease debugging.

  ## Example

      var foo = Method()

      // Implementation for any types
      foo.define(function(value, arg1, arg2) {
        // ...
      })

      // Implementation for a specific type
      foo.define(BarType, function(bar, arg1, arg2) {
        // ...
      })
  **/

  // Create an internal unique name if `hint` is provided it is used to
  // prefix name to ease debugging.
  var name = (hint || "") + "#" + Math.random().toString(32).substr(2)

  function dispatch(value) {
    // Method dispatches on type of the first argument.
    // If first argument is `null` or `void` associated implementation is
    // looked up in the `builtin` hash where implementations for built-ins
    // are stored.
    var type = null
    var method = value === null ? Null[name] :
                 value === void(0) ? Void[name] :
                 // Otherwise attempt to use method with a generated private
                 // `name` that is supposedly in the prototype chain of the
                 // `target`.
                 value[name] ||
                 // Otherwise assume it's one of the built-in type instances,
                 // in which case implementation is stored in a `builtin` hash.
                 // Attempt to find a implementation for the given built-in
                 // via constructor name and method name.
                 ((type = builtin[(value.constructor || "").name]) &&
                  type[name]) ||
                 // Otherwise assume it's a host object. For host objects
                 // actual method implementations are stored in the `host`
                 // array and only index for the implementation is stored
                 // in the host object's prototype chain. This avoids memory
                 // leaks that otherwise could happen when saving JS objects
                 // on host object.
                 host[value["!" + name]] ||
                 // Otherwise attempt to lookup implementation for builtins by
                 // a type of the value. This basically makes sure that all
                 // non primitive values will delegate to an `Object`.
                 ((type = builtin[types[typeof(value)]]) && type[name])


    // If method implementation for the type is still not found then
    // just fallback for default implementation.
    method = method || Default[name]


    // If implementation is still not found (which also means there is no
    // default) just throw an error with a descriptive message.
    if (!method) throw TypeError("Type does not implements method: " + name)

    // If implementation was found then just delegate.
    return method.apply(method, arguments)
  }

  // Make `toString` of the dispatch return a private name, this enables
  // method definition without sugar:
  //
  //    var method = Method()
  //    object[method] = function() { /***/ }
  dispatch.toString = function toString() { return name }

  // Copy utility methods for convenient API.
  dispatch.implement = implementMethod
  dispatch.define = defineMethod

  return dispatch
}

// Create method shortcuts form functions.
var defineMethod = function defineMethod(Type, lambda) {
  return define(this, Type, lambda)
}
var implementMethod = function implementMethod(object, lambda) {
  return implement(this, object, lambda)
}

// Define `implement` and `define` polymorphic methods to allow definitions
// and implementations through them.
var implement = Method("implement")
var define = Method("define")


function _implement(method, object, lambda) {
  /**
  Implements `Method` for the given `object` with a provided `implementation`.
  Calling `Method` with `object` as a first argument will dispatch on provided
  implementation.
  **/
  return defineProperty(object, method.toString(), {
    enumerable: false,
    configurable: false,
    writable: false,
    value: lambda
  })
}

function _define(method, Type, lambda) {
  /**
  Defines `Method` for the given `Type` with a provided `implementation`.
  Calling `Method` with a first argument of this `Type` will dispatch on
  provided `implementation`. If `Type` is a `Method` default implementation
  is defined. If `Type` is a `null` or `undefined` `Method` is implemented
  for that value type.
  **/

  // Attempt to guess a type via `Object.prototype.toString.call` hack.
  var type = Type && typefy.call(Type.prototype)

  // If only two arguments are passed then `Type` is actually an implementation
  // for a default type.
  if (!lambda) Default[method] = Type
  // If `Type` is `null` or `void` store implementation accordingly.
  else if (Type === null) Null[method] = lambda
  else if (Type === void(0)) Void[method] = lambda
  // If `type` hack indicates built-in type and type has a name us it to
  // store a implementation into associated hash. If hash for this type does
  // not exists yet create one.
  else if (type !== "[object Object]" && Type.name) {
    var Bulitin = builtin[Type.name] || (builtin[Type.name] = new ObjectType())
    Bulitin[method] = lambda
  }
  // If `type` hack indicates an object, that may be either object or any
  // JS defined "Class". If name of the constructor is `Object`, assume it's
  // built-in `Object` and store implementation accordingly.
  else if (Type.name === "Object")
    builtin.Object[method] = lambda
  // Host objects are pain!!! Every browser does some crazy stuff for them
  // So far all browser seem to not implement `call` method for host object
  // constructors. If that is a case here, assume it's a host object and
  // store implementation in a `host` array and store `index` in the array
  // in a `Type.prototype` itself. This avoids memory leaks that could be
  // caused by storing JS objects on a host objects.
  else if (Type.call === void(0)) {
    var index = host.indexOf(lambda)
    if (index < 0) index = host.push(lambda) - 1
    // Prefix private name with `!` so it can be dispatched from the method
    // without type checks.
    implement("!" + method, Type.prototype, index)
  }
  // If Got that far `Type` is user defined JS `Class`. Define private name
  // as hidden property on it's prototype.
  else
    implement(method, Type.prototype, lambda)
}

// And provided implementations for a polymorphic equivalents.
_define(define, _define)
_define(implement, _implement)

// Define exports on `Method` as it's only thing being exported.
Method.implement = implement
Method.define = define
Method.Method = Method
Method.method = Method
Method.builtin = builtin
Method.host = host

module.exports = Method

},{}],34:[function(require,module,exports){"use strict";

var method = require("method")

// Method is supposed to return array of watchers for the given
// value.
var watchers = method("watchers")
module.exports = watchers

},{"method":36}],35:[function(require,module,exports){"use strict";

var method = require("method")
var watchers = require("./watchers")

var watch = method("watch")
watch.define(function(value, watcher) {
  // Registers a `value` `watcher`, unless it"s already registered.
  var registered = watchers(value)
  if (registered && registered.indexOf(watcher) < 0)
    registered.push(watcher)
  return value
})

module.exports = watch

},{"./watchers":34,"method":36}],32:[function(require,module,exports){"use strict";

var method = require("method")

// Set's up a callback to be called once pending
// value is realized. All object by default are realized.
var await = method("await")
await.define(function(value, callback) { callback(value) })

module.exports = await

},{"method":36}],33:[function(require,module,exports){"use strict";

var method = require("method")

// Returns `true` if given `value` is pending, otherwise returns
// `false`. All types will return false unless type specific
// implementation is provided to do it otherwise.
var isPending = method("is-pending")

isPending.define(function() { return false })

module.exports = isPending

},{"method":36}],30:[function(require,module,exports){"use strict";

var method = require("method")
// Method delivers pending value.
var deliver = method("deliver")

module.exports = deliver

},{"method":36}]},{},[1]);