/*
  Warnings:

  - Added the required column `owner_id` to the `projects` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ProjectMemberRole" AS ENUM ('owner', 'member', 'viewer');

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "owner_id" UUID NOT NULL;

-- CreateTable
CREATE TABLE "project_members" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "ProjectMemberRole" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_members_project_id_user_id_key" ON "project_members"("project_id", "user_id");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
