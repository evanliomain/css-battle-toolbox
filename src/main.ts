import "./style.css";

const app = document.querySelector("#app");
if (null !== app) {
  app.innerHTML = `
  <h1>External tools</h1>
  <ul>
    <li>
      <a href="https://48dvyq.csb.app/" target="_blank">
        <img src="images/rgb.png"/>
        Color mixer
      </a>
    </li>
    <li>
      <a href="https://u9kels.csb.app/" target="_blank">
        <img src="images/tape.png"/>
        Unit golf
      </a>
    </li>
    <li>
      <a href="https://tc70f3.csb.app/" target="_blank">
        <img src="images/previewer.ico"/>
        Css battle previewer
      </a>
    </li>
    <li>
      <a href="https://angrytools.com/css-generator/transform/" target="_blank">
        Matrix Transform
      </a>
    </li>
    <li>
      <a href="https://codepen.io/Beowolve/full/ExGNgpJ" target="_blank">
        Border image helper
      </a>
    </li>
    <li>
      <a href="https://9elements.github.io/fancy-border-radius/full-control.html" target="_blank">
        <img src="images/fancy-border.png"/>
        Fancy border
      </a>
    </li>
    <li>
      <a href="https://bennettfeely.com/clippy/" target="_blank">
        <img src="images/clippy.png"/>
        Clip-path
      </a>
    </li>
  </ul>
`;
}
