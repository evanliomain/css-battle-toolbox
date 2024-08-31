export function doAsync(cb) {
  return function doing() {
    return Promise.resolve(0)
      .then(() => cb())
      .then((result) => {
        if (!result) {
          setTimeout(doing, 100);
        }
      });
  };
}
