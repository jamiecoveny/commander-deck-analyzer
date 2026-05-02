-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deck" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "commander" TEXT NOT NULL,
    "partner" TEXT,
    "colorIdentity" TEXT NOT NULL,
    "bracket" INTEGER,
    "archetype" TEXT,
    "sourceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeckCard" (
    "id" TEXT NOT NULL,
    "deckId" TEXT NOT NULL,
    "cardName" TEXT NOT NULL,
    "oracleId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "isCommander" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DeckCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Card" (
    "oracleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "manaCost" TEXT,
    "cmc" DOUBLE PRECISION NOT NULL,
    "typeLine" TEXT NOT NULL,
    "oracleText" TEXT NOT NULL,
    "colorIdentity" TEXT NOT NULL,
    "categoriesJson" TEXT NOT NULL DEFAULT '[]',
    "edhrecRank" INTEGER,
    "priceUsd" DOUBLE PRECISION,
    "priceCad" DOUBLE PRECISION,
    "priceUpdatedAt" TIMESTAMP(3),

    CONSTRAINT "Card_pkey" PRIMARY KEY ("oracleId")
);

-- CreateTable
CREATE TABLE "Analysis" (
    "id" TEXT NOT NULL,
    "deckId" TEXT NOT NULL,
    "bracketEstimate" INTEGER NOT NULL,
    "rampCount" INTEGER NOT NULL,
    "drawCount" INTEGER NOT NULL,
    "removalCount" INTEGER NOT NULL,
    "wipesCount" INTEGER NOT NULL,
    "countersCount" INTEGER NOT NULL,
    "avgCmc" DOUBLE PRECISION NOT NULL,
    "combos" JSONB NOT NULL,
    "recommendations" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Analysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Playtest" (
    "id" TEXT NOT NULL,
    "deckId" TEXT NOT NULL,
    "games" INTEGER NOT NULL,
    "opponents" JSONB NOT NULL,
    "results" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Playtest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Deck_userId_idx" ON "Deck"("userId");

-- CreateIndex
CREATE INDEX "DeckCard_deckId_idx" ON "DeckCard"("deckId");

-- CreateIndex
CREATE INDEX "DeckCard_oracleId_idx" ON "DeckCard"("oracleId");

-- CreateIndex
CREATE UNIQUE INDEX "Card_name_key" ON "Card"("name");

-- CreateIndex
CREATE INDEX "Card_edhrecRank_idx" ON "Card"("edhrecRank");

-- CreateIndex
CREATE INDEX "Analysis_deckId_idx" ON "Analysis"("deckId");

-- CreateIndex
CREATE INDEX "Playtest_deckId_idx" ON "Playtest"("deckId");

-- AddForeignKey
ALTER TABLE "Deck" ADD CONSTRAINT "Deck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeckCard" ADD CONSTRAINT "DeckCard_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "Deck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Analysis" ADD CONSTRAINT "Analysis_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "Deck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Playtest" ADD CONSTRAINT "Playtest_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "Deck"("id") ON DELETE CASCADE ON UPDATE CASCADE;
