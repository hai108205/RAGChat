import { Router } from "express";
import validate from "../middlewares/validate.middleware.js";
import { verifyIntegrationToken } from "../middlewares/integrationAuth.middleware.js";
import {
    rocketchatAsyncMessageSchema,
    rocketchatStatsSchema,
    rocketchatSourcesQuerySchema,
    rocketchatDeleteSourceSchema,
    rocketchatBase64SourceSchema,
    rocketchatUtilityCompletionSchema,
    rocketchatFeedbackSchema,
} from "../utils/validationSchemas.js";
import {
    handleAsyncMessage,
    getStats,
    listSources,
    deleteSource,
    handleBase64Source,
    handleUtilityCompletion,
    submitFeedback,
} from "../controllers/rocketchatIntegration.controller.js";

const rocketchatRouter = Router();

// Apply integration token verification middleware across all Rocket.Chat endpoints
rocketchatRouter.use(verifyIntegrationToken);

rocketchatRouter
    .route("/messages/async")
    .post(validate(rocketchatAsyncMessageSchema), handleAsyncMessage);

rocketchatRouter.route("/stats").get(validate(rocketchatStatsSchema), getStats);

rocketchatRouter
    .route("/sources")
    .get(validate(rocketchatSourcesQuerySchema), listSources);

rocketchatRouter
    .route("/sources/:id")
    .delete(validate(rocketchatDeleteSourceSchema), deleteSource);

rocketchatRouter
    .route("/feedback")
    .post(validate(rocketchatFeedbackSchema), submitFeedback);

rocketchatRouter
    .route("/sources/base64")
    .post(validate(rocketchatBase64SourceSchema), handleBase64Source);

rocketchatRouter
    .route("/utilities/completion")
    .post(validate(rocketchatUtilityCompletionSchema), handleUtilityCompletion);

export default rocketchatRouter;
