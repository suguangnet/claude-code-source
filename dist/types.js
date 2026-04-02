"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectResponseSchema = void 0;
const v4_1 = require("zod/v4");
const lazySchema_js_1 = require("../utils/lazySchema.js");
exports.connectResponseSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.object({
    session_id: v4_1.z.string(),
    ws_url: v4_1.z.string(),
    work_dir: v4_1.z.string().optional(),
}));
