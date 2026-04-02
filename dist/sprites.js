"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderSprite = renderSprite;
exports.spriteFrameCount = spriteFrameCount;
exports.renderFace = renderFace;
const types_js_1 = require("./types.js");
// Each sprite is 5 lines tall, 12 wide (after {E}→1char substitution).
// Multiple frames per species for idle fidget animation.
// Line 0 is the hat slot — must be blank in frames 0-1; frame 2 may use it.
const BODIES = {
    [types_js_1.duck]: [
        [
            '            ',
            '    __      ',
            '  <({E} )___  ',
            '   (  ._>   ',
            '    `--´    ',
        ],
        [
            '            ',
            '    __      ',
            '  <({E} )___  ',
            '   (  ._>   ',
            '    `--´~   ',
        ],
        [
            '            ',
            '    __      ',
            '  <({E} )___  ',
            '   (  .__>  ',
            '    `--´    ',
        ],
    ],
    [types_js_1.goose]: [
        [
            '            ',
            '     ({E}>    ',
            '     ||     ',
            '   _(__)_   ',
            '    ^^^^    ',
        ],
        [
            '            ',
            '    ({E}>     ',
            '     ||     ',
            '   _(__)_   ',
            '    ^^^^    ',
        ],
        [
            '            ',
            '     ({E}>>   ',
            '     ||     ',
            '   _(__)_   ',
            '    ^^^^    ',
        ],
    ],
    [types_js_1.blob]: [
        [
            '            ',
            '   .----.   ',
            '  ( {E}  {E} )  ',
            '  (      )  ',
            '   `----´   ',
        ],
        [
            '            ',
            '  .------.  ',
            ' (  {E}  {E}  ) ',
            ' (        ) ',
            '  `------´  ',
        ],
        [
            '            ',
            '    .--.    ',
            '   ({E}  {E})   ',
            '   (    )   ',
            '    `--´    ',
        ],
    ],
    [types_js_1.cat]: [
        [
            '            ',
            '   /\\_/\\    ',
            '  ( {E}   {E})  ',
            '  (  ω  )   ',
            '  (")_(")   ',
        ],
        [
            '            ',
            '   /\\_/\\    ',
            '  ( {E}   {E})  ',
            '  (  ω  )   ',
            '  (")_(")~  ',
        ],
        [
            '            ',
            '   /\\-/\\    ',
            '  ( {E}   {E})  ',
            '  (  ω  )   ',
            '  (")_(")   ',
        ],
    ],
    [types_js_1.dragon]: [
        [
            '            ',
            '  /^\\  /^\\  ',
            ' <  {E}  {E}  > ',
            ' (   ~~   ) ',
            '  `-vvvv-´  ',
        ],
        [
            '            ',
            '  /^\\  /^\\  ',
            ' <  {E}  {E}  > ',
            ' (        ) ',
            '  `-vvvv-´  ',
        ],
        [
            '   ~    ~   ',
            '  /^\\  /^\\  ',
            ' <  {E}  {E}  > ',
            ' (   ~~   ) ',
            '  `-vvvv-´  ',
        ],
    ],
    [types_js_1.octopus]: [
        [
            '            ',
            '   .----.   ',
            '  ( {E}  {E} )  ',
            '  (______)  ',
            '  /\\/\\/\\/\\  ',
        ],
        [
            '            ',
            '   .----.   ',
            '  ( {E}  {E} )  ',
            '  (______)  ',
            '  \\/\\/\\/\\/  ',
        ],
        [
            '     o      ',
            '   .----.   ',
            '  ( {E}  {E} )  ',
            '  (______)  ',
            '  /\\/\\/\\/\\  ',
        ],
    ],
    [types_js_1.owl]: [
        [
            '            ',
            '   /\\  /\\   ',
            '  (({E})({E}))  ',
            '  (  ><  )  ',
            '   `----´   ',
        ],
        [
            '            ',
            '   /\\  /\\   ',
            '  (({E})({E}))  ',
            '  (  ><  )  ',
            '   .----.   ',
        ],
        [
            '            ',
            '   /\\  /\\   ',
            '  (({E})(-))  ',
            '  (  ><  )  ',
            '   `----´   ',
        ],
    ],
    [types_js_1.penguin]: [
        [
            '            ',
            '  .---.     ',
            '  ({E}>{E})     ',
            ' /(   )\\    ',
            '  `---´     ',
        ],
        [
            '            ',
            '  .---.     ',
            '  ({E}>{E})     ',
            ' |(   )|    ',
            '  `---´     ',
        ],
        [
            '  .---.     ',
            '  ({E}>{E})     ',
            ' /(   )\\    ',
            '  `---´     ',
            '   ~ ~      ',
        ],
    ],
    [types_js_1.turtle]: [
        [
            '            ',
            '   _,--._   ',
            '  ( {E}  {E} )  ',
            ' /[______]\\ ',
            '  ``    ``  ',
        ],
        [
            '            ',
            '   _,--._   ',
            '  ( {E}  {E} )  ',
            ' /[______]\\ ',
            '   ``  ``   ',
        ],
        [
            '            ',
            '   _,--._   ',
            '  ( {E}  {E} )  ',
            ' /[======]\\ ',
            '  ``    ``  ',
        ],
    ],
    [types_js_1.snail]: [
        [
            '            ',
            ' {E}    .--.  ',
            '  \\  ( @ )  ',
            '   \\_`--´   ',
            '  ~~~~~~~   ',
        ],
        [
            '            ',
            '  {E}   .--.  ',
            '  |  ( @ )  ',
            '   \\_`--´   ',
            '  ~~~~~~~   ',
        ],
        [
            '            ',
            ' {E}    .--.  ',
            '  \\  ( @  ) ',
            '   \\_`--´   ',
            '   ~~~~~~   ',
        ],
    ],
    [types_js_1.ghost]: [
        [
            '            ',
            '   .----.   ',
            '  / {E}  {E} \\  ',
            '  |      |  ',
            '  ~`~``~`~  ',
        ],
        [
            '            ',
            '   .----.   ',
            '  / {E}  {E} \\  ',
            '  |      |  ',
            '  `~`~~`~`  ',
        ],
        [
            '    ~  ~    ',
            '   .----.   ',
            '  / {E}  {E} \\  ',
            '  |      |  ',
            '  ~~`~~`~~  ',
        ],
    ],
    [types_js_1.axolotl]: [
        [
            '            ',
            '}~(______)~{',
            '}~({E} .. {E})~{',
            '  ( .--. )  ',
            '  (_/  \\_)  ',
        ],
        [
            '            ',
            '~}(______){~',
            '~}({E} .. {E}){~',
            '  ( .--. )  ',
            '  (_/  \\_)  ',
        ],
        [
            '            ',
            '}~(______)~{',
            '}~({E} .. {E})~{',
            '  (  --  )  ',
            '  ~_/  \\_~  ',
        ],
    ],
    [types_js_1.capybara]: [
        [
            '            ',
            '  n______n  ',
            ' ( {E}    {E} ) ',
            ' (   oo   ) ',
            '  `------´  ',
        ],
        [
            '            ',
            '  n______n  ',
            ' ( {E}    {E} ) ',
            ' (   Oo   ) ',
            '  `------´  ',
        ],
        [
            '    ~  ~    ',
            '  u______n  ',
            ' ( {E}    {E} ) ',
            ' (   oo   ) ',
            '  `------´  ',
        ],
    ],
    [types_js_1.cactus]: [
        [
            '            ',
            ' n  ____  n ',
            ' | |{E}  {E}| | ',
            ' |_|    |_| ',
            '   |    |   ',
        ],
        [
            '            ',
            '    ____    ',
            ' n |{E}  {E}| n ',
            ' |_|    |_| ',
            '   |    |   ',
        ],
        [
            ' n        n ',
            ' |  ____  | ',
            ' | |{E}  {E}| | ',
            ' |_|    |_| ',
            '   |    |   ',
        ],
    ],
    [types_js_1.robot]: [
        [
            '            ',
            '   .[||].   ',
            '  [ {E}  {E} ]  ',
            '  [ ==== ]  ',
            '  `------´  ',
        ],
        [
            '            ',
            '   .[||].   ',
            '  [ {E}  {E} ]  ',
            '  [ -==- ]  ',
            '  `------´  ',
        ],
        [
            '     *      ',
            '   .[||].   ',
            '  [ {E}  {E} ]  ',
            '  [ ==== ]  ',
            '  `------´  ',
        ],
    ],
    [types_js_1.rabbit]: [
        [
            '            ',
            '   (\\__/)   ',
            '  ( {E}  {E} )  ',
            ' =(  ..  )= ',
            '  (")__(")  ',
        ],
        [
            '            ',
            '   (|__/)   ',
            '  ( {E}  {E} )  ',
            ' =(  ..  )= ',
            '  (")__(")  ',
        ],
        [
            '            ',
            '   (\\__/)   ',
            '  ( {E}  {E} )  ',
            ' =( .  . )= ',
            '  (")__(")  ',
        ],
    ],
    [types_js_1.mushroom]: [
        [
            '            ',
            ' .-o-OO-o-. ',
            '(__________)',
            '   |{E}  {E}|   ',
            '   |____|   ',
        ],
        [
            '            ',
            ' .-O-oo-O-. ',
            '(__________)',
            '   |{E}  {E}|   ',
            '   |____|   ',
        ],
        [
            '   . o  .   ',
            ' .-o-OO-o-. ',
            '(__________)',
            '   |{E}  {E}|   ',
            '   |____|   ',
        ],
    ],
    [types_js_1.chonk]: [
        [
            '            ',
            '  /\\    /\\  ',
            ' ( {E}    {E} ) ',
            ' (   ..   ) ',
            '  `------´  ',
        ],
        [
            '            ',
            '  /\\    /|  ',
            ' ( {E}    {E} ) ',
            ' (   ..   ) ',
            '  `------´  ',
        ],
        [
            '            ',
            '  /\\    /\\  ',
            ' ( {E}    {E} ) ',
            ' (   ..   ) ',
            '  `------´~ ',
        ],
    ],
};
const HAT_LINES = {
    none: '',
    crown: '   \\^^^/    ',
    tophat: '   [___]    ',
    propeller: '    -+-     ',
    halo: '   (   )    ',
    wizard: '    /^\\     ',
    beanie: '   (___)    ',
    tinyduck: '    ,>      ',
};
function renderSprite(bones, frame = 0) {
    const frames = BODIES[bones.species];
    const body = frames[frame % frames.length].map(line => line.replaceAll('{E}', bones.eye));
    const lines = [...body];
    // Only replace with hat if line 0 is empty (some fidget frames use it for smoke etc)
    if (bones.hat !== 'none' && !lines[0].trim()) {
        lines[0] = HAT_LINES[bones.hat];
    }
    // Drop blank hat slot — wastes a row in the Card and ambient sprite when
    // there's no hat and the frame isn't using it for smoke/antenna/etc.
    // Only safe when ALL frames have blank line 0; otherwise heights oscillate.
    if (!lines[0].trim() && frames.every(f => !f[0].trim()))
        lines.shift();
    return lines;
}
function spriteFrameCount(species) {
    return BODIES[species].length;
}
function renderFace(bones) {
    const eye = bones.eye;
    switch (bones.species) {
        case types_js_1.duck:
        case types_js_1.goose:
            return `(${eye}>`;
        case types_js_1.blob:
            return `(${eye}${eye})`;
        case types_js_1.cat:
            return `=${eye}ω${eye}=`;
        case types_js_1.dragon:
            return `<${eye}~${eye}>`;
        case types_js_1.octopus:
            return `~(${eye}${eye})~`;
        case types_js_1.owl:
            return `(${eye})(${eye})`;
        case types_js_1.penguin:
            return `(${eye}>)`;
        case types_js_1.turtle:
            return `[${eye}_${eye}]`;
        case types_js_1.snail:
            return `${eye}(@)`;
        case types_js_1.ghost:
            return `/${eye}${eye}\\`;
        case types_js_1.axolotl:
            return `}${eye}.${eye}{`;
        case types_js_1.capybara:
            return `(${eye}oo${eye})`;
        case types_js_1.cactus:
            return `|${eye}  ${eye}|`;
        case types_js_1.robot:
            return `[${eye}${eye}]`;
        case types_js_1.rabbit:
            return `(${eye}..${eye})`;
        case types_js_1.mushroom:
            return `|${eye}  ${eye}|`;
        case types_js_1.chonk:
            return `(${eye}.${eye})`;
    }
}
