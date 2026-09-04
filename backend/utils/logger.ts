import pino from "pino";
import { config } from "../config/runtime.js";

const logger = pino({
    level: config.observability.logLevel,
    transport: {
        target: "pino/file",
        options: { destination: 1 },
    },
});

export default logger;
