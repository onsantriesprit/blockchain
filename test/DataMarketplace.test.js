const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DataMarketplace - Tests Complets", function() {
    let dataToken, rewardDistributor, datasetRegistry;
    let owner, user1, user2, user3;

    const IPFS_HASH = "QmTestHash123456789abcdef";
    const CONTENT_HASH = ethers.keccak256(ethers.toUtf8Bytes("test_image_content"));
    const PRICE = ethers.parseEther("0.01");
    const METADATA = JSON.stringify({ title: "Test Dataset" });

    beforeEach(async function() {
        [owner, user1, user2, user3] = await ethers.getSigners();

        const DataToken = await ethers.getContractFactory("DataToken");
        dataToken = await DataToken.deploy(owner.address);
        await dataToken.waitForDeployment();

        const RewardDistributor = await ethers.getContractFactory("RewardDistributor");
        rewardDistributor = await RewardDistributor.deploy(await dataToken.getAddress());
        await rewardDistributor.waitForDeployment();

        const DatasetRegistry = await ethers.getContractFactory("DatasetRegistry");
        datasetRegistry = await DatasetRegistry.deploy();
        await datasetRegistry.waitForDeployment();

        const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
        await dataToken.grantRole(MINTER_ROLE, await rewardDistributor.getAddress());
        await rewardDistributor.setRegistryContract(await datasetRegistry.getAddress());
    });

    describe("DataToken", function() {
        it("Doit avoir le bon nom et symbole", async function() {
            expect(await dataToken.name()).to.equal("DataToken");
            expect(await dataToken.symbol()).to.equal("DTK");
        });
        it("Doit avoir une supply initiale correcte", async function() {
            const balance = await dataToken.balanceOf(owner.address);
            expect(balance).to.equal(ethers.parseEther("100000000"));
        });
        it("Doit refuser le mint sans MINTER_ROLE", async function() {
            await expect(
                dataToken.connect(user1).mintReward(user2.address, ethers.parseEther("100"), "test")
            ).to.be.reverted;
        });
        it("Doit minter avec MINTER_ROLE", async function() {
            const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
            await dataToken.grantRole(MINTER_ROLE, user1.address);
            await dataToken.connect(user1).mintReward(user2.address, ethers.parseEther("500"), "test");
            expect(await dataToken.balanceOf(user2.address)).to.equal(ethers.parseEther("500"));
        });
        it("Doit refuser mint si adresse zero", async function() {
            const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
            await dataToken.grantRole(MINTER_ROLE, user1.address);
            await expect(
                dataToken.connect(user1).mintReward(ethers.ZeroAddress, ethers.parseEther("100"), "test")
            ).to.be.revertedWith("Invalid address");
        });
        it("Doit retourner la supply restante", async function() {
            const remaining = await dataToken.remainingSupply();
            expect(remaining).to.equal(ethers.parseEther("900000000"));
        });
        it("Ne doit pas depasser la supply max", async function() {
            const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
            await dataToken.grantRole(MINTER_ROLE, user1.address);
            await expect(
                dataToken.connect(user1).mintReward(user2.address, ethers.parseEther("999999999"), "test")
            ).to.be.revertedWith("Max supply exceeded");
        });
        it("Doit permettre le burn avec BURNER_ROLE", async function() {
            const BURNER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("BURNER_ROLE"));
            await dataToken.grantRole(BURNER_ROLE, owner.address);
            await dataToken.approve(owner.address, ethers.parseEther("100"));
            await dataToken.burnFrom(owner.address, ethers.parseEther("100"));
            const balance = await dataToken.balanceOf(owner.address);
            expect(balance).to.equal(ethers.parseEther("99999900"));
        });
    });

    describe("DatasetRegistry", function() {
        it("Doit enregistrer un dataset", async function() {
            await datasetRegistry.connect(user1).registerDataset(IPFS_HASH, CONTENT_HASH, PRICE, 0, METADATA);
            const dataset = await datasetRegistry.datasets(1);
            expect(dataset.ipfsHash).to.equal(IPFS_HASH);
            expect(dataset.owner).to.equal(user1.address);
            expect(dataset.isActive).to.equal(true);
        });
        it("Doit incrementer le nextDatasetId", async function() {
            await datasetRegistry.connect(user1).registerDataset(IPFS_HASH, CONTENT_HASH, PRICE, 0, METADATA);
            expect(await datasetRegistry.nextDatasetId()).to.equal(2);
        });
        it("Doit detecter les doublons", async function() {
            await datasetRegistry.connect(user1).registerDataset(IPFS_HASH, CONTENT_HASH, PRICE, 0, METADATA);
            await expect(
                datasetRegistry.connect(user2).registerDataset("QmAutre", CONTENT_HASH, PRICE, 0, METADATA)
            ).to.be.revertedWith("Duplicate content detected");
        });
        it("Doit refuser hash IPFS vide", async function() {
            await expect(
                datasetRegistry.connect(user1).registerDataset("", CONTENT_HASH, PRICE, 0, METADATA)
            ).to.be.revertedWith("Empty IPFS hash");
        });
        it("Doit refuser content hash vide", async function() {
            await expect(
                datasetRegistry.connect(user1).registerDataset(IPFS_HASH, ethers.ZeroHash, PRICE, 0, METADATA)
            ).to.be.revertedWith("Empty content hash");
        });
        it("Doit permettre l achat", async function() {
            await datasetRegistry.connect(user1).registerDataset(IPFS_HASH, CONTENT_HASH, PRICE, 0, METADATA);
            await datasetRegistry.connect(user2).purchaseAccess(1, { value: PRICE });
            expect(await datasetRegistry.accessGranted(1, user2.address)).to.equal(true);
        });
        it("Doit incrementer usageCount apres achat", async function() {
            await datasetRegistry.connect(user1).registerDataset(IPFS_HASH, CONTENT_HASH, PRICE, 0, METADATA);
            await datasetRegistry.connect(user2).purchaseAccess(1, { value: PRICE });
            const dataset = await datasetRegistry.datasets(1);
            expect(dataset.usageCount).to.equal(1);
        });
        it("Doit refuser paiement insuffisant", async function() {
            await datasetRegistry.connect(user1).registerDataset(IPFS_HASH, CONTENT_HASH, PRICE, 0, METADATA);
            await expect(
                datasetRegistry.connect(user2).purchaseAccess(1, { value: ethers.parseEther("0.001") })
            ).to.be.revertedWith("Insufficient payment");
        });
        it("Doit refuser double achat", async function() {
            await datasetRegistry.connect(user1).registerDataset(IPFS_HASH, CONTENT_HASH, PRICE, 0, METADATA);
            await datasetRegistry.connect(user2).purchaseAccess(1, { value: PRICE });
            await expect(
                datasetRegistry.connect(user2).purchaseAccess(1, { value: PRICE })
            ).to.be.revertedWith("Already purchased");
        });
        it("Doit refuser achat par le owner", async function() {
            await datasetRegistry.connect(user1).registerDataset(IPFS_HASH, CONTENT_HASH, PRICE, 0, METADATA);
            await expect(
                datasetRegistry.connect(user1).purchaseAccess(1, { value: PRICE })
            ).to.be.revertedWith("Owner already has access");
        });
        it("Doit permettre update du prix", async function() {
            await datasetRegistry.connect(user1).registerDataset(IPFS_HASH, CONTENT_HASH, PRICE, 0, METADATA);
            await datasetRegistry.connect(user1).updatePrice(1, ethers.parseEther("0.05"));
            const dataset = await datasetRegistry.datasets(1);
            expect(dataset.price).to.equal(ethers.parseEther("0.05"));
        });
        it("Doit refuser update prix par non-owner", async function() {
            await datasetRegistry.connect(user1).registerDataset(IPFS_HASH, CONTENT_HASH, PRICE, 0, METADATA);
            await expect(
                datasetRegistry.connect(user2).updatePrice(1, ethers.parseEther("0.05"))
            ).to.be.revertedWith("Not dataset owner");
        });
        it("Doit desactiver un dataset", async function() {
            await datasetRegistry.connect(user1).registerDataset(IPFS_HASH, CONTENT_HASH, PRICE, 0, METADATA);
            await datasetRegistry.connect(user1).deactivateDataset(1);
            const dataset = await datasetRegistry.datasets(1);
            expect(dataset.isActive).to.equal(false);
        });
        it("Doit refuser achat dataset inactif", async function() {
            await datasetRegistry.connect(user1).registerDataset(IPFS_HASH, CONTENT_HASH, PRICE, 0, METADATA);
            await datasetRegistry.connect(user1).deactivateDataset(1);
            await expect(
                datasetRegistry.connect(user2).purchaseAccess(1, { value: PRICE })
            ).to.be.revertedWith("Dataset not active");
        });
        it("Doit retourner les datasets du owner", async function() {
            await datasetRegistry.connect(user1).registerDataset(IPFS_HASH, CONTENT_HASH, PRICE, 0, METADATA);
            const hash2 = ethers.keccak256(ethers.toUtf8Bytes("content2"));
            await datasetRegistry.connect(user1).registerDataset("QmHash2", hash2, PRICE, 1, METADATA);
            const datasets = await datasetRegistry.getOwnerDatasets(user1.address);
            expect(datasets.length).to.equal(2);
        });
        it("Doit permettre withdrawal des fees par owner", async function() {
            await datasetRegistry.connect(user1).registerDataset(IPFS_HASH, CONTENT_HASH, PRICE, 0, METADATA);
            await datasetRegistry.connect(user2).purchaseAccess(1, { value: PRICE });
            const balBefore = await ethers.provider.getBalance(user3.address);
            await datasetRegistry.withdrawFees(user3.address);
            const balAfter = await ethers.provider.getBalance(user3.address);
            expect(balAfter).to.be.gt(balBefore);
        });
        it("Doit refuser withdrawal si pas owner", async function() {
            await expect(
                datasetRegistry.connect(user1).withdrawFees(user1.address)
            ).to.be.reverted;
        });
        it("Doit permettre update des fees plateforme", async function() {
            await datasetRegistry.setPlatformFee(10);
            expect(await datasetRegistry.platformFeePercent()).to.equal(10);
        });
        it("Doit refuser fees trop eleves", async function() {
            await expect(datasetRegistry.setPlatformFee(25)).to.be.revertedWith("Fee too high");
        });
        it("Doit verifier doublon via checkDuplicate", async function() {
            await datasetRegistry.connect(user1).registerDataset(IPFS_HASH, CONTENT_HASH, PRICE, 0, METADATA);
            const [exists, id] = await datasetRegistry.checkDuplicate(CONTENT_HASH);
            expect(exists).to.equal(true);
            expect(id).to.equal(1);
        });
    });

    describe("RewardDistributor", function() {
        it("Doit enregistrer un utilisateur", async function() {
            await rewardDistributor.connect(user1).registerUser(ethers.ZeroAddress);
            const stats = await rewardDistributor.userStats(user1.address);
            expect(stats.registered).to.equal(true);
            expect(stats.level).to.equal(1);
        });
        it("Doit refuser double inscription", async function() {
            await rewardDistributor.connect(user1).registerUser(ethers.ZeroAddress);
            await expect(
                rewardDistributor.connect(user1).registerUser(ethers.ZeroAddress)
            ).to.be.revertedWith("Already registered");
        });
        it("Doit donner bonus parrainage", async function() {
            await rewardDistributor.connect(user1).registerUser(ethers.ZeroAddress);
            await rewardDistributor.connect(user2).registerUser(user1.address);
            expect(await dataToken.balanceOf(user1.address)).to.equal(ethers.parseEther("20"));
        });
        it("Doit recompenser upload dataset", async function() {
            await rewardDistributor.connect(user1).registerUser(ethers.ZeroAddress);
            await rewardDistributor.rewardDatasetUpload(user1.address, 1, 100);
            const balance = await dataToken.balanceOf(user1.address);
            expect(balance).to.be.gt(ethers.parseEther("50"));
        });
        it("Doit refuser double recompense upload", async function() {
            await rewardDistributor.rewardDatasetUpload(user1.address, 1, 75);
            await expect(
                rewardDistributor.rewardDatasetUpload(user1.address, 1, 75)
            ).to.be.revertedWith("Already rewarded");
        });
        it("Doit recompenser usage dataset", async function() {
            await rewardDistributor.rewardDatasetUsage(user1.address, 1);
            expect(await dataToken.balanceOf(user1.address)).to.equal(ethers.parseEther("10"));
        });
        it("Doit recompenser tache completee", async function() {
            await rewardDistributor.connect(user1).registerUser(ethers.ZeroAddress);
            await rewardDistributor.rewardTaskCompletion(user1.address, 1, 100);
            expect(await dataToken.balanceOf(user1.address)).to.equal(ethers.parseEther("100"));
        });
        it("Doit appliquer multiplicateur tache", async function() {
            await rewardDistributor.connect(user1).registerUser(ethers.ZeroAddress);
            await rewardDistributor.rewardTaskCompletion(user1.address, 1, 200);
            expect(await dataToken.balanceOf(user1.address)).to.equal(ethers.parseEther("200"));
        });
        it("Doit refuser double recompense tache", async function() {
            await rewardDistributor.connect(user1).registerUser(ethers.ZeroAddress);
            await rewardDistributor.rewardTaskCompletion(user1.address, 1, 100);
            await expect(
                rewardDistributor.rewardTaskCompletion(user1.address, 1, 100)
            ).to.be.revertedWith("Task already rewarded");
        });
        it("Doit monter au niveau 2 apres 600 DTK", async function() {
            await rewardDistributor.connect(user1).registerUser(ethers.ZeroAddress);
            for (let i = 1; i <= 6; i++) {
                await rewardDistributor.rewardTaskCompletion(user1.address, i, 100);
            }
            const stats = await rewardDistributor.userStats(user1.address);
            expect(stats.level).to.equal(2);
        });
        it("Doit retourner le profil complet", async function() {
            await rewardDistributor.connect(user1).registerUser(ethers.ZeroAddress);
            await rewardDistributor.rewardTaskCompletion(user1.address, 1, 100);
            const profile = await rewardDistributor.getUserProfile(user1.address);
            expect(profile.totalEarned).to.equal(ethers.parseEther("100"));
            expect(profile.tasksCompleted).to.equal(1);
            expect(profile.tokenBalance).to.equal(ethers.parseEther("100"));
        });
        it("Doit permettre update des montants reward", async function() {
            await rewardDistributor.updateRewardAmounts(
                ethers.parseEther("100"), ethers.parseEther("200"),
                ethers.parseEther("20"), ethers.parseEther("30")
            );
            expect(await rewardDistributor.rewardUpload()).to.equal(ethers.parseEther("100"));
        });
        it("Doit refuser update rewards par non-owner", async function() {
            await expect(
                rewardDistributor.connect(user1).updateRewardAmounts(
                    ethers.parseEther("100"), ethers.parseEther("200"),
                    ethers.parseEther("20"), ethers.parseEther("30")
                )
            ).to.be.reverted;
        });
    });
});