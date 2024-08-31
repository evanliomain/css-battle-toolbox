import "./style.css";

const app = document.querySelector("#app");
if (null !== app) {
  app.innerHTML = `
  <h1>Useful links</h1>
  <ul>
    <li>
      <a href="https://48dvyq.csb.app/">
        <img src="images/rgb.png"/>
        Color mixer
      </a>
    </li>
    <li>
      <a href="https://u9kels.csb.app/">
        <img src="images/tape.png"/>
        Unit golf
      </a>
    </li>
    <li>
      <a href="https://tc70f3.csb.app/">
        <img src="images/previewer.ico"/>
        Css battle previewer
      </a>
    </li>
    <li>
      <a href="https://angrytools.com/css-generator/transform/">
        Matrix Transform
      </a>
    </li>
    <li>
      <a href="https://codepen.io/Beowolve/full/ExGNgpJ">
        Border image helper
      </a>
    </li>
  </ul>
`;
}
