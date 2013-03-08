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
      result = next(Date.now(), result);
      if(!isReduced(result)) setTimeout(tick, msPerFrame);
    }

    setTimeout(tick, msPerFrame)
  })
}

module.exports = fps;

