const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
    const usuario = await prisma.usuario.findUnique({
        where: { email: "juanfetorres1@gmail.com" },
        select: {
            email: true,
            rol: true,
            estado: true
        }
    });

    console.log(usuario);
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });
