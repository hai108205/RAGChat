import { config } from "../config/runtime.js";

/** @deprecated Configuration is validated while config/runtime is initialized. */
const validateEnv = (): void => {
    void config;
};

export default validateEnv;
