import prismaClient from "./prismaClient.js";

const connectDB = async (): Promise<void> => {
    try {
        await prismaClient.$connect();
        console.log("Postgres database connected via Prisma!!");
    } catch (error) {
        console.log("Postgres connection FAILED: ", error);
        process.exit(1);
    }
};

export default connectDB;
