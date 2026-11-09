import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("PharmaChain", function () {
  async function setup() {
    const [owner, manufacturer, distributor, pharmacy, stranger] =
      await ethers.getSigners();
    const pharma = await ethers.deployContract("PharmaChain");
    await pharma.setAuthorized(manufacturer.address, true);
    return { pharma, owner, manufacturer, distributor, pharmacy, stranger };
  }

  it("makes the deployer the owner and an authorized account", async function () {
    const { pharma, owner } = await setup();
    expect(await pharma.owner()).to.equal(owner.address);
    expect(await pharma.authorized(owner.address)).to.equal(true);
  });

  it("registers a batch and records the first custody entry", async function () {
    const { pharma, manufacturer } = await setup();

    await expect(
      pharma.connect(manufacturer).registerBatch("B001", "Vaccine X", "Factory, Kolkata")
    )
      .to.emit(pharma, "BatchRegistered")
      .withArgs("B001", "Vaccine X", manufacturer.address);

    const batch = await pharma.getBatch("B001");
    expect(batch.drugName).to.equal("Vaccine X");
    expect(batch.currentHolder).to.equal(manufacturer.address);
    expect(batch.status).to.equal(0n);

    const history = await pharma.getHistory("B001");
    expect(history.length).to.equal(1);
  });

  it("rejects batch registration from an unauthorized account", async function () {
    const { pharma, stranger } = await setup();
    await expect(
      pharma.connect(stranger).registerBatch("B001", "Vaccine X", "Factory")
    ).to.be.revertedWith("Not authorized");
  });

  it("rejects registering the same batch twice", async function () {
    const { pharma, manufacturer } = await setup();
    await pharma.connect(manufacturer).registerBatch("B001", "Vaccine X", "Factory");
    await expect(
      pharma.connect(manufacturer).registerBatch("B001", "Vaccine X", "Factory")
    ).to.be.revertedWith("Batch already registered");
  });

  it("lets the current holder transfer custody", async function () {
    const { pharma, manufacturer, distributor } = await setup();
    await pharma.connect(manufacturer).registerBatch("B001", "Vaccine X", "Factory");

    await expect(
      pharma.connect(manufacturer).transferCustody("B001", distributor.address, "Warehouse, Howrah")
    )
      .to.emit(pharma, "CustodyTransferred")
      .withArgs("B001", manufacturer.address, distributor.address, "Warehouse, Howrah");

    const batch = await pharma.getBatch("B001");
    expect(batch.currentHolder).to.equal(distributor.address);
    expect((await pharma.getHistory("B001")).length).to.equal(2);
  });

  it("rejects a transfer from someone who is not the current holder", async function () {
    const { pharma, manufacturer, distributor, stranger } = await setup();
    await pharma.connect(manufacturer).registerBatch("B001", "Vaccine X", "Factory");
    await expect(
      pharma.connect(stranger).transferCustody("B001", distributor.address, "Anywhere")
    ).to.be.revertedWith("Only current holder can transfer");
  });

  it("tracks a full journey from factory to distributor to pharmacy", async function () {
    const { pharma, manufacturer, distributor, pharmacy } = await setup();
    await pharma.connect(manufacturer).registerBatch("B001", "Vaccine X", "Factory");
    await pharma.connect(manufacturer).transferCustody("B001", distributor.address, "Warehouse");
    await pharma.connect(distributor).transferCustody("B001", pharmacy.address, "Pharmacy");

    const history = await pharma.getHistory("B001");
    expect(history.length).to.equal(3);
    expect((await pharma.getBatch("B001")).currentHolder).to.equal(pharmacy.address);
  });

  it("flags a batch as compromised and freezes further transfers", async function () {
    const { pharma, owner, manufacturer, distributor } = await setup();
    await pharma.connect(manufacturer).registerBatch("B001", "Vaccine X", "Factory");

    await expect(pharma.flagCompromised("B001", "Temperature breach"))
      .to.emit(pharma, "BatchFlagged")
      .withArgs("B001", "Temperature breach", owner.address);

    expect((await pharma.getBatch("B001")).status).to.equal(1n);

    await expect(
      pharma.connect(manufacturer).transferCustody("B001", distributor.address, "Warehouse")
    ).to.be.revertedWith("Batch is not active");

    await expect(
      pharma.flagCompromised("B001", "Again")
    ).to.be.revertedWith("Already compromised");
  });

  it("rejects flagging from an unauthorized account", async function () {
    const { pharma, manufacturer, stranger } = await setup();
    await pharma.connect(manufacturer).registerBatch("B001", "Vaccine X", "Factory");
    await expect(
      pharma.connect(stranger).flagCompromised("B001", "Fake report")
    ).to.be.revertedWith("Not authorized");
  });

  it("anchors a hash of sensor readings on-chain", async function () {
    const { pharma, manufacturer } = await setup();
    await pharma.connect(manufacturer).registerBatch("B001", "Vaccine X", "Factory");

    const hash = ethers.keccak256(ethers.toUtf8Bytes("4.2,4.5,9.8"));
    await pharma.anchorTempHash("B001", hash);

    const logs = await pharma.getTempLogs("B001");
    expect(logs.length).to.equal(1);
    expect(logs[0].dataHash).to.equal(hash);
  });

  it("reverts when looking up a batch that does not exist", async function () {
    const { pharma } = await setup();
    await expect(pharma.getBatch("NOPE")).to.be.revertedWith("Batch not found");
  });
});