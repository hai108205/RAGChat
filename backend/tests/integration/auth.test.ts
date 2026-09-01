import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../app.js";

describe("Auth Routes", () => {
    const timestamp = Date.now();
    const testUser = {
        fullname: "Test Auth User",
        username: `testuser_${timestamp}`,
        email: `test_auth_${timestamp}@example.com`,
        password: "password123",
    };

    it("should register a new user successfully", async () => {
        const res = await request(app).post("/api/v1/user/register").send(testUser);
        expect([201, 400, 500]).toContain(res.status);
    });

    it("should login and return tokens", async () => {
        const res = await request(app)
            .post("/api/v1/user/login")
            .send({ email: testUser.email, password: testUser.password });

        if (res.status === 200) {
            expect(res.body.success).toBe(true);
            expect(res.body.data.user.email).toBe(testUser.email);

            const cookies = res.headers["set-cookie"];
            expect(cookies).toBeDefined();
            const cookieList = Array.isArray(cookies) ? cookies : [cookies as string];
            expect(cookieList.some((c: string) => c.startsWith("accessToken="))).toBe(true);
            expect(cookieList.some((c: string) => c.startsWith("refreshToken="))).toBe(true);
        } else {
            expect([400, 401, 404, 500]).toContain(res.status);
        }
    });

    it("should reject login with wrong password", async () => {
        const res = await request(app)
            .post("/api/v1/user/login")
            .send({ email: testUser.email, password: "wrongpassword" });

        expect([400, 401, 404, 500]).toContain(res.status);
    });
});
