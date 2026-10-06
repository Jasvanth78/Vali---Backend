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

  const guestUsers = allUsers.filter(u => u.email.endsWith('@valikatti.app') || u.name === 'Guest User');
  const realUsers = allUsers.filter(u => !(u.email.endsWith('@valikatti.app') || u.name === 'Guest User'));

  let markdownContent = `# User Analysis\n\n`;
  markdownContent += `Total Users in Database: ${allUsers.length}\n`;
  markdownContent += `Guest Users (auto-generated): ${guestUsers.length}\n`;
  markdownContent += `Real Users: ${realUsers.length}\n\n`;
  
  markdownContent += `## Real Users Email List\n\n`;
  markdownContent += `| Name | Email | Created At |\n`;
  markdownContent += `|------|-------|------------|\n`;
  
  realUsers.forEach(u => {
    markdownContent += `| ${u.name} | ${u.email} | ${new Date(u.createdAt).toLocaleDateString()} |\n`;
  });

  const appDataDir = process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + "/.local/share");
  // The system mounts artifacts here: C:\Users\LENOVO\.gemini\antigravity-ide\brain\447ec17a-a083-4b76-8766-d70aee9fa93f
  const targetDir = 'C:\\Users\\LENOVO\\.gemini\\antigravity-ide\\brain\\447ec17a-a083-4b76-8766-d70aee9fa93f';
  const artifactPath = path.join(targetDir, 'real_users_list.md');
  
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
