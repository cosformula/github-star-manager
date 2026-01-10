import { StarManagerAgent } from "./agent";

const agent = new StarManagerAgent();
agent.run().catch((e) => {
  console.error(e);
  process.exit(1);
});
