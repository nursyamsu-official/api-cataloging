-- CreateTable
CREATE TABLE "Unspsc" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "level_name" TEXT NOT NULL,

    CONSTRAINT "Unspsc_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Unspsc_code_key" ON "Unspsc"("code");
