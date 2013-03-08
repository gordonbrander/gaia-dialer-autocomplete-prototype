var reducible = require("reducible/reducible");
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

