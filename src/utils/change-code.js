export function changeCode(cb) {
  Promise.resolve(document.querySelector("[contenteditable]").textContent)
    .then((code) => cb(code))
    .then((code) => {
      if (false !== code) {
        document.querySelector("[contenteditable]").textContent = code;
      }
    });
}
