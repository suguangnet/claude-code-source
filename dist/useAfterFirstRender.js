"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useAfterFirstRender = useAfterFirstRender;
const react_1 = require("react");
const envUtils_js_1 = require("../utils/envUtils.js");
function useAfterFirstRender() {
    (0, react_1.useEffect)(() => {
        if (process.env.USER_TYPE === 'ant' &&
            (0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_EXIT_AFTER_FIRST_RENDER)) {
            process.stderr.write(`\nStartup time: ${Math.round(process.uptime() * 1000)}ms\n`);
            // eslint-disable-next-line custom-rules/no-process-exit
            process.exit(0);
        }
    }, []);
}
