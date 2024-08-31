export function addButton(label, cb) {
  const buttonsEditor = document.querySelector(
    ".container__item--editor .btn-group ",
  );

  const btn = document.createElement("button");
  btn.type = "button";
  btn.classList = "button";
  btn.innerText = label;
  buttonsEditor.insertAdjacentElement("afterbegin", btn);

  btn.addEventListener("click", cb);
}