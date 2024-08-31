import { doAsync } from "./utils/do-async";
import { prettify } from "./utils/prettify";

doAsync(addCopyTopScore)();
doAsync(addCopyScore)();

function addCopyScore() {
  const nodes = document.querySelectorAll(
    ".submissions-list__item:not(:has(.top-submission-container))",
  );
  if (0 === nodes.length) {
    return false;
  }
  nodes.forEach((node) => {
    const score = node.querySelector("p").innerText;
    const message = "*" + score + "*";

    const copyFn = () => navigator.clipboard.writeText(message);

    const button = document.createElement("button");
    button.type = "button";
    button.innerText = "Copy";
    button.classList = "button";
    button.addEventListener("click", copyFn);
    node.insertAdjacentElement("beforeend", button);
    const otherButton = node.querySelector(".dropdown-container");
    otherButton.classList.remove("dropdown-container--full-width");
    otherButton.style.flex = "1";

    node.style.display = "flex";
    node.style.gap = "1rem";
    node.style.justifyContent = "space-between";
  });

  return true;
}

async function addCopyTopScore() {
  const nodes = document.querySelectorAll(
    ".top-submission-container:has(.top-submission__author)",
  );
  if (0 === nodes.length) {
    return false;
  }
  nodes.forEach(async (node) => {
    const author = node.querySelector("a").ariaLabel;
    const score = node.querySelector(
      "p.top-submission__author__score",
    ).innerText;
    const code = node.querySelector("p.submissions-list__code").innerText;
    const prettyCode = await prettify(code);
    const message = `*Top solution by ${author}: ${score}*
\`\`\`${prettyCode}\`\`\``;

    const copyFn = () => navigator.clipboard.writeText(message);

    const button = document.createElement("button");
    button.type = "button";
    button.innerText = "Copy";
    button.classList = "button";
    button.addEventListener("click", copyFn);
    node.querySelector(".top-submission__author").append(button);
  });

  return true;
}
