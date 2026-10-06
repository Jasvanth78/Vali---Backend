const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');

async function main() {
  const allUsers = await prisma.user.findMany({
    orderBy: {
      createdAt: 'asc',
    },
    select: {
      name: true,
      email: true,
      createdAt: true
    }
  });

  let markdownContent = `# Current Users List\n\n`;
  markdownContent += `Total Users in Database: ${allUsers.length}\n\n`;
  
  markdownContent += `| Name | Email | Created At |\n`;
  markdownContent += `|------|-------|------------|\n`;
  
  allUsers.forEach(u => {
    markdownContent += `| ${u.name} | ${u.email} | ${new Date(u.createdAt).toLocaleDateString()} |\n`;
  });

  const targetDir = 'C:\\Users\\LENOVO\\.gemini\\antigravity-ide\\brain\\447ec17a-a083-4b76-8766-d70aee9fa93f';
  const artifactPath = path.join(targetDir, 'current_users_list.md');
  
  fs.writeFileSync(artifactPath, markdownContent);
  console.log('Artifact created at ' + artifactPath);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
