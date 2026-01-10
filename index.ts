import { StarManagerAgent } from "./src/agent";

async function main() {
  const agent = new StarManagerAgent();
  await agent.run();
}

main().catch(console.error);
