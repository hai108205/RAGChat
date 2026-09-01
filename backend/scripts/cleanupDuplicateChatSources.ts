import prisma from "../utils/prismaClient.js";

async function main() {
    console.log("Searching for duplicate ChatSource entries...");

    const duplicates: Array<{ documentationUrl: string; isVectorLess: boolean; count: bigint }> =
        await prisma.$queryRaw`
        SELECT "documentationUrl", "isVectorLess", COUNT(*)
        FROM "ChatSource"
        GROUP BY "documentationUrl", "isVectorLess"
        HAVING COUNT(*) > 1
    `;

    console.log(`Found ${duplicates.length} duplicate groups.`);

    for (const group of duplicates) {
        console.log(`Processing group: ${group.documentationUrl} (isVectorLess: ${group.isVectorLess})`);

        const sources = await prisma.chatSource.findMany({
            where: {
                documentationUrl: group.documentationUrl,
                isVectorLess: group.isVectorLess,
            },
            orderBy: {
                createdAt: "asc",
            },
            include: {
                chats: true,
                pagesIndexed: true,
                documentTree: true,
            },
        });

        const primarySource = sources[0];
        const duplicateSources = sources.slice(1);

        console.log(
            `Primary Source ID: ${primarySource.id}. Duplicates to merge/delete: ${duplicateSources.map((d) => d.id).join(", ")}`,
        );

        for (const dup of duplicateSources) {
            // Reassign chats
            for (const chat of dup.chats) {
                console.log(`Reassigning chat ${chat.id} to primary source ${primarySource.id}`);
                await prisma.chat.update({
                    where: { id: chat.id },
                    data: {
                        chatSources: {
                            disconnect: { id: dup.id },
                            connect: { id: primarySource.id },
                        },
                    },
                });
            }

            // Reassign or delete pagesIndexed
            if (dup.pagesIndexed.length > 0) {
                console.log(
                    `Moving ${dup.pagesIndexed.length} indexed pages to primary source ${primarySource.id}`,
                );
                await prisma.documentPage.updateMany({
                    where: { chatSourceId: dup.id },
                    data: { chatSourceId: primarySource.id },
                });
            }

            // Reassign or delete documentTree
            if (dup.documentTree) {
                if (!primarySource.documentTree) {
                    console.log(`Moving document tree to primary source ${primarySource.id}`);
                    await prisma.documentTree.update({
                        where: { id: dup.documentTree.id },
                        data: { chatSourceId: primarySource.id },
                    });
                } else {
                    console.log(`Deleting duplicate document tree ${dup.documentTree.id}`);
                    await prisma.documentTree.delete({
                        where: { id: dup.documentTree.id },
                    });
                }
            }

            // Reassign IngestionRuns if any
            await prisma.ingestionRun.updateMany({
                where: { chatSourceId: dup.id },
                data: { chatSourceId: primarySource.id },
            });

            // Delete the duplicate ChatSource
            console.log(`Deleting duplicate source ${dup.id}`);
            await prisma.chatSource.delete({
                where: { id: dup.id },
            });
        }
    }

    console.log("Cleanup completed successfully.");
}

main()
    .catch((e) => {
        console.error("Error during cleanup:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
