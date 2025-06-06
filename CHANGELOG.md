# 1.1.4

- Score button: make them smaller and fix creation on side panel change

# 1.1.3

- Output tool: Hide outline when Slide & compare is active

# 1.1.2

- DOM tool: Fix flashing effect when highlight overlap dom-element

# 1.1.1

- DOM tool: Apply transform and border-radius to replicate dom element
- DOM tool: Move dom tool just below the output target to made screenshot without score

# 1.1.0

- Add new DOM tool
- Fix minification on unbreakable spaces
- Fix features when editor is not initialized

# 1.0.5

- Fix the today compute

# 1.0.4

- Add unit tests on minification and fix `word .x` issues

# 1.0.3

- Fix missing whitespace when missing ; #5
- Reduce gap between checkbox and icon output tool #2
- Fix output tool tooltip alignment #2

# 1.0.2

- Add unit tests on minification and fix `.x0y` issues

# 1.0.1

- Fix links to external tools

# 1.0.0

- Add increment mode on editor
- Add a link to CSS Battle Toolbox settings
- Fix wrong space remove for `xq .y` to `xq .y` where `q` is a css unit.

# 0.0.0.9

- Fix wrong space remove for `x .y`.

# 0.0.0.8

- Add tolerance input in unit golf tool
- Fix hiding output tool label on Opera GX
- Fix options save
- Hide Global stats, Twitter button and Sponsor is now in extension configuration

# 0.0.0.7

- Fix the today compute

# 0.0.0.6

- Add the html tag name near the html tag outline

# 0.0.0.5

- Add unit tests on minification and fix `font`and `.x .y` issues

# 0.0.0.4

- Extension is now configurable, go to options of the extension, and you can choose which part of the UI you want to hide
- Add configuration to alter the difference tool: you can invert color (black to white), and increase the brightness. The compare tool is also disabled when diff is active.
- Add configuration to set your default code template for new battle and daily target
- Add configuration to use the x2 image for difference tool

# 0.0.0.3

## Bug fixes:

- Fix critical bug on chrome 130: upgrade vite and @crxjs/vite-plugin dependancies

# 0.0.0.2

## Output code tools:

- Replace all labels by icons to save space (in order to add more tools)
- Add tooltip on checkbox icon labels
- Display your html tags outline/background on your code output

## Color tools:

- The color tools is now base only on https://48dvyq.csb.app/ and it display more matching colors
- Add an empty color button on background color input
- Add tooltip on the color button

## Source code tools:

- Handle the trailing `font: 10%a''` minification and prettification by removing/adding trailing `'` or `"`
- Prettification now replace `#0000` by `transparent`
- Prettification does not add unecessary line when their are no html tags
- Add tooltip on the minified code character counter

Add this changelog to keep track of changes across version.

# 0.0.0.1

First version of the extension, featuring :

## Source code tools:

- Code minification
- Code prettification with prettier
- Print, on the fly, the number of characters your code should be once minified
- Replace default skeleton by a shorter and more helpfull one.

## Output code tools:

- Display a grid on your code output
- Display the target on your code output

## Unit tools:

- A tool to find shorter css unit (integration of https://u9kels.csb.app/)

## Color tools:

- A tool to find shorter css color in hexa (integration of a mix of https://48dvyq.csb.app/ and https://codepen.io/SelenIT/pen/JaeYpM)

## Remove content:

- Remove ads panel
- Remove share button
- Remove global stats
- Remove code golf explaination on battle
