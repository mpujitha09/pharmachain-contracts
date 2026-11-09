// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract PharmaChain {
    enum Status { Active, Compromised }

    struct Batch {
        string batchId;
        string drugName;
        address manufacturer;
        address currentHolder;
        Status status;
        uint256 registeredAt;
        bool exists;
    }

    struct CustodyRecord {
        address from;
        address to;
        string location;
        uint256 timestamp;
    }

    struct TempLog {
        bytes32 dataHash;
        uint256 timestamp;
    }

    address public owner;
    mapping(address => bool) public authorized;

    mapping(string => Batch) private batches;
    mapping(string => CustodyRecord[]) private history;
    mapping(string => TempLog[]) private tempLogs;

    event BatchRegistered(string batchId, string drugName, address indexed manufacturer);
    event CustodyTransferred(string batchId, address indexed from, address indexed to, string location);
    event TempHashAnchored(string batchId, bytes32 dataHash);
    event BatchFlagged(string batchId, string reason, address indexed reporter);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyAuthorized() {
        require(authorized[msg.sender], "Not authorized");
        _;
    }

    modifier batchExists(string memory batchId) {
        require(batches[batchId].exists, "Batch not found");
        _;
    }

    constructor() {
        owner = msg.sender;
        authorized[msg.sender] = true;
    }

    // Owner grants or revokes permission (manufacturers, distributors, backend reporter)
    function setAuthorized(address account, bool allowed) external onlyOwner {
        authorized[account] = allowed;
    }

    function registerBatch(
        string memory batchId,
        string memory drugName,
        string memory location
    ) external onlyAuthorized {
        require(!batches[batchId].exists, "Batch already registered");

        batches[batchId] = Batch(
            batchId,
            drugName,
            msg.sender,
            msg.sender,
            Status.Active,
            block.timestamp,
            true
        );
        history[batchId].push(CustodyRecord(address(0), msg.sender, location, block.timestamp));

        emit BatchRegistered(batchId, drugName, msg.sender);
    }

    function transferCustody(
        string memory batchId,
        address newHolder,
        string memory location
    ) external batchExists(batchId) {
        Batch storage b = batches[batchId];
        require(msg.sender == b.currentHolder, "Only current holder can transfer");
        require(b.status == Status.Active, "Batch is not active");
        require(newHolder != address(0), "Invalid recipient");

        address previous = b.currentHolder;
        b.currentHolder = newHolder;
        history[batchId].push(CustodyRecord(previous, newHolder, location, block.timestamp));

        emit CustodyTransferred(batchId, previous, newHolder, location);
    }

    // Stores only the hash of a batch of sensor readings, not the raw data
    function anchorTempHash(
        string memory batchId,
        bytes32 dataHash
    ) external onlyAuthorized batchExists(batchId) {
        tempLogs[batchId].push(TempLog(dataHash, block.timestamp));
        emit TempHashAnchored(batchId, dataHash);
    }

    // Called by the backend when the ML models detect a breach or a fake
    function flagCompromised(
        string memory batchId,
        string memory reason
    ) external onlyAuthorized batchExists(batchId) {
        Batch storage b = batches[batchId];
        require(b.status == Status.Active, "Already compromised");

        b.status = Status.Compromised;
        emit BatchFlagged(batchId, reason, msg.sender);
    }

    function getBatch(string memory batchId)
        external view batchExists(batchId) returns (Batch memory)
    {
        return batches[batchId];
    }

    function getHistory(string memory batchId)
        external view batchExists(batchId) returns (CustodyRecord[] memory)
    {
        return history[batchId];
    }

    function getTempLogs(string memory batchId)
        external view batchExists(batchId) returns (TempLog[] memory)
    {
        return tempLogs[batchId];
    }
}