import { createApiServer } from "./server.js";

const port = Number(process.env.PORT ?? 8787);
const server = createApiServer();
server.listen(port, () => {
  process.stdout.write(`vigil api listening on ${port}\n`);
});
