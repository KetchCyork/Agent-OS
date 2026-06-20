import { runRemoteNodeRegistryTests } from "./remote-node-registry.test.ts";
import { runServerTests } from "./server.test.ts";
import { runRemoteMemoryTests } from "./remote-memory.test.ts";
import { runMeshStatusTests } from "./mesh-status.test.ts";
import { runInboundGatewayTests } from "./inbound-gateway.test.ts";

async function main() {
  console.log("Running open-agent-os cross-machine tests...");

  try {
    await runRemoteNodeRegistryTests();
    console.log("✓ Remote node registry tests passed");

    await runServerTests();
    console.log("✓ Server endpoint tests passed");

    await runRemoteMemoryTests();
    console.log("✓ Remote memory client tests passed");

    await runMeshStatusTests();
    console.log("✓ Mesh status + dashboard tests passed");

    await runInboundGatewayTests();
    console.log("✓ Inbound gateway tests passed");

    console.log("All tests passed.");
    console.log("Active handles:");
    for (const handle of process._getActiveHandles()) {
      const name = handle.constructor.name;
      const info: Record<string, unknown> = { name };
      if (name === "Server") {
        try { info.address = handle.address(); } catch { info.address = "unknown"; }
      }
      if (name === "Socket") {
        try {
          info.remoteAddress = handle.remoteAddress;
          info.remotePort = handle.remotePort;
          info.localAddress = handle.localAddress;
          info.localPort = handle.localPort;
        } catch {}
      }
      console.log(info);
    }
    process.exit(0);
  } catch (err) {
    console.error("Test failure:", err);
    console.log("Active handles:", process._getActiveHandles().map((h) => h.constructor.name));
    process.exit(1);
  }
}

main();
