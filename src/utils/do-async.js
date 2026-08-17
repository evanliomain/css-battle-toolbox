const DEFAULT_INTERVAL = 100;
const DEFAULT_TIMEOUT = 20000;

/**
 * Polls `cb` until it returns a truthy value.
 *
 * `cb` returning a falsy value means "the DOM is not ready yet, try again".
 * A throw is treated the same way: cssbattle.dev is a hydrating SPA, so a
 * selector resolving to null mid-render is expected, not fatal. Without this
 * the whole retry loop would die on the first TypeError.
 *
 * @param {() => unknown | Promise<unknown>} cb
 * @param {object} [options]
 * @param {string} [options.name] Label used in console warnings.
 * @param {number} [options.interval] Delay between attempts, in ms.
 * @param {number} [options.timeout] Give up after this long, in ms. `Infinity` polls forever.
 * @param {AbortSignal} [options.signal] Stops polling when aborted.
 * @returns {() => Promise<void>} The poller. Call it to start.
 */
export function doAsync(cb, options = {}) {
  const {
    interval = DEFAULT_INTERVAL,
    timeout = DEFAULT_TIMEOUT,
    signal,
  } = options;
  // `||`, not `??`: an inline arrow or a returned closure has `cb.name === ""`.
  const name = options.name || cb.name || "anonymous";

  return function doing() {
    const start = Date.now();

    function attempt() {
      if (signal?.aborted) {
        return Promise.resolve();
      }

      return Promise.resolve()
        .then(() => cb())
        .catch((error) => {
          console.debug(`[cbt] ${name} threw, retrying`, error);
          return false;
        })
        .then((result) => {
          if (result) {
            return;
          }
          if (Date.now() - start >= timeout) {
            console.warn(`[cbt] ${name} gave up after ${timeout}ms`);
            return;
          }
          return wait(interval, signal).then(attempt);
        });
    }

    return attempt();
  };
}

function wait(delay, signal) {
  return new Promise((resolve) => {
    function done() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    }
    const timer = setTimeout(done, delay);
    signal?.addEventListener("abort", done, { once: true });
  });
}
