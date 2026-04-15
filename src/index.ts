import { loadConfig } from './config.js';
import { createDatabase } from './db/client.js';
import { bootstrapDatabase } from './db/bootstrap.js';
import { buildServer } from './server.js';

async function main() {
  const config = loadConfig();
  const database = createDatabase(config);
  await bootstrapDatabase(database.db);

  const server = await buildServer({ config, database });
  await server.listen({ host: config.host, port: config.port });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
