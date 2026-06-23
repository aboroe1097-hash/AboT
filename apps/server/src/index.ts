import { createAboTServer } from "./server.js";

const port = Number(process.env.ABOT_PORT ?? 3217);
const host = process.env.ABOT_HOST ?? "127.0.0.1";

const server = createAboTServer();

server.listen(port, host, () => {
  console.log(`AboT v0.01 running at http://${host}:${port}`);
});

