A set of tools for Css Battle, directly in the battle interface.

Features :
- Minify your code
- Prettify your code (with prettier)
- Display a grid on your code output
- Display the target on your code output
- Display your html tags outline/background on your code output
- A tool to find shorter css unit (integration of https://u9kels.csb.app/)
- A tool to find shorter css color in hexa (integration of https://48dvyq.csb.app/)
- Print, on the fly, the number of characters your code should be once minified
- Replace default skeleton by a shorter and more helpfull one.
- You can hide any almost any part of the interface, including tools bring with this extension.
- You can invert color of the difference tool
- You can configure your default code template for new battle and daily target


Minification and prettification work well with code style like :

```html
<!-- Some html -->
<style>
  // Some css
<style>
```

PR are well come ;).

# How to contribute

## Install extension locally

1. Install dependancies with `npm install`
2. Run `npm run dev`
3. Open your browser and navigate to chrome://extensions/
4. Toggle development mode if needed
5. Load unpacked extension as describe here: https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked
6. Choose `dist` directory as the extension
7. Modify the code and it should be reload automatically

## Message commit

Stay short and easy to understand. Use gitmoji to prefix your commit message with an emoji.

## Submit PR

To contribute, submit a PR and I will review it as soon as possible.

Please do NOT take PR comment review personnaly, it just a way to keep code clean and maintenable.

Try to keep comment short and easy to understand.
Try to follow the [conventional comments](https://conventionalcomments.org/).
