import { Router } from "express";
import validate from "../middlewares/validate.middleware.js";
import {
    userLogInSchema,
    userRegisterSchema,
    verifyEmailSchema,
    sendVerificationCodeSchema,
    resetPasswordSchema,
    sendResetCodeSchema,
} from "../utils/validationSchemas.js";
import {
    currentUserProfile,
    refreshTokens,
    userLogIn,
    userLogOut,
    userRegister,
    sendVerificationCode,
    verifyEmail,
    sendResetCode,
    resetPassword,
    deleteMyData,
} from "../controllers/user.controller.js";
import { verifyJWT, verifyStrictJWT } from "../middlewares/auth.middleware.js";
import { authLimiter, otpLimiter } from "../middlewares/rateLimiter.middleware.js";

const userRouter = Router();

userRouter.route("/send-verification-code").post(
    otpLimiter,
    validate(sendVerificationCodeSchema),
    sendVerificationCode,
);
userRouter.route("/verify-email").post(validate(verifyEmailSchema), verifyEmail);
userRouter.route("/register").post(validate(userRegisterSchema), userRegister);
userRouter.route("/login").post(authLimiter, validate(userLogInSchema), userLogIn);
userRouter.route("/send-reset-code").post(otpLimiter, validate(sendResetCodeSchema), sendResetCode);
userRouter.route("/reset-password").post(validate(resetPasswordSchema), resetPassword);

// Secured Routes
userRouter.route("/logout").post(verifyStrictJWT, userLogOut);
userRouter.route("/refresh-token").get(verifyJWT, refreshTokens);
userRouter.route("/current-user").get(verifyStrictJWT, currentUserProfile);
userRouter.route("/me").delete(verifyStrictJWT, deleteMyData);

export default userRouter;
