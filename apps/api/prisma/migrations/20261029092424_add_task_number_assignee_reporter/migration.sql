/*
  Warnings:

  - A unique constraint covering the columns `[project_id,number]` on the table `tasks` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `number` to the `tasks` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "last_task_number" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "assignee_id" UUID,
ADD COLUMN     "number" INTEGER NOT NULL,
ADD COLUMN     "reporter_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "tasks_project_id_number_key" ON "tasks"("project_id", "number");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
