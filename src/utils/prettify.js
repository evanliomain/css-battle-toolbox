import * as prettier from "prettier";
import * as prettierPluginCss from "prettier/plugins/postcss";

export async function prettify(code) {
  return await formatHTMLWithCSS(code);
}

async function formatHTMLWithCSS(html) {
  // Étape 1: Trouver et extraire le contenu de la balise <style>
  let styleRegex = /<style[^>]*>(.*?)(<\/style>)?$/i;
  let match = html.match(styleRegex);

  if (match) {
    let cssContent = match[1];

    // Étape 2: Formatter le contenu CSS
    cssContent = await formatCSS(cssContent);

    // Étape 3: Remplacer l'ancien contenu CSS par le contenu formaté
    html = html.replace(styleRegex, `\n<style>\n${cssContent}</style>`);
  }
  // Retourner le HTML formaté
  return html;
}

async function formatCSS(css) {
  // Supprimer les espaces et les nouvelles lignes inutiles
  css = css.replace(/\s+/g, " ").trim();

  // Fermer les accolades si elles sont ouvertes sans fermeture
  let formattedCSS = closeBrackets(css, "(", ")");
  formattedCSS = closeBrackets(formattedCSS);

  // Ajouter des points-virgules manquants à la fin des propriétés
  formattedCSS = formattedCSS.replace(/([^;\}])(\s*})/g, "$1;$2");

  formattedCSS = formattedCSS
    .replaceAll(/(\S)#/g, "$1 #")
    .replaceAll(/(\d)\-/g, "$1 -")
    .replaceAll(/%(\S)/g, "% $1")
    .replaceAll(/\/(\S)/g, "/ $1")
    .replaceAll(/(\S)\//g, "$1 /");

  formattedCSS = await prettier.format(formattedCSS, {
    parser: "css",
    plugins: [prettierPluginCss],
  });
  formattedCSS = formattedCSS.replaceAll(/\+(\s)+(\d)/g, "+$2");
  return formattedCSS;
}

function closeBrackets(css, open = "{", close = "}") {
  let openedBraces = 0;
  let formattedCSS = "";
  for (let i = 0; i < css.length; i++) {
    if (css[i] === open) {
      openedBraces++;
      formattedCSS += open;
    } else if (css[i] === close) {
      if (openedBraces > 0) {
        openedBraces--;
        formattedCSS += close;
      }
    } else {
      formattedCSS += css[i];
    }
  }

  // Fermer les accolades restantes
  while (openedBraces > 0) {
    formattedCSS += close;
    openedBraces--;
  }
  return formattedCSS;
}
