import { network } from "hardhat";
import { readFileSync } from "node:fs";

const { ethers } = await network.connect();

const addresses = JSON.parse(
  readFileSync("shared/deployed_addresses.json", "utf8")
);
const address = addresses["PharmaChainModule#PharmaChain"];

const [owner, backend, manufacturer] = await ethers.getSigners();
const pharma = await ethers.getContractAt("PharmaChain", address);

console.log("Contract:         ", address);
console.log("Owner:            ", owner.address);
console.log("Backend reporter: ", backend.address);
console.log("Manufacturer:     ", manufacturer.address);

// Owner approves the backend and a manufacturer
await (await pharma.connect(owner).setAuthorized(backend.address, true)).wait();
await (await pharma.connect(owner).setAuthorized(manufacturer.address, true)).wait();
console.log("\nAuthorized backend and manufacturer");

// Manufacturer registers a batch (unique id so the script can be re-run)
const batchId = `DEMO-${Date.now()}`;
await (
  await pharma.connect(manufacturer).registerBatch(batchId, "Vaccine X", "Factory, Kolkata")
).wait();
console.log("Registered batch:", batchId);

// Backend anchors a hash of sensor readings
const hash = ethers.keccak256(ethers.toUtf8Bytes("4.2,4.5,9.8"));
await (await pharma.connect(backend).anchorTempHash(batchId, hash)).wait();
console.log("Anchored temperature hash");

// Backend flags the batch, as it would after an ML detection
await (
  await pharma.connect(backend).flagCompromised(batchId, "Temperature breach")
).wait();

const batch = await pharma.getBatch(batchId);
const history = await pharma.getHistory(batchId);
const logs = await pharma.getTempLogs(batchId);

console.log("\nStatus (0 = Active, 1 = Compromised):", batch.status.toString());
console.log("Custody records:", history.length);
console.log("Temperature hashes anchored:", logs.length);