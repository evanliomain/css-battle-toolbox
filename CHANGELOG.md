
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
